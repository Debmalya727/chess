import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/index.js';
import { initDb } from '../../src/db/index.js';
import { createUser } from '../../src/db/userRepository.js';
import { generateToken } from '../../src/auth/authService.js';
import { createGame } from '../../src/db/gameRepository.js';

test('Social Graph & Recent Opponents REST Integration Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();
  const app = await createServer();

  const userA = await createUser({ id: 'u_soc_a', username: 'SocialAlice', email: 'alice_s@test.com', passwordHash: 'hash', rating: 1500 });
  const userB = await createUser({ id: 'u_soc_b', username: 'SocialBob', email: 'bob_s@test.com', passwordHash: 'hash', rating: 1520 });

  const tokenA = generateToken(userA);
  const tokenB = generateToken(userB);

  let reqId = null;

  await t.test('POST /api/friends/request/:username sends friend request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/friends/request/${userB.username}`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.ok(body.id);
    assert.equal(body.status, 'pending');
    reqId = body.id;
  });

  await t.test('GET /api/friends/requests returns incoming/outgoing requests', async () => {
    const resB = await app.inject({
      method: 'GET',
      url: '/api/friends/requests',
      headers: { authorization: `Bearer ${tokenB}` }
    });
    assert.equal(resB.statusCode, 200);
    const bodyB = JSON.parse(resB.payload);
    assert.equal(bodyB.incoming.length, 1);
    assert.equal(bodyB.incoming[0].username, userA.username);

    const resA = await app.inject({
      method: 'GET',
      url: '/api/friends/requests',
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(resA.statusCode, 200);
    const bodyA = JSON.parse(resA.payload);
    assert.equal(bodyA.outgoing.length, 1);
    assert.equal(bodyA.outgoing[0].username, userB.username);
  });

  await t.test('POST /api/friends/requests/:id/accept accepts friend request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/friends/requests/${reqId}/accept`,
      headers: { authorization: `Bearer ${tokenB}` }
    });
    assert.equal(res.statusCode, 200);

    const friendsA = await app.inject({
      method: 'GET',
      url: '/api/friends',
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(friendsA.statusCode, 200);
    const body = JSON.parse(friendsA.payload);
    assert.equal(body.friends.length, 1);
    assert.equal(body.friends[0].username, userB.username);
    assert.ok(body.friends[0].presence);
  });

  await t.test('GET /api/users/me/opponents returns recent opponents', async () => {
    // Seed a finished game between Alice and Bob
    await createGame({
      id: 'g_opp_test_1',
      roomCode: 'OPP_RM1',
      whitePlayerId: userA.id,
      blackPlayerId: userB.id,
      status: 'FINISHED',
      result: '1-0',
      timeControl: '10+0'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me/opponents',
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body.opponents));
    assert.equal(body.opponents.length, 1);
    assert.equal(body.opponents[0].username, userB.username);
    assert.equal(body.opponents[0].wins, 1);
    assert.equal(body.opponents[0].losses, 0);
  });

  await t.test('POST /api/users/:username/block blocks user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/users/${userB.username}/block`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(res.statusCode, 200);

    const blocks = await app.inject({
      method: 'GET',
      url: '/api/blocks',
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(blocks.statusCode, 200);
    const blockBody = JSON.parse(blocks.payload);
    assert.equal(blockBody.blocked.length, 1);
    assert.equal(blockBody.blocked[0].username, userB.username);

    // Unblock
    const unblock = await app.inject({
      method: 'DELETE',
      url: `/api/users/${userB.username}/block`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(unblock.statusCode, 200);
  });
});
