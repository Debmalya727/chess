/**
 * tests/security/secret_exposure.test.cjs
 *
 * Phase 9 Security Suite: Secret Leakage Audit, Password Hash Privacy,
 * Internal 500 Error Masking & Frontend Environment Isolation.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Secret Exposure & Error Sanitization Hardening', () => {
  let app;
  let testUser;
  let authToken;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_MODE = 'memory';
    process.env.REDIS_REQUIRED = 'false';

    const { createServer } = await import('../../apps/server/src/index.js');
    const { initDb } = await import('../../apps/server/src/db/index.js');
    const { createUser } = await import('../../apps/server/src/db/userRepository.js');
    const { hashPassword } = await import('../../apps/server/src/auth/passwordService.js');
    const { generateToken } = await import('../../apps/server/src/auth/authService.js');

    await initDb();
    app = await createServer();

    // Register temporary route to simulate unexpected internal exception
    app.get('/api/test/trigger-error', async () => {
      const err = new Error('DATABASE CONNECTION FAILED: Access denied for user tidb_admin@10.0.0.5 SELECT * FROM users');
      err.statusCode = 500;
      throw err;
    });

    const pwdHash = await hashPassword('Secret123!');
    testUser = await createUser({
      id: `sec_exp_${Date.now()}`,
      username: `secret_user_${Date.now()}`,
      email: `secret_${Date.now()}@example.com`,
      passwordHash: pwdHash,
      role: 'PLAYER'
    });
    authToken = generateToken(testUser);
  });

  after(async () => {
    if (app) await app.close();
  });

  test('GET /api/users/me never exposes passwordHash or credentials', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${authToken}` }
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.passwordHash, undefined, 'passwordHash must never be returned');
    assert.strictEqual(body.password, undefined, 'password must never be returned');
    assert.strictEqual(body.salt, undefined, 'salt must never be returned');
    assert.ok(!res.payload.includes(testUser.passwordHash), 'Raw password hash not present in payload');
  });

  test('GET /api/users/:username never exposes email, passwordHash, or moderation secrets', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/users/${testUser.username}`
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.passwordHash, undefined, 'passwordHash must never be exposed');
    assert.strictEqual(body.email, undefined, 'email must never be exposed on public profile');
    assert.strictEqual(body.role, undefined, 'internal role not exposed on public profile');
    assert.ok(!res.payload.includes('Secret123!'), 'No credential leaked');
  });

  test('Global 500 error handler strips SQL details, stack traces, and database credentials', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/test/trigger-error'
    });

    assert.strictEqual(res.statusCode, 500);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, 'INTERNAL_SERVER_ERROR');
    assert.strictEqual(body.message, 'An internal error occurred. Please try again later.');

    // Ensure raw error message and connection details are NOT present in client response
    assert.ok(!res.payload.includes('tidb_admin'), 'Database user must not be exposed');
    assert.ok(!res.payload.includes('10.0.0.5'), 'Database IP must not be exposed');
    assert.ok(!res.payload.includes('SELECT * FROM users'), 'Raw SQL statement must not be exposed');
    assert.strictEqual(body.stack, undefined, 'Stack trace must not be exposed');
  });

  test('Client bundle & env files do not leak server secrets into frontend', () => {
    const webClientDir = path.resolve(__dirname, '../../apps/web/client');
    const envPath = path.join(webClientDir, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      assert.ok(!content.includes('DB_PASSWORD'), 'DB_PASSWORD must not be in web client .env');
      assert.ok(!content.includes('JWT_SECRET'), 'JWT_SECRET must not be in web client .env');
      assert.ok(!content.includes('REDIS_PASSWORD'), 'REDIS_PASSWORD must not be in web client .env');
    }

    const packageJson = JSON.parse(fs.readFileSync(path.join(webClientDir, 'package.json'), 'utf8'));
    assert.ok(packageJson.dependencies, 'Web package has valid dependencies');
  });
});
