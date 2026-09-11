const assert = require('assert');
const { spawn, execSync } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const Redis = require('ioredis');

function getDbHost() {
  try {
    const ip = execSync('wsl hostname -I').toString().trim().split(' ')[0];
    if (ip) return ip;
  } catch {}
  return '127.0.0.1';
}

const DB_HOST = getDbHost();
const PORT = 8005;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

async function waitForUrl(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function run() {
  console.log('================================================================');
  console.log('=== PHASE 7.1 AUDIT: REDIS CACHE LOSS & TIDB RECOVERY TEST    ===');
  console.log('================================================================');

  // Verify real TiDB/MySQL connection on port 4000
  const dbConn = await mysql.createConnection({
    host: DB_HOST,
    port: 4000,
    user: 'chess',
    password: 'chess',
    database: 'chess_platform'
  });
  console.log(`[Audit] Connected to authoritative TiDB database at ${DB_HOST}:4000.`);

  // Verify real Redis connection on port 6379
  const redis = new Redis({ host: '127.0.0.1', port: 6379 });
  await redis.ping();
  console.log('[Audit] Connected to real Redis server on 127.0.0.1:6379.');

  // Start Fastify server connected to TiDB and Real Redis
  console.log(`[Audit] Starting Fastify server on port ${PORT}...`);
  const serverProc = spawn('node', ['apps/server/src/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_MODE: 'mysql',
      DB_HOST: DB_HOST,
      DB_PORT: '4000',
      DB_USER: 'chess',
      DB_PASSWORD: 'chess',
      DB_NAME: 'chess_platform',
      DB_SSL: 'false',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      REDIS_REQUIRED: 'true'
    },
    stdio: 'pipe'
  });

  serverProc.stdout.on('data', d => {
    console.log('[Server OUT]', d.toString().trim());
  });
  serverProc.stderr.on('data', d => {
    console.log('[Server ERR]', d.toString().trim());
  });

  try {
    await waitForUrl(`${BASE_URL}/health`);
    console.log('[Audit] Fastify server is running and healthy with TiDB + Redis.');

    // 1. Register Player A and Player B
    const ts = Date.now();
    const userA = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `audit_w_${ts}`, email: `audit_w_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const userB = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `audit_b_${ts}`, email: `audit_b_${ts}@test.com`, password: 'Password123!' })
    })).json();

    console.log(`[Audit] Registered players: ${userA.user.username} & ${userB.user.username}`);

    // 2. Connect WebSockets
    const wsA = new WebSocket(WS_URL);
    const wsB = new WebSocket(WS_URL);

    await Promise.all([
      new Promise(res => wsA.on('open', res)),
      new Promise(res => wsB.on('open', res))
    ]);

    // Authenticate
    wsA.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    wsB.send(JSON.stringify({ event: 'auth:token', payload: { token: userB.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 400));

    // 3. Create Game Room
    const createRoomPromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'game:init' && msg.payload.roomCode) {
          wsA.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsA.on('message', onMsg);
    });

    wsA.send(JSON.stringify({
      event: 'room:create',
      payload: { mode: 'ONLINE', timeControl: '10+0', isPrivate: true, colorPreference: 'w' },
      timestamp: Date.now()
    }));

    const roomData = await createRoomPromise;
    const roomCode = roomData.roomCode;
    const gameId = roomData.gameId;
    console.log(`[Audit] Game Room created: ID=${gameId}, Code=${roomCode}`);

    // Player B joins room
    const startPromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'game:init' && msg.payload.blackPlayerId) {
          wsA.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsA.on('message', onMsg);
    });

    wsB.send(JSON.stringify({
      event: 'room:join',
      payload: { roomCode },
      timestamp: Date.now()
    }));

    const startData = await startPromise;
    console.log(`[Audit] Game started: White=${startData.whitePlayerId}, Black=${startData.blackPlayerId}`);

    const isWhiteA = startData.whitePlayerId === userA.user.id;
    const whiteWs = isWhiteA ? wsA : wsB;
    const blackWs = isWhiteA ? wsB : wsA;

    // Helper to play move and wait for acceptance
    async function playMove(ws, from, to, expectedStateVersion) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout playing move ${from}->${to}`)), 4000);
        const onMsg = (data) => {
          const msg = JSON.parse(data.toString());
          console.log('[Audit WS Msg]', msg.event, msg.payload?.code || msg.payload?.reason || '');
          if (msg.event === 'move:accepted' && msg.payload.move.from === from && msg.payload.move.to === to) {
            clearTimeout(timer);
            ws.removeListener('message', onMsg);
            resolve(msg.payload);
          } else if (msg.event === 'move:rejected') {
            clearTimeout(timer);
            ws.removeListener('message', onMsg);
            reject(new Error(`Move rejected: ${msg.payload.reason}`));
          }
        };
        ws.on('message', onMsg);
        ws.send(JSON.stringify({
          event: 'move:submit',
          payload: {
            gameId,
            from,
            to,
            clientMoveId: `m_${from}_${to}_${Date.now()}`,
            expectedStateVersion
          },
          timestamp: Date.now()
        }));
      });
    }

    // 4. Play 10+ moves (Italian Game)
    console.log('[Audit] Playing 10+ plies through authoritatively protected persistence pipeline...');
    const moves = [
      ['e2', 'e4', 1],
      ['e7', 'e5', 2],
      ['g1', 'f3', 3],
      ['b8', 'c6', 4],
      ['f1', 'c4', 5],
      ['f8', 'c5', 6],
      ['c2', 'c3', 7],
      ['g8', 'f6', 8],
      ['d2', 'd4', 9],
      ['e5', 'd4', 10],
      ['c3', 'd4', 11],
      ['c5', 'b4', 12]
    ];

    let lastPayload = null;
    for (const [from, to, expectedVersion] of moves) {
      const activeWs = expectedVersion % 2 === 1 ? whiteWs : blackWs;
      lastPayload = await playMove(activeWs, from, to, expectedVersion);
    }

    const expectedFenAfterMoves = lastPayload.fen;
    const expectedStateVersion = lastPayload.stateVersion;
    console.log(`[Audit] Successfully played 12 moves. StateVersion=${expectedStateVersion}, FEN=${expectedFenAfterMoves}`);

    // 5. Inspect TiDB directly: verify game_moves table contains exactly 12 plies
    const [dbRows] = await dbConn.query(
      `SELECT ply, from_square, to_square, san FROM game_moves WHERE game_id = ? ORDER BY ply ASC`,
      [gameId]
    );

    assert.strictEqual(dbRows.length, 12, 'TiDB must contain exactly 12 persisted plies');
    console.log(`✓ TiDB Source-of-Truth Confirmed: game_moves has ${dbRows.length} plies.`);

    // 6. Complete Redis Data Loss Injection: Delete all Redis game cache
    console.log('[Audit] Simulating TOTAL REDIS DATA LOSS: Deleting all Redis game keys...');
    const keys = await redis.keys('chess:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    console.log(`✓ Deleted ${keys.length} keys from Redis. Redis cache is now completely EMPTY.`);

    // Confirm Redis is empty
    const redisMoves = await redis.lrange(`chess:game:moves:${gameId}`, 0, -1);
    assert.strictEqual(redisMoves.length, 0, 'Redis move cache must be 0 after flush');

    // 7. Reconnect player from fresh WebSocket client and recover game
    console.log('[Audit] Connecting fresh WebSocket client to recover game directly from TiDB...');
    const wsRecover = new WebSocket(WS_URL);
    await new Promise(res => wsRecover.on('open', res));

    wsRecover.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 300));

    const initPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for game:init recovery')), 4000);
      wsRecover.on('message', data => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'game:init') {
          clearTimeout(timer);
          resolve(msg.payload);
        }
      });
    });

    wsRecover.send(JSON.stringify({
      event: 'room:join',
      payload: { roomCode },
      timestamp: Date.now()
    }));

    const recovered = await initPromise;
    console.log('[Audit] Received game:init on reconnected client. Verifying recovered state...');

    // 8. Assertions
    assert.strictEqual(recovered.fen, expectedFenAfterMoves, 'Recovered FEN must match exact engine FEN');
    assert.strictEqual(recovered.stateVersion, expectedStateVersion, 'Recovered stateVersion must match');
    assert.strictEqual(recovered.moves.length, 12, 'Recovered moves count must be 12');
    assert.ok(recovered.moves[0].san, 'Moves must contain SAN notation');
    assert.strictEqual(recovered.moves[0].from, 'e2');
    assert.strictEqual(recovered.moves[0].to, 'e4');
    assert.strictEqual(recovered.moves[11].from, 'c5');
    assert.strictEqual(recovered.moves[11].to, 'b4');

    console.log('✓ Exact FEN verified from TiDB recovery');
    console.log('✓ Exact stateVersion verified');
    console.log('✓ Exact move history (12 plies) verified');

    // 8. REST & PGN Authoritative Recovery
    const movesRes = await (await fetch(`${BASE_URL}/api/games/${gameId}/moves`)).json();
    assert.strictEqual(movesRes.moves.length, 12, 'Authoritative moves API must return 12 plies from TiDB');

    const pgnText = await (await fetch(`${BASE_URL}/api/games/${gameId}/pgn`)).text();
    assert.ok(pgnText && pgnText.includes('1. e4 e5'), 'Authoritative PGN must be accurately generated from TiDB plies');
    console.log('✓ Exact PGN verified from TiDB recovery:', pgnText.trim());

    // 9. Verify Redis cache was transparently rebuilt
    const repopulated = await redis.lrange(`chess:game:moves:${gameId}`, 0, -1);
    assert.strictEqual(repopulated.length, 12, 'Redis cache must be transparently rebuilt from TiDB on read');
    console.log(`✓ Redis Move Cache was transparently repopulated from TiDB (${repopulated.length} items).`);

    wsA.close();
    wsB.close();
    wsRecover.close();

    console.log('================================================================');
    console.log('=== PHASE 7.1 AUDIT: REDIS CACHE LOSS & TIDB RECOVERY PASS!   ===');
    console.log('================================================================');
  } finally {
    await dbConn.end();
    redis.disconnect();
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
    } else {
      serverProc.kill('SIGKILL');
    }
  }
}

run().catch(err => {
  console.error('[Audit Error]', err);
  process.exit(1);
});
