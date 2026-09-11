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
const PORT_A = 8010;
const PORT_B = 8011;
const BASE_A = `http://127.0.0.1:${PORT_A}`;
const BASE_B = `http://127.0.0.1:${PORT_B}`;
const WS_A = `ws://127.0.0.1:${PORT_A}/ws`;
const WS_B = `ws://127.0.0.1:${PORT_B}/ws`;

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
  console.log('=== PHASE 7.1 AUDIT: REAL REDIS 7+ MULTI-INSTANCE VERIFICATION===');
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
  const pong = await redis.ping();
  assert.strictEqual(pong, 'PONG', 'Redis ping must return PONG');
  const redisInfo = await redis.info('server');
  const redisVersionMatch = redisInfo.match(/redis_version:([0-9.]+)/);
  const redisVersion = redisVersionMatch ? redisVersionMatch[1] : 'Unknown';
  console.log(`[Audit] Connected to REAL Redis Server on 127.0.0.1:6379 (Version: ${redisVersion}).`);

  // Spawn Fastify Instance A
  console.log(`[Audit] Spawning Fastify Node A on port ${PORT_A}...`);
  const procA = spawn('node', ['apps/server/src/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(PORT_A),
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

  // Spawn Fastify Instance B
  console.log(`[Audit] Spawning Fastify Node B on port ${PORT_B}...`);
  const procB = spawn('node', ['apps/server/src/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(PORT_B),
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

  try {
    procA.stdout.on('data', d => console.log('[Node A OUT]', d.toString().trim()));
    procA.stderr.on('data', d => console.error('[Node A ERR]', d.toString().trim()));
    procB.stdout.on('data', d => console.log('[Node B OUT]', d.toString().trim()));
    procB.stderr.on('data', d => console.error('[Node B ERR]', d.toString().trim()));

    await Promise.all([waitForUrl(`${BASE_A}/health`), waitForUrl(`${BASE_B}/health`)]);
    console.log('[Audit] Both Fastify instances (Node A & Node B) are online and connected to Real Redis.');

    // 1. Register users (Player A on Node A, Player B on Node B)
    const ts = Date.now();
    const userA = await (await fetch(`${BASE_A}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `multi_a_${ts}`, email: `multi_a_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const userB = await (await fetch(`${BASE_B}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `multi_b_${ts}`, email: `multi_b_${ts}@test.com`, password: 'Password123!' })
    })).json();

    console.log(`[Audit] Registered users across instances: A=${userA.user.username}, B=${userB.user.username}`);

    // =========================================================================
    // TEST 1: SHARED DISTRIBUTED RATE LIMITING (Section 27 & 28)
    // =========================================================================
    console.log('\n--- AUDIT TEST 1: Cross-Instance Shared Rate Limiter ---');
    // Fastify WsRateLimiter: limit = 10 requests per 1000ms window per user
    // Connect authenticated WebSocket to Node A and Node B with User A
    const wsRateA = new WebSocket(WS_A);
    await new Promise(r => wsRateA.on('open', r));
    wsRateA.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 200));

    const wsRateB = new WebSocket(WS_B);
    await new Promise(r => wsRateB.on('open', r));
    wsRateB.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 200));

    // Send 6 ping requests to Node A and 6 ping requests to Node B simultaneously
    let rateExceededReceived = false;
    const rateCheckListener = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'error' && msg.payload?.code === 'RATE_LIMIT_EXCEEDED') {
        rateExceededReceived = true;
      }
    };
    wsRateA.on('message', rateCheckListener);
    wsRateB.on('message', rateCheckListener);

    for (let i = 0; i < 6; i++) {
      wsRateA.send(JSON.stringify({ event: 'ping', timestamp: Date.now() }));
      wsRateB.send(JSON.stringify({ event: 'ping', timestamp: Date.now() }));
    }

    await new Promise(r => setTimeout(r, 600));
    wsRateA.removeListener('message', rateCheckListener);
    wsRateB.removeListener('message', rateCheckListener);

    assert.strictEqual(rateExceededReceived, true, 'Requests exceeding distributed limit (10) across nodes must be rejected');
    console.log('✓ Shared Rate Limit verified: 12 total requests across Node A and Node B triggered distributed RATE_LIMIT_EXCEEDED.');
    wsRateA.close();
    wsRateB.close();
    await new Promise(r => setTimeout(r, 1200)); // allow rate limit window to expire

    // =========================================================================
    // TEST 2: SHARED MULTI-TAB PRESENCE & CRASH SAFETY (Section 24, 25, 26)
    // =========================================================================
    console.log('\n--- AUDIT TEST 2: Multi-Tab Presence & Crash Protection ---');
    // Tab 1 on Node A
    const tab1 = new WebSocket(WS_A);
    await new Promise(r => tab1.on('open', r));
    tab1.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 300));

    // Tab 2 on Node B
    const tab2 = new WebSocket(WS_B);
    await new Promise(r => tab2.on('open', r));
    tab2.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 300));

    // Check status via REST on Node B
    let statusRes = await (await fetch(`${BASE_B}/api/presence/${userA.user.id}`)).json();
    assert.strictEqual(statusRes.status, 'online', 'User must be online with 2 tabs');
    console.log('✓ User A is online with Tab 1 on Node A and Tab 2 on Node B.');

    // Close Tab 1 on Node A
    tab1.close();
    await new Promise(r => setTimeout(r, 400));
    statusRes = await (await fetch(`${BASE_A}/api/presence/${userA.user.id}`)).json();
    assert.strictEqual(statusRes.status, 'online', 'User must remain online while Tab 2 on Node B is open');
    console.log('✓ Tab 1 closed on Node A: User A remains online on Node B.');

    // Simulate Node B crash by expiring Tab 2's socket key in Redis
    const userKey = `chess:presence:user:${userA.user.id}`;
    const socketsInRedis = await redis.smembers(userKey);
    for (const sid of socketsInRedis) {
      await redis.del(`chess:presence:socket:${sid}`);
    }
    // Query status on Node A: stale socket TTL protection must prune dead sockets
    statusRes = await (await fetch(`${BASE_A}/api/presence/${userA.user.id}`)).json();
    assert.strictEqual(statusRes.status, 'offline', 'Stale socket pruning must report user offline');
    console.log('✓ Crash safety TTL verified: dead sockets pruned, user status safely transitioned to offline.');
    tab2.close();

    // =========================================================================
    // TEST 3: CROSS-INSTANCE DIRECT CHALLENGE (Section 29)
    // =========================================================================
    console.log('\n--- AUDIT TEST 3: Cross-Instance Direct Challenge ---');
    // Connect User A to Node A, User B to Node B
    const wsNodeA = new WebSocket(WS_A);
    const wsNodeB = new WebSocket(WS_B);
    await Promise.all([new Promise(r => wsNodeA.on('open', r)), new Promise(r => wsNodeB.on('open', r))]);

    wsNodeA.send(JSON.stringify({ event: 'auth:token', payload: { token: userA.token }, timestamp: Date.now() }));
    wsNodeB.send(JSON.stringify({ event: 'auth:token', payload: { token: userB.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 400));

    // Player B listens on Node B for challenge
    const challengeReceivedPromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'challenge:received') {
          wsNodeB.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsNodeB.on('message', onMsg);
    });

    // Player A on Node A sends direct challenge to Player B via REST
    const challengePostRes = await (await fetch(`${BASE_A}/api/challenges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userA.token}`
      },
      body: JSON.stringify({
        targetUserId: userB.user.id,
        timeControl: '10+0',
        colorPreference: 'w'
      })
    })).json();

    const createdChallengeId = challengePostRes.id || challengePostRes.challenge?.id;
    console.log('[Audit] Challenge created on Node A:', createdChallengeId);
    const receivedChallenge = await challengeReceivedPromise;
    assert.strictEqual(receivedChallenge.id, createdChallengeId);
    console.log('✓ Challenge propagated from Node A to Node B via Redis Pub/Sub.');

    // Listen for challenge:accepted on both Node A and Node B
    const challengeAcceptedAPromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'challenge:accepted') {
          wsNodeA.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsNodeA.on('message', onMsg);
    });

    const challengeAcceptedBPromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'challenge:accepted') {
          wsNodeB.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsNodeB.on('message', onMsg);
    });

    const acceptRes = await (await fetch(`${BASE_B}/api/challenges/${receivedChallenge.id}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userB.token}`
      },
      body: JSON.stringify({})
    })).json();

    console.log('[Audit] acceptRes payload received from Node B:', JSON.stringify(acceptRes));

    const [acceptA, acceptB] = await Promise.all([challengeAcceptedAPromise, challengeAcceptedBPromise]);
    assert.strictEqual(acceptA.gameId, acceptRes.gameId);
    assert.strictEqual(acceptB.gameId, acceptRes.gameId);
    console.log('[Audit] Challenge accepted across instances. Game ID:', acceptRes.gameId);

    // Both players join the created game room (Player A on Node A, Player B on Node B)
    const gameStartAPromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'game:init' && msg.payload.gameId) {
          wsNodeA.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsNodeA.on('message', onMsg);
    });

    const gameStartBPromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'game:init' && msg.payload.gameId) {
          wsNodeB.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsNodeB.on('message', onMsg);
    });

    wsNodeA.send(JSON.stringify({ event: 'room:join', payload: { roomCode: acceptRes.roomCode }, timestamp: Date.now() }));
    wsNodeB.send(JSON.stringify({ event: 'room:join', payload: { roomCode: acceptRes.roomCode }, timestamp: Date.now() }));

    const [initA, initB] = await Promise.all([gameStartAPromise, gameStartBPromise]);
    assert.strictEqual(initA.gameId, acceptRes.gameId, 'Node A and Node B must launch into identical game room');
    assert.strictEqual(initB.gameId, acceptRes.gameId);
    console.log(`✓ Cross-instance game room synchronized: Game ID = ${initA.gameId}`);

    // =========================================================================
    // TEST 4: CROSS-INSTANCE GAME PLAY & DISTRIBUTED MOVES (Section 22)
    // =========================================================================
    console.log('\n--- AUDIT TEST 4: Cross-Instance Live Gameplay & Moves ---');
    const challengeGameId = initA.gameId;

    // Player A (on Node A) plays White e2->e4
    const nodeBReceiveMovePromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'move:accepted' && msg.payload.move?.san === 'e4') {
          wsNodeB.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsNodeB.on('message', onMsg);
    });

    wsNodeA.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId: challengeGameId, from: 'e2', to: 'e4', clientMoveId: `cross_m1_${Date.now()}` },
      timestamp: Date.now()
    }));

    const moveAcceptedOnB = await nodeBReceiveMovePromise;
    assert.strictEqual(moveAcceptedOnB.move.san, 'e4');
    assert.strictEqual(moveAcceptedOnB.turn, 'b');
    console.log('✓ Move 1 submitted to Node A successfully broadcast across Redis to Node B client.');

    // Player B (on Node B) plays Black e7->e5
    const nodeAReceiveMovePromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'move:accepted' && msg.payload.move?.san === 'e5') {
          wsNodeA.removeListener('message', onMsg);
          res(msg.payload);
        }
      };
      wsNodeA.on('message', onMsg);
    });

    wsNodeB.send(JSON.stringify({
      event: 'move:submit',
      payload: { gameId: challengeGameId, from: 'e7', to: 'e5', clientMoveId: `cross_m2_${Date.now()}` },
      timestamp: Date.now()
    }));

    const moveAcceptedOnA = await nodeAReceiveMovePromise;
    assert.strictEqual(moveAcceptedOnA.move.san, 'e5');
    assert.strictEqual(moveAcceptedOnA.turn, 'w');
    console.log('✓ Move 2 submitted to Node B successfully broadcast across Redis to Node A client.');

    // Verify TiDB authoritative persistence
    const [crossMoves] = await dbConn.query('SELECT ply, san FROM game_moves WHERE game_id = ? ORDER BY ply ASC', [challengeGameId]);
    assert.strictEqual(crossMoves.length, 2, 'TiDB must hold both cross-instance moves');
    assert.strictEqual(crossMoves[0].san, 'e4');
    assert.strictEqual(crossMoves[1].san, 'e5');
    console.log('✓ Both cross-instance moves committed authoritatively in TiDB.');

    wsNodeA.close();
    wsNodeB.close();

    console.log('\n================================================================');
    console.log('=== PHASE 7.1 REAL REDIS MULTI-INSTANCE AUDIT: ALL TESTS PASS ===');
    console.log('================================================================\n');
  } finally {
    await dbConn.end();
    redis.disconnect();
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(procA.pid), '/f', '/t']);
      spawn('taskkill', ['/pid', String(procB.pid), '/f', '/t']);
    } else {
      procA.kill('SIGKILL');
      procB.kill('SIGKILL');
    }
  }
}

run().catch(err => {
  console.error('[Audit Error]', err);
  process.exit(1);
});
