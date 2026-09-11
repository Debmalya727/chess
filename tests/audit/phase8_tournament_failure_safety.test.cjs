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
const PORT_A = 8012;
const PORT_B = 8013;
const BASE_A = `http://127.0.0.1:${PORT_A}`;
const BASE_B = `http://127.0.0.1:${PORT_B}`;
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

async function registerUser(baseUrl, username, role = 'PLAYER') {
  const email = `${username}@chessplatform.internal`;
  const password = 'Password123!';
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  const data = await res.json();
  if (!data.token) {
    throw new Error(`Failed to register ${username}: ${JSON.stringify(data)}`);
  }

  if (role !== 'PLAYER') {
    const dbConn = await mysql.createConnection({
      host: DB_HOST, port: 4000, user: 'chess', password: 'chess', database: 'chess_platform'
    });
    await dbConn.query(`UPDATE users SET role = ? WHERE id = ?`, [role, data.user.id]);
    await dbConn.end();
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const loginData = await loginRes.json();
    return { ...loginData.user, token: loginData.token };
  }

  return { ...data.user, token: data.token };
}

async function run() {
  console.log('================================================================');
  console.log('=== PHASE 8 AUDIT: TOURNAMENT FAILURE-SAFETY & CROSS-NODE    ===');
  console.log('================================================================\n');

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

  // Spawn Fastify Node A
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
      REDIS_REQUIRED: 'true',
      JWT_SECRET: 'super-secret-jwt-key-for-dev'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Spawn Fastify Node B
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
      REDIS_REQUIRED: 'true',
      JWT_SECRET: 'super-secret-jwt-key-for-dev'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForUrl(`${BASE_A}/health`);
    await waitForUrl(`${BASE_B}/health`);
    console.log('[Audit] Both Fastify Node A and Node B are up and healthy.\n');

    // -------------------------------------------------------------
    // TEST 1: Cross-Instance Synchronization (Node A -> Node B)
    // -------------------------------------------------------------
    console.log('--- TEST 1: Cross-Instance Synchronization (Node A & Node B) ---');
    const organizer = await registerUser(BASE_A, `p8_cross_org_${Date.now()}`, 'TOURNAMENT_ORGANIZER');

    // Organizer creates tournament on Node A
    const tournRes = await fetch(`${BASE_A}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({
        name: 'Distributed Cross-Instance Swiss',
        type: 'swiss',
        timeControl: '5+0',
        totalRounds: 2,
        maxPlayers: 8
      })
    });
    const tourn = await tournRes.json();
    assert.ok(tourn.id);
    console.log(`✓ Tournament ${tourn.id} created on Node A`);

    // Verify Node B immediately sees the tournament
    const tournOnB = await fetch(`${BASE_B}/api/tournaments/${tourn.id}`).then(r => r.json());
    assert.strictEqual(tournOnB.id, tourn.id);
    assert.strictEqual(tournOnB.name, 'Distributed Cross-Instance Swiss');
    console.log('✓ Node B immediately sees the tournament created by Node A');

    // Setup WebSocket listener on Node B for real-time tournament pub/sub
    const wsB = new WebSocket(WS_B);
    await new Promise((res, rej) => {
      wsB.on('open', res);
      wsB.on('error', rej);
    });

    const receivedEventsOnB = [];
    wsB.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        receivedEventsOnB.push(msg);
      } catch (_) {}
    });

    // Subscribe to tournament on Node B
    wsB.send(JSON.stringify({
      event: 'tournament:join',
      payload: { tournamentId: tourn.id }
    }));
    await new Promise(r => setTimeout(r, 200));

    // Register Player 1 on Node A
    const player1 = await registerUser(BASE_A, `p8_dist_p1_${Date.now()}`);
    await fetch(`${BASE_A}/api/tournaments/${tourn.id}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${player1.token}` }
    });

    // Register Player 2 on Node B
    const player2 = await registerUser(BASE_B, `p8_dist_p2_${Date.now()}`);
    await fetch(`${BASE_B}/api/tournaments/${tourn.id}/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${player2.token}` }
    });

    await new Promise(r => setTimeout(r, 300));

    // Verify Node B received cross-instance tournament:updated event via Redis Pub/Sub
    const updateEvents = receivedEventsOnB.filter(e => e.event === 'tournament:updated');
    assert.ok(updateEvents.length >= 1, 'Node B must receive cross-instance tournament update via Redis Pub/Sub');
    console.log(`✓ Node B WebSocket received real-time cross-instance events (${updateEvents.length} updates)`);

    // Start tournament from Node A
    await fetch(`${BASE_A}/api/tournaments/${tourn.id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${organizer.token}` }
    });

    await new Promise(r => setTimeout(r, 300));
    const startEvents = receivedEventsOnB.filter(e => e.event === 'tournament:started');
    assert.ok(startEvents.length >= 1, 'Node B must receive tournament:started event');
    console.log('✓ Node B received cross-instance tournament:started event\n');

    // -------------------------------------------------------------
    // TEST 2: Elo Rating Isolation Guarantee (Section 11)
    // -------------------------------------------------------------
    console.log('--- TEST 2: Elo Rating Isolation Invariant (rated = false) ---');
    // Fetch initial ratings from TiDB
    const [preRatings1] = await dbConn.query(`SELECT rating FROM user_ratings WHERE user_id = ?`, [player1.id]);
    const [preRatings2] = await dbConn.query(`SELECT rating FROM user_ratings WHERE user_id = ?`, [player2.id]);
    const r1Before = preRatings1[0]?.rating || 1500;
    const r2Before = preRatings2[0]?.rating || 1500;

    // Conclude the match on Node B
    const pairings = await fetch(`${BASE_B}/api/tournaments/${tourn.id}/pairings?round=1`).then(r => r.json());
    const gamePairing = pairings.pairings.find(p => !p.isBye);

    await fetch(`${BASE_B}/api/tournaments/${tourn.id}/games/${gamePairing.gameId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({ result: '1-0' })
    });

    // Check ratings in TiDB after tournament match conclusion
    const [postRatings1] = await dbConn.query(`SELECT rating FROM user_ratings WHERE user_id = ?`, [player1.id]);
    const [postRatings2] = await dbConn.query(`SELECT rating FROM user_ratings WHERE user_id = ?`, [player2.id]);
    const r1After = postRatings1[0]?.rating || 1500;
    const r2After = postRatings2[0]?.rating || 1500;

    assert.strictEqual(r1After, r1Before, 'Player 1 public Elo rating must remain unchanged by tournament game');
    assert.strictEqual(r2After, r2Before, 'Player 2 public Elo rating must remain unchanged by tournament game');
    console.log('✓ Verified Elo isolation invariant: Public ratings remain 100% untouched by tournament results\n');

    // -------------------------------------------------------------
    // TEST 3: Redis Loss / Complete Flush Recovery (Section 23)
    // -------------------------------------------------------------
    console.log('--- TEST 3: Complete Redis Flush / Restart Recovery ---');
    console.log('[Audit] Flushing all Redis keys to simulate catastrophic Redis memory loss...');
    await redis.flushall();
    const keyCount = await redis.dbsize();
    assert.strictEqual(keyCount, 0, 'Redis must be completely empty');
    console.log('✓ Redis flushed: 0 keys remaining in Redis');

    // Re-query tournament details, standings, and pairings from Node A and Node B
    const detailsAfterFlush = await fetch(`${BASE_A}/api/tournaments/${tourn.id}`).then(r => r.json());
    assert.strictEqual(detailsAfterFlush.id, tourn.id);
    assert.strictEqual(detailsAfterFlush.status, 'running');
    assert.strictEqual(detailsAfterFlush.entries.length, 2);

    const standingsAfterFlush = await fetch(`${BASE_B}/api/tournaments/${tourn.id}/standings`).then(r => r.json());
    assert.strictEqual(standingsAfterFlush.standings.length, 2);
    const winner = standingsAfterFlush.standings.find(s => s.score === 1.0);
    assert.ok(winner, 'Standings data must be intact after Redis flush');

    const pairingsAfterFlush = await fetch(`${BASE_A}/api/tournaments/${tourn.id}/pairings?round=1`).then(r => r.json());
    assert.strictEqual(pairingsAfterFlush.pairings.length, 1);
    assert.strictEqual(pairingsAfterFlush.pairings[0].result, '1-0');

    console.log('✓ All tournament entities, standings, and match results recovered flawlessly from TiDB\n');

    // -------------------------------------------------------------
    // TEST 4: Node Failure & Failover Resiliency (Section 24)
    // -------------------------------------------------------------
    console.log('--- TEST 4: Node Failure & Failover Resiliency (Killing Node A) ---');
    procA.kill();
    console.log('[Audit] Node A killed. Testing failover on surviving Node B...');

    // Complete tournament on surviving Node B
    const finishRes = await fetch(`${BASE_B}/api/tournaments/${tourn.id}/finish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${organizer.token}` }
    });
    assert.strictEqual(finishRes.status, 200, 'Surviving Node B must be able to complete tournament');
    const finishData = await finishRes.json();
    assert.strictEqual(finishData.success, true);

    const finalTournOnB = await fetch(`${BASE_B}/api/tournaments/${tourn.id}`).then(r => r.json());
    assert.strictEqual(finalTournOnB.status, 'finished');
    assert.strictEqual(finalTournOnB.entries[0].score, 1.0);

    // Verify in TiDB directly
    const [tidbTourn] = await dbConn.query(`SELECT status FROM tournaments WHERE id = ?`, [tourn.id]);
    assert.strictEqual(tidbTourn[0].status, 'finished');
    console.log('✓ Node B successfully executed tournament completion and persisted final state to TiDB');

    wsB.close();

    console.log('\n================================================================');
    console.log('=== ALL PHASE 8 FAILURE-SAFETY TESTS PASSED (4/4)            ===');
    console.log('================================================================\n');

  } finally {
    procA.kill();
    procB.kill();
    await dbConn.end();
    redis.disconnect();
  }
}

run().catch(err => {
  console.error('\n[FATAL AUDIT ERROR]', err);
  process.exit(1);
});
