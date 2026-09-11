/**
 * Phase 10 Independent Audit: Health & Readiness Failure Test
 * 
 * Verifies HTTP status codes and payloads for:
 * - /health and /api/health (Process Liveness)
 * - /readiness and /api/readiness (Dependency Readiness)
 * 
 * Under 3 conditions:
 * 1. Normal operation: Both Liveness (200) and Readiness (200) pass.
 * 2. Redis unavailable with REDIS_REQUIRED=true: Liveness passes (200), Readiness fails (503).
 * 3. Database unavailable: Liveness passes (200), Readiness fails (503).
 */
const assert = require('assert');
const http = require('http');

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body, json });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runHealthReadinessFailureAudit() {
  console.log('================================================================');
  console.log('=== PHASE 10 AUDIT: HEALTH & READINESS FAILURE MODES         ===');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.PORT = '8025';

  const { createServer } = await import('../../apps/server/src/index.js');
  const { initDb } = await import('../../apps/server/src/db/index.js');
  const { redisConfig } = await import('../../apps/server/src/redis/redisConfig.js');

  await initDb();
  const server = await createServer();
  await server.listen({ port: 8025, host: '127.0.0.1' });
  const BASE_URL = 'http://127.0.0.1:8025';

  // ---------------------------------------------------------------
  // Condition 1: Normal Operation (Development / Non-mandatory Redis)
  // ---------------------------------------------------------------
  console.log('[Condition 1] Testing normal operation...');
  process.env.REDIS_REQUIRED = 'false';

  const h1 = await httpRequest(`${BASE_URL}/health`);
  const ah1 = await httpRequest(`${BASE_URL}/api/health`);
  const r1 = await httpRequest(`${BASE_URL}/readiness`);
  const ar1 = await httpRequest(`${BASE_URL}/api/readiness`);

  assert.strictEqual(h1.statusCode, 200, 'GET /health must return 200 in normal operation');
  assert.strictEqual(ah1.statusCode, 200, 'GET /api/health must return 200 in normal operation');
  assert.strictEqual(h1.json.status, 'ok');

  assert.strictEqual(r1.statusCode, 200, 'GET /readiness must return 200 in normal operation');
  assert.strictEqual(ar1.statusCode, 200, 'GET /api/readiness must return 200 in normal operation');
  assert.strictEqual(r1.json.status, 'ready');
  console.log('✓ Condition 1 PASS: Liveness (200 OK) & Readiness (200 Ready).');

  // ---------------------------------------------------------------
  // Condition 2: Redis Unavailable in Production (REDIS_REQUIRED = true)
  // ---------------------------------------------------------------
  console.log('\n[Condition 2] Testing Redis unavailable with production policy (REDIS_REQUIRED=true)...');
  process.env.REDIS_REQUIRED = 'true';

  const h2 = await httpRequest(`${BASE_URL}/health`);
  assert.strictEqual(h2.statusCode, 200, 'GET /health must remain 200 (Process is still alive)');
  assert.strictEqual(h2.json.status, 'ok');

  const r2 = await httpRequest(`${BASE_URL}/readiness`);
  const ar2 = await httpRequest(`${BASE_URL}/api/readiness`);
  assert.strictEqual(r2.statusCode, 503, 'GET /readiness must return 503 when Redis is unavailable in production');
  assert.strictEqual(ar2.statusCode, 503, 'GET /api/readiness must return 503 when Redis is unavailable in production');
  assert.strictEqual(r2.json.status, 'not_ready');
  assert.strictEqual(r2.json.redisRequired, true);
  console.log(`✓ Condition 2 PASS: /health remains 200 (Process Alive), /readiness returns 503 Service Unavailable (Redis Missing).`);

  // Restore REDIS_REQUIRED
  process.env.REDIS_REQUIRED = 'false';

  // ---------------------------------------------------------------
  // Condition 3: Database Unavailable Simulation
  // ---------------------------------------------------------------
  console.log('\n[Condition 3] Testing Database failure safety...');
  const dbModule = await import('../../apps/server/src/db/index.js');
  const originalPool = dbModule.getPool();
  const originalConnected = dbModule.isUsingMysql();

  // Mock MySQL active with failing pool
  dbModule._setPoolForTesting({
    query: async () => { throw new Error('ECONNREFUSED: Database cluster unreachable'); }
  }, true);

  const h3 = await httpRequest(`${BASE_URL}/health`);
  assert.strictEqual(h3.statusCode, 200, 'GET /health remains 200 (Liveness unaffected by external DB)');

  const r3 = await httpRequest(`${BASE_URL}/readiness`);
  assert.strictEqual(r3.statusCode, 503, 'GET /readiness must return 503 when Database is unreachable');
  assert.strictEqual(r3.json.status, 'not_ready');
  assert.strictEqual(r3.json.database, 'error');
  console.log('✓ Condition 3 PASS: /health remains 200, /readiness returns 503 (Database Error).');

  // Restore DB state
  dbModule._setPoolForTesting(originalPool, originalConnected);
  process.env.REDIS_REQUIRED = 'false';

  await server.close();

  console.log('\n================================================================');
  console.log('=== HEALTH & READINESS FAILURE MODES: CERTIFIED PASS         ===');
  console.log('================================================================\n');
  process.exit(0);
}

runHealthReadinessFailureAudit().catch(err => {
  console.error('\n[Health/Readiness Failure Audit Error]:', err);
  process.exit(1);
});
