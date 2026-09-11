import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/index.js';
import { initDb } from '../../src/db/index.js';
import { createUser } from '../../src/db/userRepository.js';
import { generateToken } from '../../src/auth/authService.js';

test('RBAC Tournament Creation Integration Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();
  const app = await createServer();

  const player = await createUser({ id: 'u_int_player', username: 'NormalPlayerInt', email: 'npi@test.com', passwordHash: 'hash', role: 'PLAYER' });
  const organizer = await createUser({ id: 'u_int_org', username: 'OrgPlayerInt', email: 'opi@test.com', passwordHash: 'hash', role: 'TOURNAMENT_ORGANIZER' });

  const playerToken = generateToken(player);
  const orgToken = generateToken(organizer);

  await t.test('POST /api/tournaments rejects regular player with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${playerToken}` },
      payload: { name: 'Player Arena', type: 'arena' }
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.payload);
    assert.equal(body.error, 'FORBIDDEN');
  });

  await t.test('POST /api/tournaments allows tournament organizer with 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tournaments',
      headers: { authorization: `Bearer ${orgToken}` },
      payload: { name: 'Organizer Arena', type: 'arena', timeControl: '5+0' }
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.ok(body.id);
    assert.equal(body.name, 'Organizer Arena');
  });
});
