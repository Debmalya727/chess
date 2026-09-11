/**
 * tests/security/websocket_security.test.cjs
 *
 * Phase 9 Security Suite: WebSocket Protocol Hardening, Unauthenticated
 * Rejection, Frame Size Bounds, Rate Limiting & Malformed Input Handling.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');

describe('WebSocket Security & Abuse Prevention', () => {
  let server;
  let port = 8011;
  let wsUrl = `ws://127.0.0.1:${port}/ws`;
  let testUser;
  let validToken;

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

    const pwdHash = await hashPassword('SecurePass123!');
    testUser = await createUser({
      username: `ws_user_${Date.now()}`,
      email: `ws_${Date.now()}@example.com`,
      passwordHash: pwdHash,
      role: 'PLAYER'
    });
    validToken = generateToken({ id: testUser.id, username: testUser.username, role: testUser.role });
  });

  after(async () => {
    if (server) {
      await server.close();
    }
  });

  const connectWs = () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  };

  test('Unauthenticated move attempt is strictly rejected with UNAUTHORIZED', async () => {
    const ws = await connectWs();
    try {
      const responsePromise = new Promise((resolve) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      // Attempt to submit move without authenticating
      ws.send(JSON.stringify({
        event: 'move:submit',
        payload: {
          gameId: 'game_unauth_test',
          from: 'e2',
          to: 'e4'
        }
      }));

      const res = await responsePromise;
      assert.strictEqual(res.event, 'error');
      assert.strictEqual(res.payload.code, 'UNAUTHORIZED');
    } finally {
      ws.close();
    }
  });

  test('Forged or tampered authentication token is rejected', async () => {
    const ws = await connectWs();
    try {
      const responsePromise = new Promise((resolve) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      ws.send(JSON.stringify({
        event: 'auth:token',
        payload: { token: 'eyFakeHeader.eyFakePayload.badSignature' }
      }));

      const res = await responsePromise;
      assert.strictEqual(res.event, 'error');
      assert.strictEqual(res.payload.code, 'UNAUTHORIZED');
    } finally {
      ws.close();
    }
  });

  test('Malformed JSON payloads return INVALID_JSON without crashing server', async () => {
    const ws = await connectWs();
    try {
      const responsePromise = new Promise((resolve) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      ws.send('{ this is definitely not valid json 12345 %%%');

      const res = await responsePromise;
      assert.strictEqual(res.event, 'error');
      assert.strictEqual(res.payload.code, 'INVALID_JSON');
    } finally {
      ws.close();
    }
  });

  test('Unknown event names return UNKNOWN_EVENT', async () => {
    const ws = await connectWs();
    try {
      const responsePromise = new Promise((resolve) => {
        ws.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      ws.send(JSON.stringify({
        event: 'exploit:privilege_escalation',
        payload: { grantRole: 'ADMIN' }
      }));

      const res = await responsePromise;
      assert.strictEqual(res.event, 'error');
      assert.strictEqual(res.payload.code, 'UNKNOWN_EVENT');
    } finally {
      ws.close();
    }
  });

  test('Oversized payload exceeding 64KB is rejected with PAYLOAD_TOO_LARGE or connection termination', async () => {
    const ws = await connectWs();
    try {
      let rejected = false;

      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.payload?.code === 'PAYLOAD_TOO_LARGE') rejected = true;
        } catch {}
      });
      ws.on('close', () => {
        rejected = true;
      });
      ws.on('error', () => {
        rejected = true;
      });

      // 70 KB payload exceeds maxPayload: 64KB
      const hugeString = 'X'.repeat(70 * 1024);
      ws.send(JSON.stringify({
        event: 'ping',
        payload: { garbage: hugeString }
      }));

      await new Promise(r => setTimeout(r, 400));
      assert.strictEqual(rejected, true, 'Oversized WebSocket frame safely rejected or connection closed');
    } finally {
      try { ws.close(); } catch {}
    }
  });

  test('Rapid message flood triggers RATE_LIMIT_EXCEEDED', async () => {
    const ws = await connectWs();
    try {
      let receivedRateLimit = false;

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.event === 'error' && msg.payload?.code === 'RATE_LIMIT_EXCEEDED') {
            receivedRateLimit = true;
          }
        } catch {}
      });

      // Send 15 messages in rapid succession (limit is 10/sec)
      for (let i = 0; i < 15; i++) {
        ws.send(JSON.stringify({ event: 'ping', payload: { i } }));
      }

      await new Promise(r => setTimeout(r, 400));
      assert.strictEqual(receivedRateLimit, true, 'Rate limit was triggered on message flood');
    } finally {
      try { ws.close(); } catch {}
    }
  });
});
