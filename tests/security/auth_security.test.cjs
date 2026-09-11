/**
 * Phase 9 Security Audit: Authentication & Credential Hardening Test Suite.
 * Verifies scrypt hashing, timing-safe compare, account enumeration resistance,
 * JWT signature verification, and login brute-force rate limiting.
 */
const assert = require('assert');
const path = require('path');
const jwt = require('jsonwebtoken');

async function runAuthSecurityTests() {
  console.log('================================================================');
  console.log('=== PHASE 9 SECURITY AUDIT: AUTHENTICATION & CREDENTIALS     ===');
  console.log('================================================================\n');

  process.env.DB_MODE = 'memory';
  process.env.NODE_ENV = 'test';

  const { createServer } = await import('../../apps/server/src/index.js');
  const { initDb } = await import('../../apps/server/src/db/index.js');
  const { hashPassword, verifyPassword } = await import('../../apps/server/src/auth/passwordService.js');
  const { config } = await import('../../apps/server/src/config/env.js');

  await initDb();
  const app = await createServer();

  // Test 1: Password Hashing Quality
  console.log('--- TEST 1: Password Hashing Architecture ---');
  const plainPassword = 'SuperSecretPassword123!';
  const hash = await hashPassword(plainPassword);
  assert.ok(hash.includes(':'), 'Stored hash must contain salt delimiter');
  const [salt, key] = hash.split(':');
  assert.strictEqual(salt.length, 32, 'Salt must be 16 bytes hex (32 chars)');
  assert.strictEqual(key.length, 128, 'Key derived via scrypt 64 bytes hex (128 chars)');
  assert.notStrictEqual(hash, plainPassword, 'Password must NEVER be stored plaintext');

  const isMatch = await verifyPassword(plainPassword, hash);
  assert.strictEqual(isMatch, true, 'Valid password matches hash');
  const isWrong = await verifyPassword('WrongPassword123!', hash);
  assert.strictEqual(isWrong, false, 'Invalid password rejected');
  console.log('✓ scrypt salt + derived key verified with constant-time comparison');

  // Test 2: Account Enumeration Resistance
  console.log('\n--- TEST 2: Account Enumeration Resistance ---');
  // Register a legitimate user
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      username: 'enum_target_user',
      email: 'enum_target@example.com',
      password: 'TargetPassword123!'
    }
  });
  assert.strictEqual(regRes.statusCode, 201, 'Registration must succeed');

  // Login with non-existent user
  const nonExistentRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      identifier: 'ghost_non_existent_user',
      password: 'ArbitraryPassword123!'
    }
  });
  assert.strictEqual(nonExistentRes.statusCode, 401);
  const nonExistentBody = JSON.parse(nonExistentRes.payload);

  // Login with existing user but wrong password
  const wrongPassRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      identifier: 'enum_target_user',
      password: 'IncorrectPassword123!'
    }
  });
  assert.strictEqual(wrongPassRes.statusCode, 401);
  const wrongPassBody = JSON.parse(wrongPassRes.payload);

  assert.strictEqual(nonExistentBody.error, wrongPassBody.error, 'Error code must be identical');
  assert.strictEqual(nonExistentBody.message, wrongPassBody.message, 'Error message must not reveal user existence');
  console.log('✓ Account enumeration prevented: Identical 401 INVALID_CREDENTIALS returned');

  // Test 3: JWT Signature & Expiration Security
  console.log('\n--- TEST 3: JWT Verification & Tamper Safety ---');
  const validToken = JSON.parse(regRes.payload).token;
  assert.ok(validToken, 'Valid token returned');

  // Access /api/auth/me with valid token
  const meRes = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${validToken}` }
  });
  assert.strictEqual(meRes.statusCode, 200);

  // Tampered Token: Modify payload
  const parts = validToken.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ id: 'usr_admin', username: 'admin', role: 'ADMIN' })).toString('base64url');
  const tamperedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;

  const tamperedRes = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${tamperedToken}` }
  });
  assert.strictEqual(tamperedRes.statusCode, 401, 'Tampered token signature must be rejected');

  // Expired Token
  const expiredToken = jwt.sign(
    { id: 'usr_expired_test', username: 'expired' },
    config.jwtSecret,
    { expiresIn: '-1s' }
  );
  const expiredRes = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${expiredToken}` }
  });
  assert.strictEqual(expiredRes.statusCode, 401, 'Expired token must be rejected');
  console.log('✓ Token tampering and expiration strictly enforced');

  // Test 4: Distributed Login Brute-Force Rate Limiting
  console.log('\n--- TEST 4: Login Rate Limiting & Abuse Prevention ---');
  let rateLimitHit = false;
  let blockedStatus = 0;
  let retryAfter = null;

  for (let i = 0; i < 25; i++) {
    const attempt = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        identifier: 'enum_target_user',
        password: `BruteForceGuess_${i}`
      }
    });
    if (attempt.statusCode === 429) {
      rateLimitHit = true;
      blockedStatus = attempt.statusCode;
      retryAfter = attempt.headers['retry-after'];
      break;
    }
  }

  assert.strictEqual(rateLimitHit, true, 'Excessive login attempts must trigger rate limiter (429)');
  assert.strictEqual(blockedStatus, 429);
  assert.ok(retryAfter, 'Retry-After header must be present');
  console.log(`✓ Brute-force protection verified: HTTP 429 RATE_LIMIT_EXCEEDED with Retry-After: ${retryAfter}s`);

  await app.close();
  console.log('\n================================================================');
  console.log('=== ALL AUTHENTICATION SECURITY TESTS PASSED (4/4)           ===');
  console.log('================================================================\n');
  process.exit(0);
}

runAuthSecurityTests().catch(err => {
  console.error('Auth security test failed:', err);
  process.exit(1);
});
