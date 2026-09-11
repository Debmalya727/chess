/**
 * Phase 9 Security Audit: Authorization, RBAC & BOLA / IDOR Test Suite.
 * Verifies object-level authorization across games, audit events, challenges, and tournaments.
 */
const assert = require('assert');

async function runBolaTests() {
  console.log('================================================================');
  console.log('=== PHASE 9 SECURITY AUDIT: AUTHORIZATION & BOLA / IDOR       ===');
  console.log('================================================================\n');

  process.env.DB_MODE = 'memory';
  process.env.NODE_ENV = 'test';

  const { createServer } = await import('../../apps/server/src/index.js');
  const { initDb } = await import('../../apps/server/src/db/index.js');
  const { createUser } = await import('../../apps/server/src/db/userRepository.js');
  const { createGame } = await import('../../apps/server/src/db/gameRepository.js');
  const { generateToken } = await import('../../apps/server/src/auth/authService.js');

  await initDb();
  const app = await createServer();

  // Create Users: Alice, Bob, Eve (Attacker), Org1, Org2, Admin
  const userAlice = await createUser({ id: 'u_alice', username: 'Alice', email: 'alice@test.com', passwordHash: 'h', role: 'PLAYER' });
  const userBob = await createUser({ id: 'u_bob', username: 'Bob', email: 'bob@test.com', passwordHash: 'h', role: 'PLAYER' });
  const userEve = await createUser({ id: 'u_eve', username: 'EveAttacker', email: 'eve@test.com', passwordHash: 'h', role: 'PLAYER' });
  const userOrg1 = await createUser({ id: 'u_org1', username: 'Organizer1', email: 'org1@test.com', passwordHash: 'h', role: 'TOURNAMENT_ORGANIZER' });
  const userAdmin = await createUser({ id: 'u_admin', username: 'Admin', email: 'admin@test.com', passwordHash: 'h', role: 'ADMIN' });

  const tokenAlice = generateToken(userAlice);
  const tokenBob = generateToken(userBob);
  const tokenEve = generateToken(userEve);
  const tokenOrg1 = generateToken(userOrg1);
  const tokenAdmin = generateToken(userAdmin);

  // Test 1: RBAC Hierarchy Enforcement
  console.log('--- TEST 1: RBAC Server-Side Role Enforcement ---');
  // Eve attempts to create a tournament
  const createTournRes = await app.inject({
    method: 'POST',
    url: '/api/tournaments',
    headers: { authorization: `Bearer ${tokenEve}` },
    payload: { name: 'Eve Hacked Open', type: 'arena' }
  });
  assert.strictEqual(createTournRes.statusCode, 403, 'PLAYER cannot create tournament');
  assert.strictEqual(JSON.parse(createTournRes.payload).error, 'FORBIDDEN');

  // Eve attempts admin role promotion without admin rights
  process.env.NODE_ENV = 'production'; // simulate production check
  const promoteRes = await app.inject({
    method: 'POST',
    url: `/api/admin/users/${userEve.id}/role`,
    headers: { authorization: `Bearer ${tokenEve}` },
    payload: { role: 'ADMIN' }
  });
  assert.strictEqual(promoteRes.statusCode, 403, 'Non-admin cannot elevate roles');
  process.env.NODE_ENV = 'test';
  console.log('✓ Server-side RBAC successfully enforced (403 FORBIDDEN)');

  // Test 2: BOLA / IDOR on Game Audit Events
  console.log('\n--- TEST 2: Object-Level Authorization on Game Audit Events ---');
  const gameId = 'game_secret_match_1';
  await createGame({
    id: gameId,
    roomCode: 'ROOM_SECRET_1',
    whitePlayerId: userAlice.id,
    blackPlayerId: userBob.id,
    status: 'FINISHED'
  });

  // Eve (non-participant) attempts to inspect private game events
  const eveAuditRes = await app.inject({
    method: 'GET',
    url: `/api/games/${gameId}/events`,
    headers: { authorization: `Bearer ${tokenEve}` }
  });
  assert.strictEqual(eveAuditRes.statusCode, 403, 'Non-participant must be denied audit events');
  assert.strictEqual(JSON.parse(eveAuditRes.payload).error, 'FORBIDDEN');

  // Alice (participant) requests audit events -> Allowed
  const aliceAuditRes = await app.inject({
    method: 'GET',
    url: `/api/games/${gameId}/events`,
    headers: { authorization: `Bearer ${tokenAlice}` }
  });
  assert.strictEqual(aliceAuditRes.statusCode, 200, 'Game participant can inspect audit events');

  // Admin requests audit events -> Allowed
  const adminAuditRes = await app.inject({
    method: 'GET',
    url: `/api/games/${gameId}/events`,
    headers: { authorization: `Bearer ${tokenAdmin}` }
  });
  assert.strictEqual(adminAuditRes.statusCode, 200, 'Admin can inspect audit events');
  console.log('✓ Game audit trail protected against BOLA/IDOR');

  // Test 3: BOLA / IDOR on Direct Challenges
  console.log('\n--- TEST 3: Challenge Tamper & Impersonation Prevention ---');
  // Alice challenges Bob
  const chalRes = await app.inject({
    method: 'POST',
    url: '/api/challenges',
    headers: { authorization: `Bearer ${tokenAlice}` },
    payload: { targetUsername: userBob.username, timeControl: '5+0' }
  });
  assert.strictEqual(chalRes.statusCode, 201);
  const challengeId = JSON.parse(chalRes.payload).id;

  // Eve attempts to accept Bob's challenge
  const eveAcceptRes = await app.inject({
    method: 'POST',
    url: `/api/challenges/${challengeId}/accept`,
    headers: { authorization: `Bearer ${tokenEve}` }
  });
  assert.strictEqual(eveAcceptRes.statusCode, 403, 'Third party cannot accept challenge');
  assert.strictEqual(JSON.parse(eveAcceptRes.payload).error, 'UNAUTHORIZED');

  // Eve attempts to cancel Alice's challenge
  const eveCancelRes = await app.inject({
    method: 'DELETE',
    url: `/api/challenges/${challengeId}`,
    headers: { authorization: `Bearer ${tokenEve}` }
  });
  assert.strictEqual(eveCancelRes.statusCode, 403, 'Third party cannot cancel challenge');
  assert.strictEqual(JSON.parse(eveCancelRes.payload).error, 'UNAUTHORIZED');

  // Bob (valid recipient) accepts challenge -> 200
  const bobAcceptRes = await app.inject({
    method: 'POST',
    url: `/api/challenges/${challengeId}/accept`,
    headers: { authorization: `Bearer ${tokenBob}` }
  });
  assert.strictEqual(bobAcceptRes.statusCode, 200, 'Challenged player successfully accepts');
  console.log('✓ Challenge object-level authorization strictly enforced');

  // Test 4: Tournament Organizer Ownership Controls
  console.log('\n--- TEST 4: Tournament Organizer Lifecycle Authorization ---');
  // Org1 creates tournament
  const tRes = await app.inject({
    method: 'POST',
    url: '/api/tournaments',
    headers: { authorization: `Bearer ${tokenOrg1}` },
    payload: { name: 'Org1 Closed Championship', type: 'swiss' }
  });
  assert.strictEqual(tRes.statusCode, 201);
  const tournId = JSON.parse(tRes.payload).id;

  // Eve (Player) attempts to start tournament
  const eveStartRes = await app.inject({
    method: 'POST',
    url: `/api/tournaments/${tournId}/start`,
    headers: { authorization: `Bearer ${tokenEve}` }
  });
  assert.strictEqual(eveStartRes.statusCode, 403, 'Player cannot start tournament');

  // Unauthenticated start attempt
  const unauthStartRes = await app.inject({
    method: 'POST',
    url: `/api/tournaments/${tournId}/start`
  });
  assert.strictEqual(unauthStartRes.statusCode, 401, 'Unauthenticated request receives 401');
  console.log('✓ Tournament organizer lifecycle controls protected');

  await app.close();
  console.log('\n================================================================');
  console.log('=== ALL AUTHORIZATION & BOLA TESTS PASSED (4/4)              ===');
  console.log('================================================================\n');
  process.exit(0);
}

runBolaTests().catch(err => {
  console.error('BOLA security test failed:', err);
  process.exit(1);
});
