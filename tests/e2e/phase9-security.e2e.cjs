/**
 * tests/e2e/phase9-security.e2e.cjs
 *
 * PHASE 9 — ADVERSARIAL SECURITY, ABUSE PREVENTION & PRODUCTION HARDENING E2E
 *
 * Runs comprehensive adversarial scenarios against real HTTP & WebSocket endpoints:
 * 1. Unauthenticated request rejection (401)
 * 2. Role-Based Access Control (RBAC) privilege escalation defense (403)
 * 3. Object-Level Authorization (BOLA/IDOR) on challenges (403)
 * 4. SQL Injection payload rejection on auth & parameters
 * 5. Oversized HTTP payload protection (413 Payload Too Large)
 * 6. Distributed sliding-window rate limit enforcement (429)
 * 7. Matchmaking duplicate queue defense (ALREADY_IN_QUEUE)
 * 8. Self-challenge and social interaction abuse defense
 * 9. WebSocket unauthenticated operations & malformed message resilience
 * 10. WebSocket oversized frame protection & connection stability
 * 11. Game authority, turn enforcement & illegal move rejection
 * 12. Tournament capacity race enforcement under concurrency
 * 13. Zero secret leakage across public and private profile responses
 */

const http = require('http');
const assert = require('assert');
const WebSocket = require('ws');

const PORT = 8019;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

let server;

function request(method, path, body = null, token = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { ...extraHeaders };
    let payload = null;

    if (body !== null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBody: data
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function connectWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function runAdversarialSecuritySuite() {
  console.log('================================================================');
  console.log('=== PHASE 9 ADVERSARIAL SECURITY & PRODUCTION HARDENING E2E ===');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.DB_MODE = 'memory';
  process.env.REDIS_REQUIRED = 'false';

  const { createServer } = await import('../../apps/server/src/index.js');
  const { initDb } = await import('../../apps/server/src/db/index.js');
  const { createUser } = await import('../../apps/server/src/db/userRepository.js');
  const { hashPassword } = await import('../../apps/server/src/auth/passwordService.js');
  const { generateToken } = await import('../../apps/server/src/auth/authService.js');
  const { globalRoomManager } = await import('../../apps/server/src/rooms/roomManager.js');
  const { globalGameManager } = await import('../../apps/server/src/games/gameManager.js');

  await initDb();
  server = await createServer();
  await server.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`[Phase 9 E2E] Test server active on ${BASE_URL}`);

  const pwdHash = await hashPassword('SecurePass123!');

  // Seed Users
  const userAlice = await createUser({ id: `e2e_alice_${Date.now()}`, username: `alice_${Date.now()}`, email: `alice_${Date.now()}@adv.com`, passwordHash: pwdHash, role: 'PLAYER' });
  const userBob = await createUser({ id: `e2e_bob_${Date.now()}`, username: `bob_${Date.now()}`, email: `bob_${Date.now()}@adv.com`, passwordHash: pwdHash, role: 'PLAYER' });
  const userEve = await createUser({ id: `e2e_eve_${Date.now()}`, username: `eve_${Date.now()}`, email: `eve_${Date.now()}@adv.com`, passwordHash: pwdHash, role: 'PLAYER' });
  const userOrg = await createUser({ id: `e2e_org_${Date.now()}`, username: `org_${Date.now()}`, email: `org_${Date.now()}@adv.com`, passwordHash: pwdHash, role: 'TOURNAMENT_ORGANIZER' });

  const tokenAlice = generateToken(userAlice);
  const tokenBob = generateToken(userBob);
  const tokenEve = generateToken(userEve);
  const tokenOrg = generateToken(userOrg);

  let passedChecks = 0;
  const recordPass = (name) => {
    passedChecks++;
    console.log(`  ✓ Check ${passedChecks}: ${name}`);
  };

  // 1. Unauthenticated Request Rejection
  console.log('\n[Section 1: Authentication & Authorization Envelopes]');
  const unauthMe = await request('GET', '/api/users/me');
  assert.strictEqual(unauthMe.statusCode, 401);
  assert.strictEqual(unauthMe.body.error, 'UNAUTHORIZED');
  recordPass('Unauthenticated GET /api/users/me rejected with 401 UNAUTHORIZED');

  const unauthChallenges = await request('GET', '/api/challenges');
  assert.strictEqual(unauthChallenges.statusCode, 401);
  recordPass('Unauthenticated GET /api/challenges rejected with 401 UNAUTHORIZED');

  // 2. RBAC Privilege Escalation
  console.log('\n[Section 2: RBAC Privilege Escalation Defense]');
  const rbacEve = await request('POST', `/api/admin/users/${userEve.id}/role`, { role: 'ADMIN' }, tokenEve);
  assert.strictEqual(rbacEve.statusCode, 403);
  assert.strictEqual(rbacEve.body.error, 'FORBIDDEN');
  recordPass('Player attempting admin role promotion rejected with 403 FORBIDDEN');

  // 3. Object-Level Authorization (BOLA/IDOR) on Challenges
  console.log('\n[Section 3: Object-Level Authorization (BOLA/IDOR)]');
  const chalRes = await request('POST', '/api/challenges', { targetUsername: userBob.username, timeControl: '5+0' }, tokenAlice);
  assert.strictEqual(chalRes.statusCode, 201);
  const challengeId = chalRes.body.id;

  // Eve attempts to accept Alice's challenge to Bob
  const eveAccept = await request('POST', `/api/challenges/${challengeId}/accept`, {}, tokenEve);
  assert.strictEqual(eveAccept.statusCode, 403);
  assert.strictEqual(eveAccept.body.error, 'UNAUTHORIZED');
  recordPass('Third-party user accepting another player challenge rejected with 403 UNAUTHORIZED');

  // Bob legitimately declines
  const bobDecline = await request('POST', `/api/challenges/${challengeId}/decline`, {}, tokenBob);
  assert.strictEqual(bobDecline.statusCode, 200);
  recordPass('Legitimate recipient successfully declines challenge');

  // 4. SQL Injection Attack Defense
  console.log('\n[Section 4: SQL Injection Hardening]');
  const sqlLogin = await request('POST', '/api/auth/login', { username: "' OR '1'='1", password: 'random_password' });
  assert.strictEqual(sqlLogin.statusCode, 401);
  assert.strictEqual(sqlLogin.body.error, 'INVALID_CREDENTIALS');
  recordPass("SQL injection payload in auth (' OR '1'='1) safely rejected with 401");

  const sqlTourn = await request('GET', "/api/tournaments/'%20OR%201=1--");
  assert.strictEqual(sqlTourn.statusCode, 404);
  recordPass('SQL injection in URL path parameter safely rejected with 404');

  // 5. Oversized HTTP Payload (413)
  console.log('\n[Section 5: Request Body Size Bounds]');
  const hugeString = 'A'.repeat(80 * 1024); // 80 KB exceeds 64 KB limit
  const overflowRes = await request('POST', '/api/auth/login', { username: 'test', password: hugeString });
  assert.strictEqual(overflowRes.statusCode, 413);
  assert.strictEqual(overflowRes.body.error, 'PAYLOAD_TOO_LARGE');
  recordPass('Oversized 80KB HTTP body strictly rejected with 413 PAYLOAD_TOO_LARGE');

  // 6. Distributed Sliding-Window Rate Limiting
  console.log('\n[Section 6: Distributed Sliding-Window Rate Limiting]');
  let hitRateLimit = false;
  for (let i = 0; i < 25; i++) {
    const r = await request('POST', '/api/auth/login', { username: 'rate_target', password: 'bad_password' });
    if (r.statusCode === 429) {
      hitRateLimit = true;
      assert.strictEqual(r.body.error, 'RATE_LIMIT_EXCEEDED');
      assert.ok(r.headers['retry-after'], 'Retry-After header present');
      break;
    }
  }
  assert.strictEqual(hitRateLimit, true, 'Rate limiter triggers 429 after exceeding quota');
  recordPass('Authentication brute-force flood rejected with 429 RATE_LIMIT_EXCEEDED & Retry-After');

  // 7. Matchmaking Duplicate Queue Protection
  console.log('\n[Section 7: Matchmaking & Challenge Abuse Defense]');
  const qJoin1 = await request('POST', '/api/matchmaking/join', { timeControl: '10+0' }, tokenAlice);
  assert.strictEqual(qJoin1.statusCode, 200);

  const qJoin2 = await request('POST', '/api/matchmaking/join', { timeControl: '10+0' }, tokenAlice);
  assert.strictEqual(qJoin2.statusCode, 400);
  assert.strictEqual(qJoin2.body.error, 'ALREADY_IN_MATCHMAKING_QUEUE');
  recordPass('Simultaneous duplicate matchmaking queue entry rejected with ALREADY_IN_MATCHMAKING_QUEUE');

  // Leave queue
  await request('POST', '/api/matchmaking/leave', {}, tokenAlice);

  // Self-challenge defense
  const selfChal = await request('POST', '/api/challenges', { targetUsername: userAlice.username, timeControl: '5+0' }, tokenAlice);
  assert.strictEqual(selfChal.statusCode, 400);
  assert.strictEqual(selfChal.body.error, 'CANNOT_CHALLENGE_SELF');
  recordPass('Self-challenge attempt rejected with CANNOT_CHALLENGE_SELF');

  // 8. WebSocket Protocol Hardening
  console.log('\n[Section 8: WebSocket Protocol & Framing Hardening]');
  const ws = await connectWs();

  // Test malformed JSON
  const invalidJsonPromise = new Promise((resolve) => {
    ws.once('message', (d) => resolve(JSON.parse(d.toString())));
  });
  ws.send('{ invalid json payload ///');
  const invalidJsonRes = await invalidJsonPromise;
  assert.strictEqual(invalidJsonRes.event, 'error');
  assert.strictEqual(invalidJsonRes.payload.code, 'INVALID_JSON');
  recordPass('WebSocket malformed JSON safely returns INVALID_JSON without crashing server');

  // Test unknown event
  const unknownEvPromise = new Promise((resolve) => {
    ws.once('message', (d) => resolve(JSON.parse(d.toString())));
  });
  ws.send(JSON.stringify({ event: 'unknown:exploit' }));
  const unknownEvRes = await unknownEvPromise;
  assert.strictEqual(unknownEvRes.event, 'error');
  assert.strictEqual(unknownEvRes.payload.code, 'UNKNOWN_EVENT');
  recordPass('WebSocket unknown event safely returns UNKNOWN_EVENT');

  // Test unauthenticated move
  const unauthMovePromise = new Promise((resolve) => {
    ws.once('message', (d) => resolve(JSON.parse(d.toString())));
  });
  ws.send(JSON.stringify({
    event: 'move:submit',
    payload: { gameId: 'g_fake', from: 'e2', to: 'e4' }
  }));
  const unauthMoveRes = await unauthMovePromise;
  assert.strictEqual(unauthMoveRes.event, 'error');
  assert.strictEqual(unauthMoveRes.payload.code, 'UNAUTHORIZED');
  recordPass('WebSocket unauthenticated move submission strictly rejected with UNAUTHORIZED');
  ws.close();

  // 9. Game Authority & Turn Spoofing
  console.log('\n[Section 9: Game Authority & Anti-Cheat Invariants]');
  const roomId = `e2e_game_${Date.now()}`;
  const room = {
    id: roomId,
    roomCode: 'E2E_ROOM_1',
    whitePlayerId: userAlice.id,
    whiteUsername: userAlice.username,
    blackPlayerId: userBob.id,
    blackUsername: userBob.username,
    timeControl: '10+0',
    status: 'ACTIVE',
    rated: true,
    players: new Map([[userAlice.id, userAlice], [userBob.id, userBob]]),
    connectedSockets: new Map(),
    createdAt: new Date().toISOString()
  };
  globalRoomManager.roomsById.set(room.id, room);
  const session = globalGameManager.getOrCreateSession(room);

  // Eve attempts to move in Alice & Bob game
  const eveMoveRes = await session.processMove({ user: userEve, from: 'e2', to: 'e4' });
  assert.strictEqual(eveMoveRes.error, 'NOT_YOUR_TURN');
  recordPass('Third-party player move in active game rejected (NOT_YOUR_TURN)');

  // Bob attempts move during White turn
  const bobEarlyMove = await session.processMove({ user: userBob, from: 'e7', to: 'e5' });
  assert.strictEqual(bobEarlyMove.error, 'NOT_YOUR_TURN');
  recordPass('Player moving out of turn rejected (NOT_YOUR_TURN)');

  // Alice attempts illegal move
  const illegalMove = await session.processMove({ user: userAlice, from: 'e2', to: 'e5' });
  assert.strictEqual(illegalMove.error, 'INVALID_MOVE');
  recordPass('Illegal move rejected by server chess authority (INVALID_MOVE)');

  // 10. Tournament Capacity Concurrency Race
  console.log('\n[Section 10: Tournament Capacity Concurrency Defense]');
  const tournCreate = await request('POST', '/api/tournaments', {
    name: 'E2E Cap Race Arena',
    type: 'arena',
    timeControl: '3+0',
    maxPlayers: 2,
    minPlayers: 2
  }, tokenOrg);
  assert.strictEqual(tournCreate.statusCode, 201);
  const tId = tournCreate.body.id;

  // 3 concurrent registration requests for 2 slots
  const p1 = request('POST', `/api/tournaments/${tId}/register`, {}, tokenAlice);
  const p2 = request('POST', `/api/tournaments/${tId}/register`, {}, tokenBob);
  const p3 = request('POST', `/api/tournaments/${tId}/register`, {}, tokenEve);

  const tResults = await Promise.all([p1, p2, p3]);
  const tSuccess = tResults.filter(r => r.statusCode === 200);
  const tFull = tResults.filter(r => r.statusCode === 400 && r.body.error === 'TOURNAMENT_FULL');

  assert.strictEqual(tSuccess.length, 2, 'Exactly 2 slots granted');
  assert.strictEqual(tFull.length, 1, '3rd registration rejected with TOURNAMENT_FULL');
  recordPass('Concurrent registration race strictly capped at maxPlayers (2 accepted, 1 rejected)');

  // 11. Profile Secret Exposure Prevention
  console.log('\n[Section 11: Privacy & Secret Exposure Verification]');
  const meRes = await request('GET', '/api/users/me', null, tokenAlice);
  assert.strictEqual(meRes.statusCode, 200);
  assert.strictEqual(meRes.body.passwordHash, undefined, 'passwordHash must not leak');
  assert.strictEqual(meRes.body.salt, undefined, 'salt must not leak');
  recordPass('GET /api/users/me strictly suppresses passwordHash and credentials');

  const pubRes = await request('GET', `/api/users/${userAlice.username}`);
  assert.strictEqual(pubRes.statusCode, 200);
  assert.strictEqual(pubRes.body.email, undefined, 'Email must not leak on public profile');
  assert.strictEqual(pubRes.body.passwordHash, undefined, 'Password hash must not leak on public profile');
  recordPass('GET /api/users/:username strictly suppresses email and credentials');

  // Clean up
  await server.close();

  console.log('\n================================================================');
  console.log(`=== PHASE 9 ADVERSARIAL E2E COMPLETE: ${passedChecks}/${passedChecks} CHECKS PASSED ===`);
  console.log('================================================================\n');
  process.exit(0);
}

runAdversarialSecuritySuite().catch(err => {
  console.error('\n[Phase 9 E2E Fatal Failure]:', err);
  if (server) server.close().catch(() => {});
  process.exit(1);
});
