import test from 'node:test';
import assert from 'node:assert/strict';
import { RedisMatchmakingStore } from '../../../src/matchmaking/redisMatchmakingStore.js';
import { RedisPresenceStore } from '../../../src/presence/redisPresenceStore.js';

test('RedisMatchmakingStore and RedisPresenceStore Unit Tests', async (t) => {
  await t.test('RedisMatchmakingStore returns safe defaults when Redis is disconnected', async () => {
    const store = new RedisMatchmakingStore();
    assert.equal(await store.has('u1'), false);
    assert.equal(await store.get('u1'), null);
    assert.deepEqual(await store.getAll(), []);
    assert.equal(await store.size(), 0);
    assert.equal(await store.add('u1', { ratingType: 'blitz', timeControl: '3+2' }), false);
    assert.equal(await store.remove('u1'), false);
    // claimPair falls back safely to true when Redis disconnected
    assert.equal(await store.claimPair('u1', 'u2'), true);
  });

  await t.test('RedisPresenceStore returns offline defaults when Redis is disconnected', async () => {
    const store = new RedisPresenceStore();
    assert.equal(await store.getUserStatus('u1'), 'offline');
    assert.deepEqual(await store.getOnlineUserIds(), []);
    assert.equal(await store.getSocketCount('u1'), 0);
    // Void and boolean operations do not throw
    await store.addSocket('u1', 's1');
    assert.equal(await store.removeSocket('u1', 's1'), false);
    await store.setUserPlaying('u1', true);
  });
});
