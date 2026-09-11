/**
 * tests/security/input_validation.test.cjs
 *
 * Phase 9 Security Suite: Input Validation, SQL Injection Defense,
 * Payload Size Limits & Pagination Guardrails.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');

describe('Input Validation & SQL Injection Hardening', () => {
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

    const pwdHash = await hashPassword('SecurePass123!');
    testUser = await createUser({
      username: `input_user_${Date.now()}`,
      email: `input_${Date.now()}@example.com`,
      passwordHash: pwdHash,
      role: 'PLAYER'
    });
    authToken = generateToken({ id: testUser.id, username: testUser.username, role: testUser.role });
  });

  after(async () => {
    if (app) await app.close();
  });

  test('SQL Injection payloads in authentication do not bypass auth or crash server', async () => {
    const payloads = [
      "' OR '1'='1",
      "admin'--",
      "' OR 1=1 --",
      "\" OR \"\"=\"",
      "'; DROP TABLE users; --",
      "1' UNION SELECT 1, 'admin', 'hash', 'admin@chess.com' --"
    ];

    for (const sqlPayload of payloads) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: sqlPayload,
          password: 'Password123!'
        }
      });
      // Must be safely rejected without 500 syntax error
      assert.strictEqual(res.statusCode, 401, `SQL injection in username rejected with 401: ${sqlPayload}`);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error, 'INVALID_CREDENTIALS');
      assert.strictEqual(body.details, undefined, 'No SQL or internal details exposed');
    }
  });

  test('SQL Injection in URL route parameters is safely parameterized and handled', async () => {
    const maliciousIds = [
      "1' OR '1'='1",
      "'; DROP TABLE tournaments; --",
      "../etc/passwd",
      "00000000-0000-0000-0000-000000000000' UNION SELECT 1 --"
    ];

    for (const malId of maliciousIds) {
      const tRes = await app.inject({
        method: 'GET',
        url: `/api/tournaments/${encodeURIComponent(malId)}`
      });
      assert.strictEqual(tRes.statusCode, 404, `Malicious tournament ID rejected safely: ${malId}`);

      const uRes = await app.inject({
        method: 'GET',
        url: `/api/users/${encodeURIComponent(malId)}`
      });
      assert.strictEqual(uRes.statusCode, 404, `Malicious username rejected safely: ${malId}`);
    }
  });

  test('Request body size limit enforces 413 Payload Too Large on oversized bodies', async () => {
    // Generate payload larger than 64 KB (e.g. 80 KB)
    const largePayload = {
      username: 'test_overflow',
      password: 'A'.repeat(80 * 1024)
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: largePayload
    });

    assert.strictEqual(res.statusCode, 413, 'Oversized HTTP body rejected with 413 Payload Too Large');
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, 'PAYLOAD_TOO_LARGE');
  });

  test('Pagination parameter guardrails reject or normalize out-of-bound inputs', async () => {
    // 1. Leaderboard negative limit
    const negLimitRes = await app.inject({
      method: 'GET',
      url: '/api/leaderboards/rapid?limit=-10'
    });
    assert.strictEqual(negLimitRes.statusCode, 400);
    assert.strictEqual(JSON.parse(negLimitRes.payload).error, 'INVALID_INPUT');

    // 2. Leaderboard limit > 100
    const hugeLimitRes = await app.inject({
      method: 'GET',
      url: '/api/leaderboards/rapid?limit=999999'
    });
    assert.strictEqual(hugeLimitRes.statusCode, 400);
    assert.strictEqual(JSON.parse(hugeLimitRes.payload).error, 'INVALID_INPUT');

    // 3. Leaderboard page < 1
    const negPageRes = await app.inject({
      method: 'GET',
      url: '/api/leaderboards/rapid?page=0'
    });
    assert.strictEqual(negPageRes.statusCode, 400);
    assert.strictEqual(JSON.parse(negPageRes.payload).error, 'INVALID_INPUT');

    // 4. Tournament list pagination clamp (handles string or huge limit safely)
    const tournRes = await app.inject({
      method: 'GET',
      url: '/api/tournaments?limit=999999&offset=-5'
    });
    assert.strictEqual(tournRes.statusCode, 200, 'Tournaments query normalizes pagination without crashing');
    const tourns = JSON.parse(tournRes.payload);
    assert.ok(Array.isArray(tourns.tournaments));
    assert.ok(tourns.tournaments.length <= 100, 'Clamped to safe maximum limit');
  });

  test('Malformed JSON and unexpected object types handled without unhandled exception', async () => {
    // Pass object in place of string
    const typeRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: { nested: 'object' },
        password: [1, 2, 3]
      }
    });
    assert.ok([400, 401].includes(typeRes.statusCode), 'Type confusion rejected safely');

    // Null password
    const nullRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'validuser',
        password: null
      }
    });
    assert.ok([400, 401].includes(nullRes.statusCode), 'Null password rejected safely');
  });
});
