import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/index.js';
import { initDb } from '../../src/db/index.js';
import { createUser, updateUserRole } from '../../src/db/userRepository.js';
import { generateToken } from '../../src/auth/authService.js';

test('Role-Based Access Control (RBAC) Unit Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();
  const app = await createServer();

  const playerUser = await createUser({ id: 'u_rbac_player', username: 'NormalPlayer', email: 'np@test.com', passwordHash: 'hash', role: 'PLAYER' });
  const organizerUser = await createUser({ id: 'u_rbac_org', username: 'OrganizerUser', email: 'org@test.com', passwordHash: 'hash', role: 'TOURNAMENT_ORGANIZER' });
  const adminUser = await createUser({ id: 'u_rbac_admin', username: 'AdminUser', email: 'admin@test.com', passwordHash: 'hash', role: 'ADMIN' });

  const playerToken = generateToken(playerUser);
  const orgToken = generateToken(organizerUser);
  const adminToken = generateToken(adminUser);

  await t.test('Unauthenticated user cannot create tournament (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      payload: { name: 'Unauthorized Open', type: 'arena' }
    });
    assert.equal(res.statusCode, 401);
  });

  await t.test('Regular PLAYER cannot create tournament (403 FORBIDDEN)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${playerToken}` },
      payload: { name: 'Player Attempt Open', type: 'arena' }
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.payload);
    assert.equal(body.error, 'FORBIDDEN');
  });

  await t.test('TOURNAMENT_ORGANIZER can create tournament (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${orgToken}` },
      payload: { name: 'Organizer Blitz Arena', type: 'arena', timeControl: '3+0' }
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.ok(body.id);
    assert.equal(body.name, 'Organizer Blitz Arena');
  });

  await t.test('ADMIN can create tournament (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Admin Championship', type: 'swiss', timeControl: '10+0' }
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.ok(body.id);
    assert.equal(body.name, 'Admin Championship');
  });

  await t.test('Updating user role empowers permissions dynamically', async () => {
    // Elevate player to TOURNAMENT_ORGANIZER
    await updateUserRole(playerUser.id, 'TOURNAMENT_ORGANIZER');

    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${playerToken}` },
      payload: { name: 'Promoted Player Tournament', type: 'arena' }
    });
    assert.equal(res.statusCode, 201);
  });
});
