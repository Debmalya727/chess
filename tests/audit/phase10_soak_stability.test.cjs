/**
 * Phase 10 Soak & Resource Stability Test
 * Continuous representative workloads measuring memory, connections, and error stability.
 */
const http = require('http');
const assert = require('assert');

function httpRequest(url, options = {}, data = null) {
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
    if (data) {
      if (typeof data === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(data));
      } else {
        req.write(data);
      }
    }
    req.end();
  });
}

async function runSoakTest() {
  console.log('================================================================');
  console.log('=== PHASE 10: CONTROLLED RESOURCE USAGE & STABILITY SOAK TEST ===');
  console.log('=== [LOCAL BENCHMARK ENVIRONMENT]                            ===');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.DB_MODE = 'memory';
  process.env.PORT = '8015';

  const { createServer } = await import('../../apps/server/src/index.js');
  const { initDb } = await import('../../apps/server/src/db/index.js');
  const { initRedis, closeRedis } = await import('../../apps/server/src/redis/redisClient.js');

  await initDb();
  await initRedis();
  const server = await createServer();
  await server.listen({ port: 8015, host: '127.0.0.1' });

  const BASE_URL = 'http://127.0.0.1:8015';

  // Garbage collect if available
  if (global.gc) global.gc();

  const initialMem = process.memoryUsage();
  console.log('[Initial Baseline Metrics]');
  console.log(`- RSS: ${(initialMem.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Heap Used: ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- Heap Total: ${(initialMem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`- External: ${(initialMem.external / 1024 / 1024).toFixed(2)} MB`);

  const { createUser } = await import('../../apps/server/src/db/userRepository.js');
  const { generateToken } = await import('../../apps/server/src/auth/authService.js');
  const { hashPassword } = await import('../../apps/server/src/auth/passwordService.js');

  // Pre-seed an organizer user
  const organizerId = `soak_org_${Date.now()}`;
  const orgPasswordHash = await hashPassword('AdminOrganizer2026!');
  const organizerUser = await createUser({
    id: organizerId,
    username: `soak_organizer_${Date.now()}`,
    email: `org_${Date.now()}@chessplatform.io`,
    passwordHash: orgPasswordHash,
    role: 'TOURNAMENT_ORGANIZER'
  });
  const organizerToken = generateToken(organizerUser);

  // Pre-seed a pool of authenticated players
  console.log('[Setup] Seeding authenticated user pool for soak simulation...');
  const userPool = [];
  for (let i = 0; i < 5; i++) {
    const uname = `soak_pool_${i}_${Date.now()}`;
    const r = await httpRequest(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'x-forwarded-for': `10.10.1.${i + 1}` }
    }, {
      username: uname,
      email: `${uname}@soakpool.com`,
      password: 'SoakPoolPassword1!'
    });
    if (r.statusCode === 201) {
      userPool.push({ username: uname, token: r.json.token });
    }
  }

  // Create baseline tournament with organizer
  const baseTournRes = await httpRequest(`${BASE_URL}/api/tournaments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${organizerToken}`,
      'x-forwarded-for': '10.10.1.99'
    }
  }, {
    name: 'Soak Endurance Arena',
    type: 'arena',
    timeControl: '5+0',
    durationMinutes: 60
  });
  assert.strictEqual(baseTournRes.statusCode, 201);
  const baselineTournId = baseTournRes.json.id;

  const DURATION_SECONDS = parseInt(process.env.SOAK_DURATION_SECONDS || '60', 10);
  console.log(`\n[Execution] Running continuous soak iterations for ${DURATION_SECONDS} seconds...`);

  const startTime = Date.now();
  let iterations = 0;
  let errorCount = 0;
  let totalRequests = 1;

  while ((Date.now() - startTime) < (DURATION_SECONDS * 1000)) {
    iterations++;
    const currentUser = userPool[iterations % userPool.length];
    const clientIp = `10.20.${Math.floor(iterations / 250)}.${(iterations % 250) + 1}`;

    try {
      // 1. Health & Readiness
      const healthRes = await httpRequest(`${BASE_URL}/health`);
      const readyRes = await httpRequest(`${BASE_URL}/readiness`);
      totalRequests += 2;
      assert.strictEqual(healthRes.statusCode, 200);
      assert.strictEqual(readyRes.statusCode, 200);

      // 2. User profile query
      const meRes = await httpRequest(`${BASE_URL}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${currentUser.token}`,
          'x-forwarded-for': clientIp
        }
      });
      totalRequests++;
      assert.strictEqual(meRes.statusCode, 200);

      // 3. Tournament listing
      const listRes = await httpRequest(`${BASE_URL}/api/tournaments?limit=5`, {
        headers: { 'x-forwarded-for': clientIp }
      });
      totalRequests++;
      assert.strictEqual(listRes.statusCode, 200);

      // 4. Tournament details & standings queries
      const detailsRes = await httpRequest(`${BASE_URL}/api/tournaments/${baselineTournId}`, {
        headers: { 'x-forwarded-for': clientIp }
      });
      totalRequests++;
      assert.strictEqual(detailsRes.statusCode, 200);

      const standingsRes = await httpRequest(`${BASE_URL}/api/tournaments/${baselineTournId}/standings`, {
        headers: { 'x-forwarded-for': clientIp }
      });
      totalRequests++;
      assert.strictEqual(standingsRes.statusCode, 200);

      // Log intermediate metrics every 25 iterations
      if (iterations % 25 === 0) {
        const curMem = process.memoryUsage();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Soak Progress: ${elapsed}s / ${DURATION_SECONDS}s] Iteration: ${iterations}, Total Requests: ${totalRequests}, Heap Used: ${(curMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      }
    } catch (err) {
      errorCount++;
      console.error(`[Soak Iteration ${iterations} Error]:`, err.message);
    }

    // Yield event loop briefly
    await new Promise(r => setTimeout(r, 20));
  }

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
  const finalMem = process.memoryUsage();

  console.log('\n[Final Stability & Resource Metrics]');
  console.log(`- Elapsed Duration: ${elapsedSeconds} seconds`);
  console.log(`- Completed Iterations: ${iterations}`);
  console.log(`- Total HTTP Requests Processed: ${totalRequests}`);
  console.log(`- Total Errors: ${errorCount}`);
  console.log(`- Final RSS: ${(finalMem.rss / 1024 / 1024).toFixed(2)} MB (Delta: ${((finalMem.rss - initialMem.rss) / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`- Final Heap Used: ${(finalMem.heapUsed / 1024 / 1024).toFixed(2)} MB (Delta: ${((finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`- Final Heap Total: ${(finalMem.heapTotal / 1024 / 1024).toFixed(2)} MB`);

  await server.close();
  await closeRedis();

  assert.strictEqual(errorCount, 0, 'Soak test must complete with 0 unhandled errors');
  console.log('\n================================================================');
  console.log('=== PHASE 10 SOAK & STABILITY TEST: CERTIFIED PASS           ===');
  console.log('================================================================\n');
  process.exit(0);
}

runSoakTest().catch(err => {
  console.error('\n[Soak Test Fatal Failure]:', err);
  process.exit(1);
});
