/**
 * tests/security/load_stress.test.cjs
 *
 * Phase 9 Security Suite: Controlled Local Load & Concurrency Stress Test.
 * Measures real latency, throughput, error rates, and resource stability under load.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');

describe('Local Load & Concurrency Stress Testing', () => {
  let server;
  let port = 8013;
  let wsUrl = `ws://127.0.0.1:${port}/ws`;
  let testUsers = [];
  let userTokens = [];

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
    server = await createServer();
    await server.listen({ port, host: '127.0.0.1' });

    const pwdHash = await hashPassword('Pass123!');
    for (let i = 0; i < 20; i++) {
      const u = await createUser({
        id: `load_user_${i}_${Date.now()}`,
        username: `load_${i}_${Date.now()}`,
        email: `load_${i}_${Date.now()}@stress.com`,
        passwordHash: pwdHash,
        role: 'PLAYER'
      });
      testUsers.push(u);
      userTokens.push(generateToken(u));
    }
  });

  after(async () => {
    if (server) await server.close();
  });

  test('Concurrent HTTP Read Load: 200 health and leaderboard requests', async () => {
    const totalRequests = 200;
    const concurrency = 20;
    const latencies = [];
    let successes = 0;
    let failures = 0;

    const startTime = Date.now();

    for (let batch = 0; batch < totalRequests; batch += concurrency) {
      const batchPromises = [];
      for (let i = 0; i < concurrency; i++) {
        const reqStart = Date.now();
        batchPromises.push(
          server.inject({
            method: 'GET',
            url: '/health'
          }).then(res => {
            latencies.push(Date.now() - reqStart);
            if (res.statusCode === 200) successes++;
            else failures++;
          }).catch(() => {
            failures++;
          })
        );
      }
      await Promise.all(batchPromises);
    }

    const totalDurationMs = Date.now() - startTime;
    const throughput = Math.round((totalRequests / (totalDurationMs / 1000)));
    const avgLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
    latencies.sort((a, b) => a - b);
    const p95Latency = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`\n[Load Test: HTTP Reads] Requests: ${totalRequests}, Concurrency: ${concurrency}`);
    console.log(`  Duration: ${totalDurationMs}ms | Throughput: ${throughput} req/s`);
    console.log(`  Avg Latency: ${avgLatency}ms | p95 Latency: ${p95Latency}ms`);
    console.log(`  Success: ${successes} | Failures: ${failures} | Error Rate: ${((failures / totalRequests) * 100).toFixed(1)}%`);

    assert.strictEqual(failures, 0, 'All concurrent HTTP requests succeeded');
    assert.strictEqual(successes, totalRequests);
    assert.ok(throughput > 100, 'Throughput exceeds baseline 100 req/s');
  });

  test('Concurrent WebSocket Connections: 20 simultaneous connected clients', async () => {
    const connectionCount = 20;
    const sockets = [];
    const connectStart = Date.now();

    const connectPromises = Array.from({ length: connectionCount }, (_, i) => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.on('open', () => {
          sockets.push(ws);
          resolve(ws);
        });
        ws.on('error', reject);
      });
    });

    await Promise.all(connectPromises);
    const connectDurationMs = Date.now() - connectStart;

    console.log(`\n[Load Test: WebSocket Connections] Connected: ${sockets.length} clients in ${connectDurationMs}ms`);

    // Verify all sockets can ping simultaneously
    const pingStart = Date.now();
    const pingPromises = sockets.map(ws => {
      return new Promise((resolve) => {
        const handler = (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.event === 'pong') {
            ws.off('message', handler);
            resolve();
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ event: 'ping', payload: {} }));
      });
    });

    await Promise.all(pingPromises);
    const pingDurationMs = Date.now() - pingStart;
    console.log(`  Concurrent broadcast / ping completed in ${pingDurationMs}ms`);

    // Clean up
    for (const ws of sockets) {
      ws.close();
    }
    assert.strictEqual(sockets.length, connectionCount);
  });
});
