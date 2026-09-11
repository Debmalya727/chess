import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/index.js';
import { initDb } from '../../src/db/index.js';
import { createUser } from '../../src/db/userRepository.js';
import { generateToken } from '../../src/auth/authService.js';
import { globalRoomManager } from '../../src/rooms/roomManager.js';

test('Direct Challenges REST Integration Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();
  const app = await createServer();

  const userA = await createUser({ id: 'u_ic_a', username: 'ChalAlice', email: 'ca@test.com', passwordHash: 'hash', rating: 1500 });
  const userB = await createUser({ id: 'u_ic_b', username: 'ChalBob', email: 'cb@test.com', passwordHash: 'hash', rating: 1510 });

  const tokenA = generateToken(userA);
  const tokenB = generateToken(userB);

  let challengeId = null;

  await t.test('POST /api/challenges creates direct challenge', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/challenges',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        targetUsername: userB.username,
        timeControl: '5+0',
        colorPreference: 'random'
      }
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.ok(body.id);
    assert.equal(body.status, 'pending');
    challengeId = body.id;
  });

  await t.test('GET /api/challenges lists challenges for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/challenges',
      headers: { authorization: `Bearer ${tokenB}` }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.incoming.length, 1);
    assert.equal(body.incoming[0].challengerUsername, userA.username);
  });

  await t.test('POST /api/challenges/:id/accept accepts challenge and launches game', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/challenges/${challengeId}/accept`,
      headers: { authorization: `Bearer ${tokenB}` }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.ok(body.gameId);
    assert.ok(body.roomCode);

    // Verify room is ACTIVE
    const room = globalRoomManager.getRoomById(body.gameId);
    assert.ok(room);
    assert.equal(room.status, 'ACTIVE');

    // Cleanup active rooms
    globalRoomManager.roomsById.clear();
    globalRoomManager.roomsByCode.clear();
  });
});
