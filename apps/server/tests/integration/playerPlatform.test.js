import test from 'node:test';
import assert from 'node:assert/strict';
import fastify from 'fastify';
import cors from '@fastify/cors';
import { userRoutes } from '../../src/routes/users.js';
import { gameRoutes } from '../../src/routes/games.js';
import { authRoutes } from '../../src/routes/auth.js';
import { initDb } from '../../src/db/index.js';

test('Player Platform Integration API Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();

  const app = fastify();
  await app.register(cors);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(gameRoutes);

  let tokenA = '';
  let userAUsername = `playerA_${Date.now()}`;
  let tokenB = '';
  let userBUsername = `playerB_${Date.now()}`;

  await t.test('Register User A and User B', async () => {
    const resA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: userAUsername, email: `${userAUsername}@example.com`, password: 'Password123!' }
    });
    assert.equal(resA.statusCode, 201);
    const bodyA = JSON.parse(resA.body);
    tokenA = bodyA.token;

    const resB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: userBUsername, email: `${userBUsername}@example.com`, password: 'Password123!' }
    });
    assert.equal(resB.statusCode, 201);
    tokenB = JSON.parse(resB.body).token;
  });

  await t.test('GET /api/users/me returns authenticated player profile and ratings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${tokenA}` }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.username, userAUsername);
    assert.ok(body.statistics);
    assert.ok(body.ratings.blitz);
    assert.equal(body.ratings.blitz.rating, 1500);
  });

  await t.test('GET /api/users/:username returns public player profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${userAUsername}`
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.username, userAUsername);
    assert.ok(body.statistics);
    assert.ok(Array.isArray(body.recentGames));
  });

  await t.test('GET /api/users/me/ratings/:ratingType/history returns history or rejects invalid type', async () => {
    const resValid = await app.inject({
      method: 'GET',
      url: '/api/users/me/ratings/blitz/history',
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(resValid.statusCode, 200);
    assert.ok(Array.isArray(JSON.parse(resValid.body)));

    const resInvalid = await app.inject({
      method: 'GET',
      url: '/api/users/me/ratings/invalid_type/history',
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(resInvalid.statusCode, 400);
    assert.equal(JSON.parse(resInvalid.body).error, 'INVALID_RATING_TYPE');
  });

  await t.test('GET /api/games/history requires authentication and returns player games', async () => {
    const resUnauth = await app.inject({
      method: 'GET',
      url: '/api/games/history'
    });
    assert.equal(resUnauth.statusCode, 401);

    const resAuth = await app.inject({
      method: 'GET',
      url: '/api/games/history',
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(resAuth.statusCode, 200);
    const body = JSON.parse(resAuth.body);
    assert.ok(Array.isArray(body.games));
    assert.ok(body.pagination);
  });

  await t.test('GET /api/users/non_existent_user returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/definitely_not_a_real_user_123456789'
    });
    assert.equal(res.statusCode, 404);
    assert.equal(JSON.parse(res.body).error, 'USER_NOT_FOUND');
  });
});
