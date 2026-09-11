import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRateLimitStore, RedisRateLimitStore } from '../../../src/websocket/rateLimitStore.js';

test('RateLimitStore Unit Tests', async (t) => {
  await t.test('InMemoryRateLimitStore allows up to limit within window', async () => {
    const store = new InMemoryRateLimitStore();
    const limit = 3;
    const windowMs = 500;

    assert.equal(await store.isAllowed('ws', 'user1', limit, windowMs), true);
    assert.equal(await store.isAllowed('ws', 'user1', limit, windowMs), true);
    assert.equal(await store.isAllowed('ws', 'user1', limit, windowMs), true);
    // 4th request exceeds limit of 3
    assert.equal(await store.isAllowed('ws', 'user1', limit, windowMs), false);

    // Another user is unaffected
    assert.equal(await store.isAllowed('ws', 'user2', limit, windowMs), true);
  });

  await t.test('InMemoryRateLimitStore resets after window expires', async () => {
    const store = new InMemoryRateLimitStore();
    const limit = 2;
    const windowMs = 60; // 60 ms window

    assert.equal(await store.isAllowed('match', 'userA', limit, windowMs), true);
    assert.equal(await store.isAllowed('match', 'userA', limit, windowMs), true);
    assert.equal(await store.isAllowed('match', 'userA', limit, windowMs), false);

    // Wait for window to expire
    await new Promise(r => setTimeout(r, 70));

    // Now should be allowed again
    assert.equal(await store.isAllowed('match', 'userA', limit, windowMs), true);
  });

  await t.test('RedisRateLimitStore gracefully handles disconnected state', async () => {
    const store = new RedisRateLimitStore();
    // Default development mode (REDIS_REQUIRED=false) fails open
    const allowed = await store.isAllowed('ws', 'unconnected_user', 5, 1000);
    assert.equal(typeof allowed, 'boolean');
  });
});
