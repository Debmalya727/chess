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
const PORT = 8006;
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
  console.log('=== PHASE 7.1 AUDIT: CONCURRENCY, IDEMPOTENCY & RATINGS RACE  ===');
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
    console.log('[Server OUT]', s);
  });
  serverProc.stderr.on('data', d => {
    console.error('[Server ERR]', d.toString().trim());
  });

  try {
    await waitForUrl(`${BASE_URL}/health`);
    console.log('[Audit] Fastify server is running and healthy with TiDB + Real Redis.');

    // 1. Register Player A and Player B
    const ts = Date.now();
    const userA = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `race_w_${ts}`, email: `race_w_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const userB = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `race_b_${ts}`, email: `race_b_${ts}@test.com`, password: 'Password123!' })
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

    // Player B joins
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
    const whiteUser = isWhiteA ? userA : userB;
    const blackUser = isWhiteA ? userB : userA;

    console.log(`[Audit] Game initialized. ID: ${gameId}, White: ${whiteUser.user.username}, Black: ${blackUser.user.username}`);

    // =========================================================================
    // TEST 1: IDEMPOTENT DUPLICATE MOVE SUBMISSION (Section 13)
    // =========================================================================
    console.log('\n--- AUDIT TEST 1: Duplicate clientMoveId Submission ---');
    const clientMoveId = `dup_test_${Date.now()}`;

    // Submit move e2->e4
    const firstMovePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout on first move')), 4000);
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'move:accepted' && msg.payload.clientMoveId === clientMoveId) {
          clearTimeout(timer);
          whiteWs.removeListener('message', onMsg);
          resolve(msg.payload);
        }
      };
      whiteWs.on('message', onMsg);
    });

    whiteWs.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId, from: 'e2', to: 'e4', clientMoveId, expectedStateVersion: 1 },
      timestamp: Date.now()
    }));

    const firstResult = await firstMovePromise;
    assert.strictEqual(firstResult.move.san, 'e4');
    assert.strictEqual(firstResult.stateVersion, 2);
    console.log('✓ First move accepted. stateVersion =', firstResult.stateVersion);

    // Immediately submit exact same clientMoveId
    const dupMovePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout on duplicate move')), 4000);
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'move:accepted' && msg.payload.clientMoveId === clientMoveId) {
          clearTimeout(timer);
          whiteWs.removeListener('message', onMsg);
          resolve(msg.payload);
        }
      };
      whiteWs.on('message', onMsg);
    });

    whiteWs.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId, from: 'e2', to: 'e4', clientMoveId, expectedStateVersion: 1 },
      timestamp: Date.now()
    }));

    const dupResult = await dupMovePromise;
    assert.strictEqual(dupResult.isDuplicate, true, 'Duplicate submission must be marked as duplicate');
    assert.strictEqual(dupResult.stateVersion, 2, 'stateVersion must NOT increment for duplicate move');
    assert.strictEqual(dupResult.move.san, 'e4', 'Move result must be identical');

    // Verify TiDB contains only ONE ply
    const [movesInDb] = await dbConn.query('SELECT * FROM game_moves WHERE game_id = ?', [gameId]);
    assert.strictEqual(movesInDb.length, 1, 'TiDB must contain exactly 1 ply after duplicate move submission');
    console.log('✓ Idempotency verified: exactly 1 ply in TiDB, stateVersion remained 2, identical reply returned.');

    // =========================================================================
    // TEST 2: CONCURRENT MOVE RACE (Section 12)
    // =========================================================================
    console.log('\n--- AUDIT TEST 2: Concurrent Move Submission (White vs Black) ---');
    // Currently turn is Black ('b').
    // Simulate race: Black attempts legal e7->e5, while White concurrently attempts illegal out-of-turn d2->d4.
    const blackMoveId = `black_${Date.now()}`;
    const whiteRaceMoveId = `white_race_${Date.now()}`;

    let blackOutcome = null;
    let whiteOutcome = null;

    const blackPromise = new Promise((resolve) => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.payload?.clientMoveId === blackMoveId) {
          blackWs.removeListener('message', onMsg);
          resolve(msg);
        }
      };
      blackWs.on('message', onMsg);
    });

    const whitePromise = new Promise((resolve) => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.payload?.clientMoveId === whiteRaceMoveId) {
          whiteWs.removeListener('message', onMsg);
          resolve(msg);
        }
      };
      whiteWs.on('message', onMsg);
    });

    // Fire both moves simultaneously
    blackWs.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId, from: 'e7', to: 'e5', clientMoveId: blackMoveId, expectedStateVersion: 2 },
      timestamp: Date.now()
    }));

    whiteWs.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId, from: 'd2', to: 'd4', clientMoveId: whiteRaceMoveId, expectedStateVersion: 2 },
      timestamp: Date.now()
    }));

    [blackOutcome, whiteOutcome] = await Promise.all([blackPromise, whitePromise]);

    assert.strictEqual(blackOutcome.event, 'move:accepted', 'Valid turn player must be accepted');
    assert.strictEqual(whiteOutcome.event, 'move:rejected', 'Out-of-turn concurrent submitter must be rejected');
    assert.ok(
      whiteOutcome.payload.code === 'NOT_YOUR_TURN' || whiteOutcome.payload.code === 'STALE_STATE',
      'Rejection code must be NOT_YOUR_TURN or STALE_STATE'
    );
    console.log(`✓ Concurrent race resolved safely: Black accepted (e5), White rejected (${whiteOutcome.payload.code})`);

    // Verify TiDB plies: exactly 2 plies
    const [movesAfterRace] = await dbConn.query('SELECT ply, san FROM game_moves WHERE game_id = ? ORDER BY ply ASC', [gameId]);
    assert.strictEqual(movesAfterRace.length, 2, 'TiDB must contain exactly 2 plies');
    assert.strictEqual(movesAfterRace[0].san, 'e4');
    assert.strictEqual(movesAfterRace[1].san, 'e5');
    console.log('✓ TiDB plies verified strictly monotonic and uncorrupted:', movesAfterRace.map(m => m.san).join(' '));

    // =========================================================================
    // TEST 3: MONOTONIC STATE VERSION INTEGRITY (Section 11)
    // =========================================================================
    console.log('\n--- AUDIT TEST 3: Monotonic State Version Verification ---');
    // Play 2 more moves and record stateVersions
    async function doMove(ws, from, to, expected) {
      return new Promise((resolve) => {
        const id = `ver_${from}_${Date.now()}`;
        const onMsg = (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.event === 'move:accepted' && msg.payload.clientMoveId === id) {
            ws.removeListener('message', onMsg);
            resolve(msg.payload.stateVersion);
          }
        };
        ws.on('message', onMsg);
        ws.send(JSON.stringify({
          event: 'move:submit',
          payload: { gameId, from, to, clientMoveId: id, expectedStateVersion: expected },
          timestamp: Date.now()
        }));
      });
    }

    const v3 = await doMove(whiteWs, 'g1', 'f3', 3);
    const v4 = await doMove(blackWs, 'b8', 'c6', 4);

    assert.strictEqual(v3, 4, 'Ply 3 stateVersion must be 4');
    assert.strictEqual(v4, 5, 'Ply 4 stateVersion must be 5');
    console.log('✓ stateVersion verified strictly monotonic (1 -> 2 -> 3 -> 4 -> 5).');

    // =========================================================================
    // TEST 4: GAME COMPLETION RACE & RATING DEDUPLICATION (Section 14 & 15)
    // =========================================================================
    console.log('\n--- AUDIT TEST 4: Concurrent Game Resignation & Rating Deduplication ---');
    // Fetch pre-game ratings for both users
    const [wRatingPre] = await dbConn.query('SELECT rating FROM user_ratings WHERE user_id = ? AND rating_type = "rapid"', [whiteUser.user.id]);
    const [bRatingPre] = await dbConn.query('SELECT rating FROM user_ratings WHERE user_id = ? AND rating_type = "rapid"', [blackUser.user.id]);

    const initialWhiteRating = wRatingPre.length ? wRatingPre[0].rating : 1200;
    const initialBlackRating = bRatingPre.length ? bRatingPre[0].rating : 1200;
    console.log(`[Audit] Initial ratings: White=${initialWhiteRating}, Black=${initialBlackRating}`);

    // Fire dual concurrent resignations
    whiteWs.send(JSON.stringify({
      event: 'game:resign',
      payload: { gameId },
      timestamp: Date.now()
    }));
    blackWs.send(JSON.stringify({
      event: 'game:resign',
      payload: { gameId },
      timestamp: Date.now()
    }));

    // Wait for DB transaction to settle
    await new Promise(r => setTimeout(r, 1200));

    // Inspect TiDB authoritative tables:
    // 1. games table status
    const [gameRows] = await dbConn.query('SELECT status, result, termination FROM games WHERE id = ?', [gameId]);
    assert.strictEqual(gameRows[0].status, 'FINISHED', 'Game must be FINISHED');
    console.log(`✓ Game status in TiDB: FINISHED, Result: ${gameRows[0].result}, Termination: ${gameRows[0].termination}`);

    // 2. rating_history table: must have EXACTLY 2 entries for this game (1 for White, 1 for Black)
    const [ratingHist] = await dbConn.query('SELECT * FROM rating_history WHERE game_id = ?', [gameId]);
    assert.strictEqual(
      ratingHist.length,
      2,
      `rating_history must have exactly 2 records for game ${gameId}, found: ${ratingHist.length}`
    );
    console.log(`✓ Rating history verified: exactly 2 entries in rating_history (no duplicate Elo).`);

    // 3. game_events table: must have EXACTLY 1 GAME_FINISHED event
    const [finishEvents] = await dbConn.query('SELECT * FROM game_events WHERE game_id = ? AND event_type = "GAME_FINISHED"', [gameId]);
    assert.strictEqual(
      finishEvents.length,
      1,
      `game_events must have exactly 1 GAME_FINISHED event, found: ${finishEvents.length}`
    );
    console.log(`✓ Authoritative audit trail verified: exactly 1 GAME_FINISHED event.`);

    wsA.close();
    wsB.close();

    console.log('\n================================================================');
    console.log('=== PHASE 7.1 CONCURRENCY & IDEMPOTENCY AUDIT: ALL TESTS PASS ===');
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
