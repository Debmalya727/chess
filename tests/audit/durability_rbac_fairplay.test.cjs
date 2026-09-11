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
const PORT = 8013;
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
  console.log('=== PHASE 7.1 AUDIT: AUDIT TRAIL, RBAC, FAIR-PLAY & LEAK TEST ===');
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

  serverProc.stdout.on('data', d => console.log('[Server OUT]', d.toString().trim()));
  serverProc.stderr.on('data', d => console.error('[Server ERR]', d.toString().trim()));

  try {
    await waitForUrl(`${BASE_URL}/health`);
    console.log('[Audit] Fastify server running and healthy.');

    // -------------------------------------------------------------------------
    // TEST 1: RBAC SAFETY FROM TIDB AUTHORITATIVE STORE (Section 34)
    // -------------------------------------------------------------------------
    console.log('\n--- AUDIT TEST 1: RBAC Safety from Authoritative Account Store ---');
    const ts = Date.now();
    // Register normal player
    const regRes = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `rbac_p_${ts}`, email: `rbac_p_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const playerToken = regRes.token;
    const playerUserId = regRes.user.id;

    // Normal player attempts to access ADMIN endpoint: POST /api/tournaments
    const forbiddenRes = await fetch(`${BASE_URL}/api/tournaments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${playerToken}`
      },
      body: JSON.stringify({
        name: 'Forbidden Tournament',
        type: 'ARENA',
        timeControl: '5+0',
        durationMinutes: 30
      })
    });
    assert.strictEqual(forbiddenRes.status, 403, 'Normal player must receive 403 Forbidden on organizer endpoint');
    console.log('✓ Normal PLAYER token rejected with 403 Forbidden on organizer route.');

    // Authoritatively elevate role in TiDB directly
    await dbConn.query(`UPDATE users SET role = 'TOURNAMENT_ORGANIZER' WHERE id = ?`, [playerUserId]);
    console.log('[Audit] Elevating user role to TOURNAMENT_ORGANIZER in TiDB...');

    // Re-authenticate to get fresh JWT reflecting authoritative TiDB role
    const loginRes = await (await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `rbac_p_${ts}@test.com`, password: 'Password123!' })
    })).json();

    assert.strictEqual(loginRes.user.role, 'TOURNAMENT_ORGANIZER');

    const allowedRes = await fetch(`${BASE_URL}/api/tournaments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginRes.token}`
      },
      body: JSON.stringify({
        name: `Authorized Tourney ${ts}`,
        type: 'ARENA',
        timeControl: '5+0',
        durationMinutes: 30
      })
    });
    if (allowedRes.status !== 201) {
      console.error('[Audit 500 error body]', await allowedRes.text());
    }
    assert.strictEqual(allowedRes.status, 201, 'Organizer must be allowed with 201 Created');
    console.log('✓ RBAC verified authoritative from TiDB: elevated user successfully created tournament.');

    // -------------------------------------------------------------------------
    // TEST 2: AUDIT EVENT DURABILITY IN TIDB (Section 32)
    // -------------------------------------------------------------------------
    console.log('\n--- AUDIT TEST 2: Authoritative Game Event Durability ---');
    // Register second player and play game to completion
    const user2 = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `rbac_p2_${ts}`, email: `rbac_p2_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const ws1 = new WebSocket(WS_URL);
    const ws2 = new WebSocket(WS_URL);
    await Promise.all([new Promise(r => ws1.on('open', r)), new Promise(r => ws2.on('open', r))]);

    ws1.send(JSON.stringify({ event: 'auth:token', payload: { token: playerToken }, timestamp: Date.now() }));
    ws2.send(JSON.stringify({ event: 'auth:token', payload: { token: user2.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 300));

    const roomPromise = new Promise(res => {
      ws1.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.event === 'game:init' && msg.payload.roomCode) res(msg.payload);
      });
    });

    ws1.send(JSON.stringify({ event: 'room:create', payload: { colorPreference: 'w', timeControl: '10+0' }, timestamp: Date.now() }));
    const room = await roomPromise;

    const startPromise = new Promise(res => {
      ws1.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.event === 'game:init' && msg.payload.blackPlayerId) res(msg.payload);
      });
    });

    ws2.send(JSON.stringify({ event: 'room:join', payload: { roomCode: room.roomCode }, timestamp: Date.now() }));
    await startPromise;

    // Play move e2->e4
    const movePromise = new Promise(res => {
      ws1.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.event === 'move:accepted') res(msg.payload);
      });
    });

    ws1.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId: room.gameId, from: 'e2', to: 'e4', clientMoveId: `m_${Date.now()}` },
      timestamp: Date.now()
    }));
    await movePromise;

    // Resign game to finish
    ws2.send(JSON.stringify({ event: 'game:resign', payload: { gameId: room.gameId }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 600));

    // Verify all authoritative audit events in TiDB game_events table
    const [events] = await dbConn.query(
      `SELECT event_type FROM game_events WHERE game_id = ? ORDER BY id ASC`,
      [room.gameId]
    );

    const eventTypes = events.map(e => e.event_type);
    console.log('[Audit] Recorded game_events in TiDB:', eventTypes);

    assert.ok(eventTypes.includes('GAME_CREATED'), 'TiDB must include GAME_CREATED');
    assert.ok(eventTypes.includes('PLAYER_JOINED'), 'TiDB must include PLAYER_JOINED');
    assert.ok(eventTypes.includes('MOVE_PLAYED'), 'TiDB must include MOVE_PLAYED');
    assert.ok(eventTypes.includes('GAME_FINISHED'), 'TiDB must include GAME_FINISHED');
    console.log('✓ Authoritative Audit Event Trail verified in TiDB (GAME_CREATED, PLAYER_JOINED, MOVE_PLAYED, GAME_FINISHED).');

    ws1.close();
    ws2.close();

    // -------------------------------------------------------------------------
    // TEST 3: CONNECTION CHURN & LEAK VERIFICATION (Section 37)
    // -------------------------------------------------------------------------
    console.log('\n--- AUDIT TEST 3: WebSocket Connection Churn & Memory Leak Test ---');
    console.log('[Audit] Connecting and disconnecting 30 consecutive WebSocket sessions...');

    for (let i = 0; i < 30; i++) {
      const churnWs = new WebSocket(WS_URL);
      await new Promise(r => churnWs.on('open', r));
      churnWs.send(JSON.stringify({ event: 'auth:token', payload: { token: playerToken }, timestamp: Date.now() }));
      await new Promise(r => setTimeout(r, 30));
      churnWs.close();
      await new Promise(r => setTimeout(r, 30));
    }

    await new Promise(r => setTimeout(r, 800));

    // Check presence in Redis: all churned sockets must be cleaned up
    const finalStatus = await (await fetch(`${BASE_URL}/api/presence/${playerUserId}`)).json();
    assert.strictEqual(finalStatus.status, 'offline', 'User must be offline after all churned sockets close');

    const remainingSocketKeys = await redis.smembers(`chess:presence:user:${playerUserId}`);
    assert.strictEqual(remainingSocketKeys.length, 0, 'No dangling socket keys in Redis user presence set');
    console.log('✓ Connection churn test PASS: 30 sockets cleaned up cleanly with zero leakage.');

    // -------------------------------------------------------------------------
    // TEST 4: FAIR-PLAY SAFETY / NON-FABRICATION (Section 33)
    // -------------------------------------------------------------------------
    console.log('\n--- AUDIT TEST 4: Fair-Play Signal Engine Non-Fabrication Rule ---');
    const { BasicAnalyzer } = await import('../../apps/server/src/fairplay/fairPlayService.js');
    const analyzer = new BasicAnalyzer();

    const fpResult = await analyzer.analyze(room.gameId);
    assert.strictEqual(fpResult.engineCorrelation, null, 'Must NOT fabricate engine correlation');
    assert.strictEqual(fpResult.averageCentipawnLoss, null, 'Must NOT fabricate centipawn loss');
    assert.ok(fpResult.suspicionScore < 0.5, 'Must NOT make automatic cheating accusations');
    console.log('✓ Fair-Play non-fabrication verified: engineCorrelation=null, averageCentipawnLoss=null, no false accusation.');

    console.log('\n================================================================');
    console.log('=== PHASE 7.1 AUDIT SUITE 4: ALL TESTS PASS                  ===');
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
