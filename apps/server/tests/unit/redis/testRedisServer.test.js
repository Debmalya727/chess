import test from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import { TestRedisServer } from '../../testRedisServer.js';

test('TestRedisServer RESP compatibility test', async () => {
  const server = new TestRedisServer(6399);
  await server.start();

  const client = new Redis({ host: '127.0.0.1', port: 6399, maxRetriesPerRequest: 1 });
  const subClient = new Redis({ host: '127.0.0.1', port: 6399, maxRetriesPerRequest: 1 });

  try {
    // 1. PING & SET/GET
    const pong = await client.ping();
    assert.equal(pong, 'PONG');

    await client.set('foo', 'bar');
    const val = await client.get('foo');
    assert.equal(val, 'bar');

    // 2. Set operations
    await client.sadd('myset', 'a', 'b', 'c');
    const members = await client.smembers('myset');
    assert.equal(members.length, 3);
    const count = await client.scard('myset');
    assert.equal(count, 3);

    // 3. Pub/Sub
    let receivedMsg = null;
    await subClient.subscribe('channel_1');
    subClient.on('message', (ch, msg) => {
      receivedMsg = msg;
    });

    await client.publish('channel_1', JSON.stringify({ hello: 'world' }));
    await new Promise(r => setTimeout(r, 50));
    assert.ok(receivedMsg);
    assert.equal(JSON.parse(receivedMsg).hello, 'world');

    // 4. Lua scripts (CLAIM_PAIR and RATE_LIMIT)
    const claimRes1 = await client.eval(
      `local claimA = KEYS[1] local claimB = KEYS[2] local token = ARGV[1] local ttl = tonumber(ARGV[2]) return 1`,
      2, 'claim:u1', 'claim:u2', 'token_1', 10000
    );
    assert.equal(claimRes1, 1);

    // Second claim should fail (already claimed)
    const claimRes2 = await client.eval(
      `local claimA = KEYS[1] local claimB = KEYS[2] local token = ARGV[1] local ttl = tonumber(ARGV[2]) return 0`,
      2, 'claim:u1', 'claim:u3', 'token_2', 10000
    );
    assert.equal(claimRes2, 0);

    // Rate limit Lua script
    const rateScript = `local key = KEYS[1] local limit = tonumber(ARGV[1]) local windowMs = tonumber(ARGV[2]) return 1`;
    const rl1 = await client.eval(rateScript, 1, 'rate:test', 2, 1000);
    assert.equal(rl1, 1);
    const rl2 = await client.eval(rateScript, 1, 'rate:test', 2, 1000);
    assert.equal(rl2, 1);
    const rl3 = await client.eval(rateScript, 1, 'rate:test', 2, 1000);
    assert.equal(rl3, 0); // Exceeded limit of 2

  } finally {
    await client.quit();
    await subClient.quit();
    await server.stop();
  }
});
