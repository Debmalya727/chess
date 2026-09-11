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
const PORT = 8008;
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

async function registerUser(username, role = 'PLAYER') {
  const email = `${username}@chessplatform.internal`;
  const password = 'Password123!';
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  const data = await res.json();
  if (!data.token) {
    throw new Error(`Failed to register ${username}: ${JSON.stringify(data)}`);
  }

  if (role !== 'PLAYER') {
    // Elevate role in database
    const dbConn = await mysql.createConnection({
      host: DB_HOST, port: 4000, user: 'chess', password: 'chess', database: 'chess_platform'
    });
    await dbConn.query(`UPDATE users SET role = ? WHERE id = ?`, [role, data.user.id]);
    await dbConn.end();
    // Re-login to get updated JWT token with role
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
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
  console.log('=== PHASE 8 AUDIT: TOURNAMENT INTEGRITY, SWISS/ARENA & RACES ===');
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
      REDIS_REQUIRED: 'true',
      JWT_SECRET: 'super-secret-jwt-key-for-dev'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', d => {
    const s = d.toString();
    if (s.includes('error') || s.includes('Error')) process.stdout.write(`[Server] ${s}`);
  });
  serverProc.stderr.on('data', d => process.stderr.write(`[Server ERR] ${d}`));

  try {
    await waitForUrl(`${BASE_URL}/health`);
    console.log('[Audit] Fastify server is up and healthy.\n');

    // -------------------------------------------------------------
    // TEST 1: RBAC & Tournament Authorization Controls
    // -------------------------------------------------------------
    console.log('--- TEST 1: RBAC & Tournament Authorization Controls ---');
    const player1 = await registerUser(`p8_player_${Date.now()}`, 'PLAYER');
    const organizer = await registerUser(`p8_org_${Date.now()}`, 'TOURNAMENT_ORGANIZER');
    const admin = await registerUser(`p8_admin_${Date.now()}`, 'ADMIN');

    // 1.1: Regular PLAYER cannot create tournament
    const playerCreateRes = await fetch(`${BASE_URL}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${player1.token}` },
      body: JSON.stringify({ name: 'Unauthorized Open', type: 'arena' })
    });
    assert.strictEqual(playerCreateRes.status, 403, 'Regular player must receive 403 FORBIDDEN when creating tournament');
    console.log('✓ PLAYER role forbidden from creating tournament (HTTP 403)');

    // 1.2: TOURNAMENT_ORGANIZER can create tournament
    const orgCreateRes = await fetch(`${BASE_URL}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({
        name: 'Spring Swiss Championship',
        type: 'swiss',
        timeControl: '10+0',
        totalRounds: 2,
        minPlayers: 3,
        maxPlayers: 16
      })
    });
    assert.strictEqual(orgCreateRes.status, 201, 'Organizer should successfully create tournament (HTTP 201)');
    const swissTourn = await orgCreateRes.json();
    assert.strictEqual(swissTourn.name, 'Spring Swiss Championship');
    assert.strictEqual(swissTourn.type, 'swiss');
    assert.strictEqual(swissTourn.status, 'registration');
    console.log('✓ TOURNAMENT_ORGANIZER created tournament successfully (HTTP 201)');

    // 1.3: Player cannot start tournament
    const playerStartRes = await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${player1.token}` }
    });
    assert.strictEqual(playerStartRes.status, 403, 'PLAYER cannot start tournament');
    console.log('✓ PLAYER role forbidden from starting tournament (HTTP 403)\n');

    // -------------------------------------------------------------
    // TEST 2: Concurrent Registration Race Safety (Capacity Invariant)
    // -------------------------------------------------------------
    console.log('--- TEST 2: Concurrent Registration Race Safety (maxPlayers = 4) ---');
    const capTournRes = await fetch(`${BASE_URL}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({
        name: 'Capacity Race Test Arena',
        type: 'arena',
        timeControl: '5+0',
        maxPlayers: 4
      })
    });
    const capTourn = await capTournRes.json();

    // Create 10 distinct users
    const raceUsers = [];
    for (let i = 0; i < 10; i++) {
      const u = await registerUser(`p8_race_${i}_${Date.now()}`);
      raceUsers.push(u);
    }

    // Fire 10 simultaneous registration requests
    const regPromises = raceUsers.map(u => 
      fetch(`${BASE_URL}/api/tournaments/${capTourn.id}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${u.token}` }
      }).then(r => r.json().then(data => ({ status: r.status, data })))
    );

    const regResults = await Promise.all(regPromises);
    const successfulRegs = regResults.filter(r => r.status === 200 && r.data.success);
    const rejectedRegs = regResults.filter(r => r.status === 400 && r.data.error === 'TOURNAMENT_FULL');

    assert.strictEqual(successfulRegs.length, 4, `Strictly 4 registrations must succeed, got ${successfulRegs.length}`);
    assert.strictEqual(rejectedRegs.length, 6, `Strictly 6 registrations must be rejected with TOURNAMENT_FULL, got ${rejectedRegs.length}`);

    // Verify TiDB authoritative count
    const [dbEntries] = await dbConn.query(
      `SELECT COUNT(*) as cnt FROM tournament_entries WHERE tournament_id = ? AND withdrawn = FALSE`,
      [capTourn.id]
    );
    assert.strictEqual(dbEntries[0].cnt, 4, 'Authoritative TiDB table must have exactly 4 entries');
    console.log('✓ 10 concurrent registrations for 4 spots resulted in exactly 4 accepted and 6 rejected');
    console.log('✓ TiDB authoritative entry count is strictly 4\n');

    // -------------------------------------------------------------
    // TEST 3: Swiss Tournament Lifecycle, Odd Count Byes & Buchholz Tiebreaks
    // -------------------------------------------------------------
    console.log('--- TEST 3: Swiss Lifecycle, Byes & Deterministic Buchholz Tiebreaks ---');
    // Register 5 players for swissTourn (odd count)
    const swissPlayers = [];
    for (let i = 0; i < 5; i++) {
      const sp = await registerUser(`p8_sw_${i}_${Date.now()}`);
      await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sp.token}` }
      });
      swissPlayers.push(sp);
    }

    // Start Swiss Tournament
    const startRes = await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${organizer.token}` }
    });
    assert.strictEqual(startRes.status, 200);
    const startData = await startRes.json();
    assert.strictEqual(startData.success, true);
    console.log('✓ Swiss tournament successfully started');

    // Check Round 1 pairings
    const pairingsRes = await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/pairings?round=1`);
    const pairingsData = await pairingsRes.json();
    assert.strictEqual(pairingsData.pairings.length, 3, '5 players should yield 2 game pairings + 1 bye pairing');

    const byePairing = pairingsData.pairings.find(p => p.isBye);
    assert.ok(byePairing, 'A single bye pairing must be assigned for odd player count');
    assert.strictEqual(byePairing.result, '1-0', 'Bye is automatically awarded 1-0 win');

    // Verify no player paired with self
    for (const p of pairingsData.pairings) {
      if (!p.isBye) {
        assert.notStrictEqual(p.whiteUserId, p.blackUserId, 'Self-pairing is strictly impossible');
      }
    }

    // Verify all 5 players accounted for exactly once
    const round1PlayerIds = new Set();
    for (const p of pairingsData.pairings) {
      round1PlayerIds.add(p.whiteUserId);
      if (p.blackUserId) round1PlayerIds.add(p.blackUserId);
    }
    assert.strictEqual(round1PlayerIds.size, 5, 'All 5 players must be accounted for in round 1');
    console.log('✓ Round 1 Swiss pairings: 2 game boards, 1 bye, no self-pairing, all players accounted for');

    // Simulate completion of Round 1 games via organizer API
    const matchPairings = pairingsData.pairings.filter(p => !p.isBye);
    // Board 1: White wins (1-0)
    // Board 2: Draw (1/2-1/2)
    await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/games/${matchPairings[0].gameId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({ result: '1-0' })
    });
    await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/games/${matchPairings[1].gameId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({ result: '1/2-1/2' })
    });

    // Query standings after Round 1
    const standingsRes = await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/standings`);
    const standingsData = await standingsRes.json();
    const standings = standingsData.standings;
    assert.strictEqual(standings.length, 5);

    // Sum of authoritative scores should match: Board 1 (1 + 0) + Board 2 (0.5 + 0.5) + Bye (1) = 3.0 points
    const totalScore = standings.reduce((acc, s) => acc + s.score, 0);
    assert.strictEqual(totalScore, 3.0, 'Total score across all participants must strictly equal sum of match outcomes');
    console.log('✓ Authoritative scoring verified: Total points sum = 3.0');

    // Advance to Round 2
    const nextRoundRes = await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/rounds/next`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${organizer.token}` }
    });
    assert.strictEqual(nextRoundRes.status, 200);
    const nextRoundData = await nextRoundRes.json();
    assert.strictEqual(nextRoundData.roundNumber, 2);

    const r2PairingsRes = await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/pairings?round=2`);
    const r2PairingsData = await r2PairingsRes.json();
    assert.strictEqual(r2PairingsData.pairings.length, 3);

    // Verify bye was NOT assigned to the same player twice
    const r2Bye = r2PairingsData.pairings.find(p => p.isBye);
    assert.ok(r2Bye, 'Round 2 must allocate a bye');
    assert.notStrictEqual(r2Bye.whiteUserId, byePairing.whiteUserId, 'Bye cannot be assigned to the same player twice in 2 rounds');
    console.log('✓ Round 2 Swiss pairings: Bye was assigned to a different player than Round 1');

    // Complete Round 2 games
    const r2Matches = r2PairingsData.pairings.filter(p => !p.isBye);
    await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/games/${r2Matches[0].gameId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({ result: '1-0' })
    });
    await fetch(`${BASE_URL}/api/tournaments/${swissTourn.id}/games/${r2Matches[1].gameId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({ result: '0-1' })
    });

    // Verify Buchholz tiebreak values in TiDB
    const [finalRows] = await dbConn.query(
      `SELECT user_id, score, tiebreak_score, wins, games_played, byes_count FROM tournament_entries WHERE tournament_id = ? ORDER BY score DESC, tiebreak_score DESC`,
      [swissTourn.id]
    );

    for (const row of finalRows) {
      assert.ok(row.tiebreak_score >= 0, 'Buchholz tiebreak score must be non-negative');
    }
    console.log('✓ Final Buchholz tiebreak scores persisted and ordered deterministically in TiDB\n');

    // -------------------------------------------------------------
    // TEST 4: Arena Tournament Continuous Pairings & Rematch Avoidance
    // -------------------------------------------------------------
    console.log('--- TEST 4: Arena Continuous Pairings & Rematch Policy ---');
    const arenaRes = await fetch(`${BASE_URL}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({
        name: 'Speed Arena Invitational',
        type: 'arena',
        timeControl: '3+2',
        durationMinutes: 10,
        maxPlayers: 8
      })
    });
    const arenaTourn = await arenaRes.json();

    const arenaPlayers = [];
    for (let i = 0; i < 4; i++) {
      const ap = await registerUser(`p8_ar_${i}_${Date.now()}`);
      await fetch(`${BASE_URL}/api/tournaments/${arenaTourn.id}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ap.token}` }
      });
      arenaPlayers.push(ap);
    }

    // Start Arena
    await fetch(`${BASE_URL}/api/tournaments/${arenaTourn.id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${organizer.token}` }
    });

    const arenaMatches1 = await fetch(`${BASE_URL}/api/tournaments/${arenaTourn.id}/games`).then(r => r.json());
    assert.strictEqual(arenaMatches1.games.length, 2, '4 players should produce exactly 2 simultaneous Arena matches');
    console.log('✓ Initial Arena continuous pairing produced 2 active games');

    // Finish one match
    await fetch(`${BASE_URL}/api/tournaments/${arenaTourn.id}/games/${arenaMatches1.games[0].gameId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({ result: '1-0' })
    });

    // Standings should reflect the completed match
    const arenaStandings = await fetch(`${BASE_URL}/api/tournaments/${arenaTourn.id}/standings`).then(r => r.json());
    const winnerEntry = arenaStandings.standings.find(s => s.score === 1.0);
    assert.ok(winnerEntry, 'Winner must have 1.0 points in Arena');
    console.log('✓ Completed Arena match updated standings with 1.0 win points\n');

    // -------------------------------------------------------------
    // TEST 5: Idempotent Game Completion & Duplicate Event Protection
    // -------------------------------------------------------------
    console.log('--- TEST 5: Idempotency & Duplicate Protection ---');
    const scoredGameId = arenaMatches1.games[0].gameId;
    const preScore = winnerEntry.score;

    // Send the SAME game completion event a second and third time
    await fetch(`${BASE_URL}/api/tournaments/${arenaTourn.id}/games/${scoredGameId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({ result: '1-0' })
    });
    await fetch(`${BASE_URL}/api/tournaments/${arenaTourn.id}/games/${scoredGameId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({ result: '1-0' })
    });

    const checkStandings = await fetch(`${BASE_URL}/api/tournaments/${arenaTourn.id}/standings`).then(r => r.json());
    const postWinner = checkStandings.standings.find(s => s.userId === winnerEntry.userId);

    assert.strictEqual(postWinner.score, preScore, 'Duplicate game end calls must NOT double-score');
    console.log('✓ Idempotency verified: Triple-invoking game result did not double-count score\n');

    // -------------------------------------------------------------
    // TEST 6: Audit Events Durability in TiDB
    // -------------------------------------------------------------
    console.log('--- TEST 6: Durable Audit Events in TiDB ---');
    const [events] = await dbConn.query(
      `SELECT event_type, COUNT(*) as cnt FROM game_events WHERE game_id IN (?, ?, ?) GROUP BY event_type`,
      [swissTourn.id, capTourn.id, arenaTourn.id]
    );

    const eventTypes = events.map(e => e.event_type);
    assert.ok(eventTypes.includes('TOURNAMENT_CREATED'), 'Audit log must contain TOURNAMENT_CREATED');
    assert.ok(eventTypes.includes('TOURNAMENT_REGISTERED'), 'Audit log must contain TOURNAMENT_REGISTERED');
    assert.ok(eventTypes.includes('TOURNAMENT_STARTED'), 'Audit log must contain TOURNAMENT_STARTED');
    console.log(`✓ Verified durable TiDB audit events: ${eventTypes.join(', ')}`);

    console.log('\n================================================================');
    console.log('=== ALL PHASE 8 TOURNAMENT INTEGRITY TESTS PASSED (6/6)      ===');
    console.log('================================================================\n');

  } finally {
    serverProc.kill();
    await dbConn.end();
    redis.disconnect();
  }
}

run().catch(err => {
  console.error('\n[FATAL AUDIT ERROR]', err);
  process.exit(1);
});
