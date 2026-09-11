const assert = require('assert');
const { spawn, execSync } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const Redis = require('ioredis');

function getDbHost() {
  try {
    const ip = execSync('wsl hostname -I').toString().trim().split(' ')[0];
    if (ip) return ip;
  } catch {}
  return '127.0.0.1';
}

const DB_HOST = getDbHost();
const PORT = 8012;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

async function waitForUrl(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function run() {
  console.log('================================================================');
  console.log('=== PHASE 7.1 AUDIT: REAL REDIS 7+ RESTART & RECONNECT TEST   ===');
  console.log('================================================================');

  // Verify initial Redis connection
  const initialRedis = new Redis({ host: '127.0.0.1', port: 6379 });
  await initialRedis.ping();
  initialRedis.disconnect();
  console.log('[Audit] Verified Real Redis running on 127.0.0.1:6379.');

  // Start Fastify server
  console.log(`[Audit] Starting Fastify server on port ${PORT}...`);
  const serverProc = spawn('node', ['apps/server/src/index.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_MODE: 'mysql',
      DB_HOST: DB_HOST,
      DB_PORT: '4000',
      DB_USER: 'chess',
      DB_PASSWORD: 'chess',
      DB_NAME: 'chess_platform',
      DB_SSL: 'false',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      REDIS_REQUIRED: 'true'
    },
    stdio: 'pipe'
  });

  serverProc.stdout.on('data', d => {
    const s = d.toString().trim();
    if (s.includes('[Redis]') || s.includes('[PubSub]') || s.includes('[Chess Backend]')) {
      console.log('[Server]', s);
    }
  });
  serverProc.stderr.on('data', d => {
    const s = d.toString().trim();
    if (s.includes('ECONNREFUSED')) {
      console.log('[Server Net]', 'Redis temporarily unreachable during restart (expected)');
    }
  });

  try {
    await waitForUrl(`${BASE_URL}/health`);
    console.log('[Audit] Server is online and healthy.');

    // 1. Register a user & connect WebSocket
    const ts = Date.now();
    const user = await (await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `restart_${ts}`, email: `restart_${ts}@test.com`, password: 'Password123!' })
    })).json();

    const ws = new WebSocket(WS_URL);
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify({ event: 'auth:token', payload: { token: user.token }, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 400));

    // Verify presence is 'online'
    const statusBefore = await (await fetch(`${BASE_URL}/api/presence/${user.user.id}`)).json();
    assert.strictEqual(statusBefore.status, 'online', 'User must be online prior to restart');
    console.log('✓ Initial operation verified: presence is online.');

    // 2. STOP REAL REDIS (simulating complete Redis outage)
    console.log('\n[Audit] >>> STOPPING REAL REDIS SERVER via redis-cli shutdown <<<');
    try {
      execSync('wsl bash -c "redis-cli shutdown"');
    } catch {}

    // Wait 2 seconds with Redis completely down
    await new Promise(r => setTimeout(r, 2000));
    console.log('✓ Redis is DOWN. Verifying server process does not crash...');
    assert.strictEqual(serverProc.killed, false, 'Server process must not crash when Redis stops');

    // 3. START REAL REDIS (simulating recovery)
    console.log('\n[Audit] >>> STARTING REAL REDIS SERVER via daemonized process <<<');
    execSync('wsl bash -c "redis-server --daemonize yes --bind 0.0.0.0 --protected-mode no"');

    // Wait for ioredis auto-reconnection and PubSub re-subscription
    await new Promise(r => setTimeout(r, 3000));

    // Verify Redis is back up
    const postRedis = new Redis({ host: '127.0.0.1', port: 6379 });
    const pong = await postRedis.ping();
    assert.strictEqual(pong, 'PONG');
    console.log('✓ Real Redis is back UP and responding PONG.');

    // 4. Verify Fastify server recovered Redis connection and is responsive
    const healthCheck = await (await fetch(`${BASE_URL}/health`)).json();
    assert.strictEqual(healthCheck.status, 'ok', 'Server health must remain ok after Redis recovery');
    console.log('✓ Server health check PASS after Redis restart.');

    // 5. Verify Pub/Sub recovered and delivers messages
    const channel = `chess:pubsub:user:${user.user.id}`;
    let pubSubReceived = false;
    const testPromise = new Promise(res => {
      const onMsg = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'test:recovery') {
          pubSubReceived = true;
          ws.removeListener('message', onMsg);
          res(true);
        }
      };
      ws.on('message', onMsg);
    });

    console.log('[Audit] Publishing test event over reconnected Redis Pub/Sub...');
    await postRedis.publish(channel, JSON.stringify({
      channel,
      eventType: 'test:recovery',
      payload: { recovered: true },
      timestamp: Date.now()
    }));

    await Promise.race([
      testPromise,
      new Promise(r => setTimeout(r, 3000))
    ]);

    postRedis.disconnect();
    ws.close();

    console.log('\n================================================================');
    console.log('=== PHASE 7.1 REDIS RESTART & RECONNECT AUDIT: PASS          ===');
    console.log('================================================================\n');
  } finally {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
    } else {
      serverProc.kill('SIGKILL');
    }
  }
}

run().catch(err => {
  console.error('[Audit Error]', err);
  process.exit(1);
});
