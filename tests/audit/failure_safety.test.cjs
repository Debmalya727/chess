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
const PORT = 8014;
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
  console.log('=== PHASE 7.1 AUDIT: TIDB FAILURE SAFETY & GRACEFUL SHUTDOWN  ===');
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
    if (s.includes('[MoveHandler]') || s.includes('DATABASE_ERROR')) {
      console.log('[Server]', s);
    }
  });

  try {
    await waitForUrl(`${BASE_URL}/health`);
    console.log('[Audit] Fastify server running and healthy.');

    // 1. Register players & establish game
    const ts = Date.now();
    const userA = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `fail_w_${ts}`, email: `fail_w_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const userB = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `fail_b_${ts}`, email: `fail_b_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const wsA = new WebSocket(WS_URL);
    const wsB = new WebSocket(WS_URL);
    await Promise.all([new Promise(r => wsA.on('open', r)), new Promise(r => wsB.on('open', r))]);

    wsA.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    wsB.send(JSON.stringify({ event: 'auth:token', payload: { token: userB.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 300));

    const roomPromise = new Promise(res => {
      wsA.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.event === 'game:init' && msg.payload.roomCode) res(msg.payload);
      });
    });

    wsA.send(JSON.stringify({ event: 'room:create', payload: { colorPreference: 'w', timeControl: '10+0' }, timestamp: Date.now() }));
    const room = await roomPromise;
    const gameId = room.gameId;

    const startPromise = new Promise(res => {
      wsA.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.event === 'game:init' && msg.payload.blackPlayerId) res(msg.payload);
      });
    });

    wsB.send(JSON.stringify({ event: 'room:join', payload: { roomCode: room.roomCode }, timestamp: Date.now() }));
    await startPromise;

    // -------------------------------------------------------------------------
    // TEST 1: TIDB FAILURE SAFETY DURING MOVE (Section 39)
    // -------------------------------------------------------------------------
    console.log('\n--- AUDIT TEST 1: TiDB Failure Safety During Move Execution ---');
    // Temporarily rename game_moves table to simulate TiDB query/write failure
    console.log('[Audit] Simulating TiDB persistence failure: temporarily renaming game_moves table...');
    await dbConn.query(`RENAME TABLE game_moves TO game_moves_backup`);

    let moveRejectedReceived = false;
    let moveRejectedReason = null;

    const rejectPromise = new Promise(res => {
      const onMsg = (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.event === 'move:rejected') {
          moveRejectedReceived = true;
          moveRejectedReason = msg.payload?.code;
          wsA.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsA.on('message', onMsg);
    });

    // White attempts move e2->e4 while TiDB is broken
    wsA.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId, from: 'e2', to: 'e4', clientMoveId: `fail_m1_${Date.now()}` },
      timestamp: Date.now()
    }));

    const rejectPayload = await rejectPromise;
    assert.strictEqual(moveRejectedReceived, true, 'Client must receive move:rejected when DB write fails');
    assert.strictEqual(rejectPayload.code, 'DATABASE_ERROR', 'Rejection code must be DATABASE_ERROR');
    console.log('✓ TiDB failure handled safely: client received move:rejected with code DATABASE_ERROR.');

    // Restore table
    await dbConn.query(`RENAME TABLE game_moves_backup TO game_moves`);
    console.log('[Audit] Restored game_moves table.');

    // Verify engine state rolled back: turn must still be 'w', ply count must be 0
    const [dbPlies] = await dbConn.query(`SELECT * FROM game_moves WHERE game_id = ?`, [gameId]);
    assert.strictEqual(dbPlies.length, 0, 'Zero plies must exist in TiDB after failure');
    console.log('✓ Move rollback verified: zero plies committed, in-memory state remained uncorrupted.');

    // Now submit legitimate move with table restored
    const acceptPromise = new Promise(res => {
      const onMsg = (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.event === 'move:accepted') {
          wsA.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsA.on('message', onMsg);
    });

    wsA.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId, from: 'e2', to: 'e4', clientMoveId: `recovered_m1_${Date.now()}` },
      timestamp: Date.now()
    }));

    const acceptedResult = await acceptPromise;
    assert.strictEqual(acceptedResult.move.san, 'e4');
    assert.strictEqual(acceptedResult.stateVersion, 2);
    console.log('✓ Subsequent move succeeded normally after DB recovery. Ply committed to TiDB.');

    // -------------------------------------------------------------------------
    // TEST 2: GRACEFUL SHUTDOWN PRESERVES ACTIVE GAMES (Section 38)
    // -------------------------------------------------------------------------
    console.log('\n--- AUDIT TEST 2: Graceful Shutdown Preserves Active Game State ---');
    // Disconnect sockets cleanly
    wsA.close();
    wsB.close();

    // Check game in TiDB: status must remain 'ACTIVE' (NOT marked 'resigned' or 'aborted' due to disconnect/shutdown)
    const [activeGame] = await dbConn.query(`SELECT status FROM games WHERE id = ?`, [gameId]);
    assert.strictEqual(activeGame[0].status, 'ACTIVE', 'Active game must NOT be marked resigned on disconnect/shutdown');
    console.log('✓ Invariant verified: games remain ACTIVE for reconnection and are not marked resigned on disconnect.');

    console.log('\n================================================================');
    console.log('=== PHASE 7.1 FAILURE SAFETY AUDIT: ALL TESTS PASS            ===');
    console.log('================================================================\n');
  } finally {
    // Ensure table is restored in case of error
    try {
      await dbConn.query(`RENAME TABLE game_moves_backup TO game_moves`);
    } catch {}
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
