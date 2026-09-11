import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/index.js';
import { initDb } from '../src/db/index.js';

test('Game & Room REST API Integration Tests', async (t) => {
  await initDb();
  const app = await createServer();

  // Create two test users
  const p1Res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: `p1_${Date.now()}`, email: `p1_${Date.now()}@example.com`, password: 'password123' }
  });
  const p1Token = JSON.parse(p1Res.payload).token;

  const p2Res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: `p2_${Date.now()}`, email: `p2_${Date.now()}@example.com`, password: 'password123' }
  });
  const p2Token = JSON.parse(p2Res.payload).token;

  let createdGame = null;

  await t.test('POST /api/games creates private room with room code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: { authorization: `Bearer ${p1Token}` },
      payload: { timeControl: '10+0', colorPreference: 'w' }
    });

    assert.equal(res.statusCode, 201);
    createdGame = JSON.parse(res.payload);
    assert.ok(createdGame.gameId);
    assert.ok(createdGame.roomCode);
    assert.equal(createdGame.status, 'WAITING');
  });

  await t.test('POST /api/games/:roomCode/join joins room and sets status ACTIVE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/games/${createdGame.roomCode}/join`,
      headers: { authorization: `Bearer ${p2Token}` }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'ACTIVE');
    assert.equal(body.color, 'b');
  });

  await t.test('GET /api/games/:gameId returns game details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/games/${createdGame.gameId}`
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.id, createdGame.gameId);
  });
});
