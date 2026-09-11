import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/index.js';
import { initDb } from '../src/db/index.js';

test('Authentication API Integration Tests', async (t) => {
  await initDb();
  const app = await createServer();

  const testUser = {
    username: `user_${Date.now()}`,
    email: `user_${Date.now()}@example.com`,
    password: 'password123'
  };

  let token = null;

  await t.test('POST /api/auth/register creates user and returns JWT token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: testUser
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.user.username, testUser.username);
    assert.ok(body.token);
    token = body.token;
  });

  await t.test('POST /api/auth/register rejects duplicate email/username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: testUser
    });

    assert.equal(res.statusCode, 409);
  });

  await t.test('POST /api/auth/login validates credentials and returns token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: testUser.email,
        password: testUser.password
      }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.user.username, testUser.username);
    assert.ok(body.token);
  });

  await t.test('POST /api/auth/login rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: testUser.email,
        password: 'wrong_password'
      }
    });

    assert.equal(res.statusCode, 401);
  });

  await t.test('GET /api/auth/me returns authenticated profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.user.username, testUser.username);
  });
});
