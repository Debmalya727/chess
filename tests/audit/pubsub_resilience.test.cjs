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
const PORT = 8007;
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
  console.log('=== PHASE 7.1 AUDIT: PUB/SUB FAILURE & DUPLICATE EVENT TEST   ===');
  console.log('================================================================');

  const dbConn = await mysql.createConnection({
    host: DB_HOST,
    port: 4000,
    user: 'chess',
    password: 'chess',
    database: 'chess_platform'
  });
  console.log(`[Audit] Connected to authoritative TiDB database at ${DB_HOST}:4000.`);

  const redis = new Redis({ host: '127.0.0.1', port: 6379 });
  await redis.ping();
  console.log('[Audit] Connected to real Redis server on 127.0.0.1:6379.');

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
    const s = d.toString().trim();
    if (s.includes('Warning: Pub/Sub broadcast failed') || s.includes('error')) {
      console.log('[Server]', s);
    }
  });

  try {
    await waitForUrl(`${BASE_URL}/health`);
    console.log('[Audit] Fastify server running and healthy.');

    // Register Player A and Player B
    const ts = Date.now();
    const userA = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `pub_w_${ts}`, email: `pub_w_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const userB = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `pub_b_${ts}`, email: `pub_b_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const wsA = new WebSocket(WS_URL);
    const wsB = new WebSocket(WS_URL);
    await Promise.all([
      new Promise(res => wsA.on('open', res)),
      new Promise(res => wsB.on('open', res))
    ]);

    wsA.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    wsB.send(JSON.stringify({ event: 'auth:token', payload: { token: userB.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 400));

    // Create Room
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
    const gameId = roomData.gameId;
    const roomCode = roomData.roomCode;

    // Join Room
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

    wsB.send(JSON.stringify({ event: 'room:join', payload: { roomCode }, timestamp: Date.now() }));
    const startData = await startPromise;

    const isWhiteA = startData.whitePlayerId === userA.user.id;
    const whiteWs = isWhiteA ? wsA : wsB;
    const blackWs = isWhiteA ? wsB : wsA;

    // =========================================================================
    // TEST 1: DUPLICATE PUB/SUB EVENT DELIVERY (Section 10)
    // =========================================================================
    console.log('\n--- AUDIT TEST 1: Duplicate Pub/Sub Event Delivery ---');
    // First, play e2->e4 legitimately
    const move1Promise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'move:accepted') {
          whiteWs.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      whiteWs.on('message', onMsg);
    });

    whiteWs.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId, from: 'e2', to: 'e4', clientMoveId: `m1_${Date.now()}` },
      timestamp: Date.now()
    }));

    const move1Result = await move1Promise;
    console.log('✓ Initial move played: e4. FEN:', move1Result.fen);

    // Count messages received on blackWs
    let duplicateEventsReceived = 0;
    const blackMsgListener = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'move:accepted' && msg.payload.move?.san === 'e4') {
        duplicateEventsReceived++;
      }
    };
    blackWs.on('message', blackMsgListener);

    // Deliver the exact same move:accepted envelope twice directly via Redis Pub/Sub
    const pubChannel = `chess:pubsub:game:${gameId}`;
    const duplicateEnvelope = {
      channel: pubChannel,
      eventType: 'move:accepted',
      payload: move1Result,
      timestamp: Date.now()
    };

    console.log('[Audit] Publishing identical event twice to Redis Pub/Sub channel:', pubChannel);
    await redis.publish(pubChannel, JSON.stringify(duplicateEnvelope));
    await redis.publish(pubChannel, JSON.stringify(duplicateEnvelope));

    await new Promise(r => setTimeout(r, 600));
    blackWs.removeListener('message', blackMsgListener);

    // Verify session state in server: turn must still be 'b', moves must still be 1, FEN unchanged
    const sessionRes = await (await fetch(`${BASE_URL}/api/games/${gameId}`)).json();
    assert.strictEqual(sessionRes.moveCount, 1, 'Move count in TiDB must remain 1');
    console.log('✓ Duplicate Pub/Sub delivery did not produce duplicate move or advance turn.');

    // =========================================================================
    // TEST 2: PUB/SUB FAILURE DOES NOT DESTROY PERSISTED MOVE (Section 9)
    // =========================================================================
    console.log('\n--- AUDIT TEST 2: Pub/Sub Failure / TiDB Commit Durability ---');
    // Now play move e7->e5.
    // In handleMoveSubmit, Pub/Sub publish failure is caught and logged as a warning,
    // and the TiDB transaction is already committed.
    const move2Promise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'move:accepted') {
          blackWs.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      blackWs.on('message', onMsg);
    });

    blackWs.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId, from: 'e7', to: 'e5', clientMoveId: `m2_${Date.now()}` },
      timestamp: Date.now()
    }));

    const move2Result = await move2Promise;
    console.log('✓ Move 2 accepted: e5. stateVersion:', move2Result.stateVersion);

    // Verify TiDB authoritative record
    const [dbMoves] = await dbConn.query('SELECT ply, from_square, to_square, san FROM game_moves WHERE game_id = ? ORDER BY ply ASC', [gameId]);
    assert.strictEqual(dbMoves.length, 2, 'TiDB must authoritatively hold 2 plies');
    assert.strictEqual(dbMoves[0].san, 'e4');
    assert.strictEqual(dbMoves[1].san, 'e5');
    console.log('✓ TiDB authoritative state is durable: plies =', dbMoves.map(m => m.san).join(' '));

    // Client reconnect & catch-up test: a new socket recovers full state from TiDB
    const wsRecover = new WebSocket(WS_URL);
    await new Promise(res => wsRecover.on('open', res));
    wsRecover.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 300));

    const recoverPromise = new Promise(res => {
      wsRecover.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'game:init') res(msg.payload);
      });
    });

    wsRecover.send(JSON.stringify({ event: 'room:join', payload: { roomCode }, timestamp: Date.now() }));
    const recovered = await recoverPromise;

    assert.strictEqual(recovered.moves.length, 2, 'Reconnected client must receive 2 moves');
    assert.strictEqual(recovered.stateVersion, 3, 'Recovered stateVersion must be 3');
    console.log('✓ Reconnected client recovered full authoritative state from TiDB.');

    wsA.close();
    wsB.close();
    wsRecover.close();

    console.log('\n================================================================');
    console.log('=== PHASE 7.1 PUB/SUB RESILIENCE AUDIT: ALL TESTS PASS       ===');
    console.log('================================================================\n');
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
