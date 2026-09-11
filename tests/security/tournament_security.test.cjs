/**
 * tests/security/tournament_security.test.cjs
 *
 * Phase 9 Security Suite: Tournament Capacity Race Safety, Concurrency
 * Guardrails, State Versioning & Lifecycle Privilege Verification.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');

describe('Tournament Security & Capacity Abuse Defense', () => {
  let app;
  let orgUser;
  let tokenOrg;
  let testPlayers = [];
  let playerTokens = [];
  let globalTournamentService;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_MODE = 'memory';
    process.env.REDIS_REQUIRED = 'false';

    const { createServer } = await import('../../apps/server/src/index.js');
    const { initDb } = await import('../../apps/server/src/db/index.js');
    const { createUser } = await import('../../apps/server/src/db/userRepository.js');
    const { hashPassword } = await import('../../apps/server/src/auth/passwordService.js');
    const { generateToken } = await import('../../apps/server/src/auth/authService.js');
    const tournModule = await import('../../apps/server/src/tournaments/tournamentService.js');

    globalTournamentService = tournModule.globalTournamentService;

    await initDb();
    app = await createServer();

    const pwdHash = await hashPassword('SecurePass123!');
    orgUser = await createUser({
      id: `org_tourn_${Date.now()}`,
      username: `org_sec_${Date.now()}`,
      email: `org_${Date.now()}@tourn.com`,
      passwordHash: pwdHash,
      role: 'TOURNAMENT_ORGANIZER'
    });
    tokenOrg = generateToken(orgUser);

    for (let i = 0; i < 16; i++) {
      const u = await createUser({
        id: `ply_${i}_${Date.now()}`,
        username: `player_${i}_${Date.now()}`,
        email: `ply_${i}_${Date.now()}@tourn.com`,
        passwordHash: pwdHash,
        role: 'PLAYER'
      });
      testPlayers.push(u);
      playerTokens.push(generateToken(u));
    }
  });

  after(async () => {
    if (app) await app.close();
  });

  test('Concurrent tournament registration enforces max capacity (4 accepted, 12 rejected)', async () => {
    // 1. Organizer creates tournament with capacity 4
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${tokenOrg}` },
      payload: {
        name: 'Strict Capacity Arena',
        type: 'arena',
        timeControl: '3+0',
        maxPlayers: 4,
        minPlayers: 2
      }
    });

    assert.strictEqual(createRes.statusCode, 201);
    const tournamentId = JSON.parse(createRes.payload).id;

    // 2. Hammer registration with 16 simultaneous requests
    const regPromises = testPlayers.map((player, idx) =>
      app.inject({
        method: 'POST',
        url: `/api/tournaments/${tournamentId}/register`,
        headers: { authorization: `Bearer ${playerTokens[idx]}` }
      })
    );

    const responses = await Promise.all(regPromises);

    const accepted = responses.filter(r => r.statusCode === 200);
    const rejected = responses.filter(r => r.statusCode === 400 || r.statusCode === 409);

    assert.strictEqual(accepted.length, 4, 'Exactly 4 players accepted into capacity-4 tournament');
    assert.strictEqual(rejected.length, 12, '12 surplus players rejected due to capacity limit');

    for (const r of rejected) {
      const body = JSON.parse(r.payload);
      assert.strictEqual(body.error, 'TOURNAMENT_FULL');
    }

    // Verify participants list in DB
    const partsRes = await app.inject({
      method: 'GET',
      url: `/api/tournaments/${tournamentId}/participants`
    });
    assert.strictEqual(partsRes.statusCode, 200);
    const participants = JSON.parse(partsRes.payload).participants;
    assert.strictEqual(participants.length, 4, 'Authoritative participants list strictly bounded to 4');
  });

  test('Duplicate registration by the same player is rejected (ALREADY_REGISTERED)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${tokenOrg}` },
      payload: {
        name: 'Dup Reg Test',
        type: 'swiss',
        timeControl: '5+0',
        maxPlayers: 8
      }
    });

    const tournamentId = JSON.parse(createRes.payload).id;

    // First registration
    const firstRes = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${tournamentId}/register`,
      headers: { authorization: `Bearer ${playerTokens[0]}` }
    });
    assert.strictEqual(firstRes.statusCode, 200);

    // Second registration attempt by same user
    const dupRes = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${tournamentId}/register`,
      headers: { authorization: `Bearer ${playerTokens[0]}` }
    });
    assert.strictEqual(dupRes.statusCode, 400);
    const body = JSON.parse(dupRes.payload);
    assert.strictEqual(body.error, 'ALREADY_REGISTERED');
  });

  test('Registration after tournament has started is rejected (TOURNAMENT_ALREADY_STARTED)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${tokenOrg}` },
      payload: {
        name: 'Late Reg Test',
        type: 'arena',
        timeControl: '3+0',
        maxPlayers: 8,
        minPlayers: 2
      }
    });

    const tournamentId = JSON.parse(createRes.payload).id;

    // Register minimum players
    await app.inject({
      method: 'POST',
      url: `/api/tournaments/${tournamentId}/register`,
      headers: { authorization: `Bearer ${playerTokens[0]}` }
    });
    await app.inject({
      method: 'POST',
      url: `/api/tournaments/${tournamentId}/register`,
      headers: { authorization: `Bearer ${playerTokens[1]}` }
    });

    // Organizer starts tournament
    const startRes = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${tournamentId}/start`,
      headers: { authorization: `Bearer ${tokenOrg}` }
    });
    assert.strictEqual(startRes.statusCode, 200);

    // Late player attempts to register
    const lateRes = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${tournamentId}/register`,
      headers: { authorization: `Bearer ${playerTokens[2]}` }
    });
    assert.strictEqual(lateRes.statusCode, 400);
    const body = JSON.parse(lateRes.payload);
    assert.strictEqual(body.error, 'TOURNAMENT_ALREADY_STARTED');
  });

  test('Unauthorized player cannot start or modify tournament (403 FORBIDDEN)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${tokenOrg}` },
      payload: { name: 'RBAC Lifecycle Test', type: 'arena', maxPlayers: 4 }
    });
    const tournamentId = JSON.parse(createRes.payload).id;

    // Player attempts to start tournament
    const startRes = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${tournamentId}/start`,
      headers: { authorization: `Bearer ${playerTokens[0]}` }
    });
    assert.strictEqual(startRes.statusCode, 403, 'Player cannot trigger tournament start');

    // Player attempts to pair round
    const pairRes = await app.inject({
      method: 'POST',
      url: `/api/tournaments/${tournamentId}/pair`,
      headers: { authorization: `Bearer ${playerTokens[0]}` }
    });
    assert.strictEqual(pairRes.statusCode, 403, 'Player cannot trigger manual pairings');
  });
});
