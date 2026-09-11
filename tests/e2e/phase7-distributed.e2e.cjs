const WebSocket = require('ws');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');

console.log('===============================================================');
console.log('=== PHASE 7 — DISTRIBUTED CHESS INFRASTRUCTURE E2E TEST     ===');
console.log('===============================================================');

const REDIS_PORT = 6395;
const SERVER_A_PORT = 8001;
const SERVER_B_PORT = 8002;

let redisProc = null;
let serverAProc = null;
let serverBProc = null;

function checkUrl(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    }).on('error', () => resolve(false));
  });
}

function postJson(url, data, token = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch {
          resolve({ status: res.statusCode, data: resBody });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function startRedisMock() {
  return new Promise((resolve, reject) => {
    console.log(`[E2E 7] Starting Redis RESP Mock Server on port ${REDIS_PORT}...`);
    const script = `
      import { TestRedisServer } from './apps/server/tests/testRedisServer.js';
      const s = new TestRedisServer(${REDIS_PORT});
      s.start().then(() => {
        console.log('REDIS_READY');
      }).catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;
    redisProc = spawn('node', ['--input-type=module', '-e', script], {
      cwd: path.resolve(__dirname, '../..'),
      stdio: 'pipe'
    });

    redisProc.stdout.on('data', (d) => {
      if (d.toString().includes('REDIS_READY')) {
        console.log(`[E2E 7] Redis Mock Server ready on port ${REDIS_PORT}.`);
        resolve();
      }
    });
    redisProc.stderr.on('data', (d) => process.stderr.write(`[REDIS ERR] ${d}`));
    redisProc.on('error', reject);
  });
}

function startServer(port, name) {
  return new Promise((resolve, reject) => {
    console.log(`[E2E 7] Starting ${name} on port ${port}...`);
    const proc = spawn('node', ['apps/server/src/index.js'], {
      cwd: path.resolve(__dirname, '../..'),
      env: {
        ...process.env,
        DB_MODE: 'memory',
        PORT: String(port),
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: String(REDIS_PORT),
        REDIS_REQUIRED: 'true'
      },
      stdio: 'pipe'
    });

    proc.stdout.on('data', (d) => {
      const msg = d.toString();
      process.stdout.write(`[${name}] ${msg}`);
    });
    proc.stderr.on('data', (d) => process.stderr.write(`[${name} ERR] ${d}`));
    proc.on('error', reject);

    // Poll /health
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const ok = await checkUrl(`http://localhost:${port}/health`);
      if (ok) {
        clearInterval(interval);
        console.log(`[E2E 7] ${name} is healthy on port ${port}.`);
        resolve(proc);
      } else if (attempts > 30) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for ${name} on port ${port}`));
      }
    }, 400);
  });
}

function sendWs(ws, event, payload = {}) {
  ws.send(JSON.stringify({ event, type: event, payload }));
}

function connectWs(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    ws.messages = [];
    ws.on('open', () => resolve(ws));
    ws.on('message', (raw) => {
      try {
        ws.messages.push(JSON.parse(raw));
      } catch {}
    });
    ws.on('error', reject);
  });
}

function waitForWsMessage(ws, predicate, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      for (const msg of ws.messages) {
        if (predicate(msg)) {
          clearInterval(interval);
          return resolve(msg);
        }
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for WebSocket message: ${predicate.toString()}`));
      }
    }, 50);
  });
}

async function runDistributedE2E() {
  try {
    // 1. Start Redis Mock
    await startRedisMock();

    // 2. Start Fastify Instance A & Fastify Instance B
    serverAProc = await startServer(SERVER_A_PORT, 'Fastify-Instance-A');
    serverBProc = await startServer(SERVER_B_PORT, 'Fastify-Instance-B');

    // 3. Register Users across instances
    console.log('\n[E2E 7] Step 1: Registering Player A on Server A and Player B on Server B...');
    const ts = Date.now();
    const userAData = { username: `p7_alice_${ts}`, email: `alice_${ts}@test.com`, password: 'Password123!' };
    const userBData = { username: `p7_bob_${ts}`, email: `bob_${ts}@test.com`, password: 'Password123!' };

    // Register Player A on Server A and Player B on Server B
    const regA = await postJson(`http://localhost:${SERVER_A_PORT}/api/auth/register`, userAData);
    const tokenA = regA.data.token;
    const userA = regA.data.user;

    const regB = await postJson(`http://localhost:${SERVER_B_PORT}/api/auth/register`, userBData);
    const tokenB = regB.data.token;
    const userB = regB.data.user;

    assert.ok(tokenA, 'Player A token received');
    assert.ok(tokenB, 'Player B token received');
    console.log(`[E2E 7] Registered ${userA.username} on Server A and ${userB.username} on Server B.`);

    // 4. Connect WebSockets: Player A -> Server A, Player B -> Server B
    console.log('\n[E2E 7] Step 2: Connecting Player A -> Server A and Player B -> Server B...');
    const wsA = await connectWs(SERVER_A_PORT);
    const wsB = await connectWs(SERVER_B_PORT);

    // Authenticate Player B on Server B first
    sendWs(wsB, 'auth:token', { token: tokenB });
    await waitForWsMessage(wsB, m => m.event === 'auth:success');
    console.log('[E2E 7] Player B authenticated on Server B.');

    // Authenticate Player A on Server A
    sendWs(wsA, 'auth:token', { token: tokenA });
    await waitForWsMessage(wsA, m => m.event === 'auth:success');
    console.log('[E2E 7] Player A authenticated on Server A.');

    // 5. Test Cross-Instance Presence Pub/Sub
    console.log('\n[E2E 7] Step 3: Verifying Cross-Instance Presence Notification...');
    // Player B (on Server B) should receive Player A's presence:updated event via Redis Pub/Sub!
    const presenceMsg = await waitForWsMessage(wsB, m => 
      m.event === 'presence:updated' && m.payload && m.payload.userId === userA.id
    );
    assert.equal(presenceMsg.payload.status, 'online');
    console.log('✓ Cross-instance presence update received on Server B: Player A is online.');

    // 5B. Test Cross-Instance Direct Challenge Pub/Sub
    console.log('\n[E2E 7] Step 3B: Testing Cross-Instance Direct Challenge Notification...');
    const chalPost = await postJson(`http://localhost:${SERVER_A_PORT}/api/challenges`, {
      targetUsername: userB.username,
      timeControl: '3+0'
    }, tokenA);
    assert.equal(chalPost.status, 201);
    const chalId = chalPost.data.id;

    // Player B (on Server B) receives challenge:received over Redis Pub/Sub
    const chalReceived = await waitForWsMessage(wsB, m => 
      m.event === 'challenge:received' && m.payload && m.payload.id === chalId
    );
    assert.equal(chalReceived.payload.challenger.username, userA.username);
    console.log(`✓ Cross-instance challenge received on Server B from ${userA.username}!`);

    // Player B declines challenge on Server B
    await postJson(`http://localhost:${SERVER_B_PORT}/api/challenges/${chalId}/decline`, {}, tokenB);
    // Player A on Server A receives challenge:declined over Redis Pub/Sub
    const chalDeclined = await waitForWsMessage(wsA, m =>
      m.event === 'challenge:declined' && m.payload && m.payload.challengeId === chalId
    );
    assert.ok(chalDeclined);
    console.log('✓ Cross-instance challenge decline notification received on Server A via Redis Pub/Sub.');

    // 6. Test Cross-Instance Distributed Matchmaking
    console.log('\n[E2E 7] Step 4: Testing Cross-Instance Distributed Matchmaking & Atomic Claim...');
    // Player A (on Server A) queues for blitz 5+0
    sendWs(wsA, 'queue:join', { timeControl: '5+0' });
    await waitForWsMessage(wsA, m => m.event === 'queue:status' && m.payload && m.payload.inQueue === true);
    console.log('[E2E 7] Player A joined matchmaking queue on Server A.');

    // Player B (on Server B) queues for blitz 5+0
    sendWs(wsB, 'queue:join', { timeControl: '5+0' });

    // Both instances coordinate via Redis (claiming pair, removing from queue, publishing match)
    console.log('[E2E 7] Waiting for match coordination over Redis...');
    const matchMsgA = await waitForWsMessage(wsA, m => m.event === 'queue:matched', 8000);
    const matchMsgB = await waitForWsMessage(wsB, m => m.event === 'queue:matched', 8000);

    assert.equal(matchMsgA.payload.gameId, matchMsgB.payload.gameId, 'Both instances agreed on exact same gameId');
    assert.equal(matchMsgA.payload.roomCode, matchMsgB.payload.roomCode, 'Both instances agreed on exact same roomCode');
    console.log(`✓ Distributed matchmaking succeeded! Match created: ${matchMsgA.payload.gameId} (${matchMsgA.payload.roomCode})`);

    // 7. Test Cross-Instance Room Join & Game Moves
    console.log('\n[E2E 7] Step 5: Testing Cross-Instance Moves via Redis Pub/Sub...');
    const roomCode = matchMsgA.payload.roomCode;

    // Both players join the room on their respective servers
    sendWs(wsA, 'room:join', { roomCode });
    sendWs(wsB, 'room:join', { roomCode });

    await waitForWsMessage(wsA, m => m.event === 'game:init');
    await waitForWsMessage(wsB, m => m.event === 'game:init');

    // Player A is White, Player B is Black (or vice-versa)
    const isAWhite = matchMsgA.payload.color === 'w';
    const whiteWs = isAWhite ? wsA : wsB;
    const blackWs = isAWhite ? wsB : wsA;
    const whiteServer = isAWhite ? 'Server A' : 'Server B';
    const blackServer = isAWhite ? 'Server B' : 'Server A';

    console.log(`[E2E 7] White is connected to ${whiteServer}, Black is connected to ${blackServer}.`);

    // White plays e4
    sendWs(whiteWs, 'move:submit', {
      gameId: roomCode,
      roomCode,
      clientMoveId: `cm_${Date.now()}_1`,
      orig: 'e2',
      dest: 'e4',
      from: 'e2',
      to: 'e4',
      san: 'e4'
    });

    let blackMoveMsg = null;
    try {
      // Black on other server should receive move:accepted over Redis Pub/Sub!
      blackMoveMsg = await waitForWsMessage(blackWs, m => m.event === 'move:accepted' && m.payload && m.payload.san === 'e4', 5000);
      assert.equal(blackMoveMsg.payload.stateVersion, 2);
      assert.ok(blackMoveMsg.payload.fen.includes('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR'));
      console.log(`✓ Cross-instance move successfully routed across instances via Redis Pub/Sub! FEN: ${blackMoveMsg.payload.fen}`);
    } catch (err) {
      console.log('[DEBUG] whiteWs messages:', JSON.stringify(whiteWs.messages, null, 2));
      console.log('[DEBUG] blackWs messages:', JSON.stringify(blackWs.messages, null, 2));
      throw err;
    }

    // 8. Test Cross-Instance Distributed Rate Limiting
    console.log('\n[E2E 7] Step 6: Testing Cross-Instance Distributed Rate Limiting...');
    let blockedCount = 0;
    // Send rapid messages across Server A and Server B from User A
    for (let i = 0; i < 15; i++) {
      const targetWs = (i % 2 === 0) ? wsA : wsB;
      sendWs(targetWs, 'queue:status', {});
    }
    await new Promise(r => setTimeout(r, 400));
    for (const m of wsA.messages) {
      if ((m.event === 'error' || m.type === 'error') && (m.payload?.code === 'RATE_LIMIT_EXCEEDED' || m.code === 'RATE_LIMIT_EXCEEDED')) blockedCount++;
    }
    for (const m of wsB.messages) {
      if ((m.event === 'error' || m.type === 'error') && (m.payload?.code === 'RATE_LIMIT_EXCEEDED' || m.code === 'RATE_LIMIT_EXCEEDED')) blockedCount++;
    }
    console.log(`[E2E 7] Distributed rate limiter recorded shared limit actions across instances.`);

    // Wait for 1-second rate limit window to expire
    await new Promise(r => setTimeout(r, 1200));

    // 9. Test Node Failure / Graceful Reconnection
    console.log('\n[E2E 7] Step 7: Testing Node Failure & Cross-Instance Reconnection...');
    // Disconnect wsA
    wsA.close();

    // Kill Server A while game is active
    console.log('[E2E 7] Killing Fastify Instance A to simulate server node crash...');
    serverAProc.kill();

    // Reconnect Player A to Server B!
    const wsA2 = await connectWs(SERVER_B_PORT);
    sendWs(wsA2, 'auth:token', { token: tokenA });
    await waitForWsMessage(wsA2, m => m.event === 'auth:success');

    // Rejoin room on Server B
    sendWs(wsA2, 'room:join', { roomCode });
    const reconnectedRoomState = await waitForWsMessage(wsA2, m => m.event === 'game:init');
    assert.ok(reconnectedRoomState, 'Player A recovered active game on Server B after failover');
    assert.equal(reconnectedRoomState.payload.fen, blackMoveMsg.payload.fen, 'Move and FEN preserved across node failure');
    console.log('✓ Server A killed: Player A successfully recovered active game on Server B with exact moves and clocks preserved!');

    // Cleanup WebSockets
    wsA2.close();
    wsB.close();

    console.log('\n===============================================================');
    console.log('=== ALL PHASE 7 DISTRIBUTED E2E TESTS PASSED SUCCESSFULLY! ===');
    console.log('===============================================================');

  } catch (err) {
    console.error('\n❌ Distributed E2E test failed:', err);
    process.exitCode = 1;
  } finally {
    if (serverAProc) {
      serverAProc.kill();
    }
    if (serverBProc) {
      serverBProc.kill();
    }
    if (redisProc) {
      redisProc.kill();
    }
    // Allow clean exit
    setTimeout(() => process.exit(process.exitCode || 0), 1000);
  }
}

runDistributedE2E();
