import test from 'node:test';
import assert from 'node:assert/strict';
import { TestRedisServer } from '../../testRedisServer.js';
import { initRedis, closeRedis } from '../../../src/redis/redisClient.js';
import { RedisMatchmakingStore } from '../../../src/matchmaking/redisMatchmakingStore.js';
import { RedisPresenceStore } from '../../../src/presence/redisPresenceStore.js';
import { RedisRateLimitStore } from '../../../src/websocket/rateLimitStore.js';
import { PubSubService } from '../../../src/pubsub/pubSubService.js';

test('Distributed Coordination Integration Tests (Redis-backed)', async (t) => {
  const redisPort = 6389;
  const server = new TestRedisServer(redisPort);
  await server.start();

  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = String(redisPort);
  process.env.REDIS_URL = '';
  process.env.REDIS_REQUIRED = 'true';

  await initRedis();

  await t.test('Distributed Matchmaking: Atomic Pair Claiming & Queue Operations', async () => {
    const store = new RedisMatchmakingStore();

    // Add Player A
    const entryA = {
      userId: 'pA',
      user: { id: 'pA', username: 'Alice', rating: 1500 },
      timeControl: '5+0',
      ratingType: 'blitz',
      rating: 1500,
      joinedAt: Date.now()
    };
    await store.add('pA', entryA);

    // Add Player B
    const entryB = {
      userId: 'pB',
      user: { id: 'pB', username: 'Bob', rating: 1510 },
      timeControl: '5+0',
      ratingType: 'blitz',
      rating: 1510,
      joinedAt: Date.now()
    };
    await store.add('pB', entryB);

    assert.equal(await store.has('pA'), true);
    assert.equal(await store.has('pB'), true);
    assert.equal(await store.size(), 2);

    const all = await store.getAll();
    assert.equal(all.length, 2);

    // Instance 1 claims pA + pB
    const claim1 = await store.claimPair('pA', 'pB', 5000);
    assert.equal(claim1, true, 'First instance successfully claims pair');

    // Instance 2 concurrently attempts to claim pA + pB (or pA + pC)
    const claim2 = await store.claimPair('pA', 'pC', 5000);
    assert.equal(claim2, false, 'Second instance fails to claim already claimed player');

    // Remove from queue after matching
    await store.remove('pA');
    await store.remove('pB');
    assert.equal(await store.has('pA'), false);
    assert.equal(await store.has('pB'), false);
  });

  await t.test('Distributed Presence: Multi-Tab Sockets and State Transitions', async () => {
    const presenceStore = new RedisPresenceStore();

    // User initially offline
    assert.equal(await presenceStore.getUserStatus('u_multi'), 'offline');

    // Tab 1 opens
    await presenceStore.addSocket('u_multi', 'sock_tab_1');
    assert.equal(await presenceStore.getUserStatus('u_multi'), 'online');
    assert.equal(await presenceStore.getSocketCount('u_multi'), 1);

    // Tab 2 opens
    await presenceStore.addSocket('u_multi', 'sock_tab_2');
    assert.equal(await presenceStore.getUserStatus('u_multi'), 'online');
    assert.equal(await presenceStore.getSocketCount('u_multi'), 2);

    // Enter active game
    await presenceStore.setUserPlaying('u_multi', true);
    assert.equal(await presenceStore.getUserStatus('u_multi'), 'playing');

    // Close Tab 1 -> still has Tab 2, remains playing
    const wentOfflineTab1 = await presenceStore.removeSocket('u_multi', 'sock_tab_1');
    assert.equal(wentOfflineTab1, false);
    assert.equal(await presenceStore.getUserStatus('u_multi'), 'playing');
    assert.equal(await presenceStore.getSocketCount('u_multi'), 1);

    // Finish game
    await presenceStore.setUserPlaying('u_multi', false);
    assert.equal(await presenceStore.getUserStatus('u_multi'), 'online');

    // Close Tab 2 (final socket) -> transitions to offline
    const wentOfflineTab2 = await presenceStore.removeSocket('u_multi', 'sock_tab_2');
    assert.equal(wentOfflineTab2, true);
    assert.equal(await presenceStore.getUserStatus('u_multi'), 'offline');
    assert.equal(await presenceStore.getSocketCount('u_multi'), 0);
  });

  await t.test('Distributed Rate Limiting: Cross-Instance Shared Counter', async () => {
    const rateStore = new RedisRateLimitStore();

    // Limit 3 requests in 1000ms window
    assert.equal(await rateStore.isAllowed('ws', 'rate_user', 3, 1000), true);
    assert.equal(await rateStore.isAllowed('ws', 'rate_user', 3, 1000), true);
    assert.equal(await rateStore.isAllowed('ws', 'rate_user', 3, 1000), true);

    // 4th request from same user exceeds shared limit
    assert.equal(await rateStore.isAllowed('ws', 'rate_user', 3, 1000), false);
  });

  await t.test('Distributed Pub/Sub: Cross-Instance Message Routing', async () => {
    const pubsub = new PubSubService();
    let messageReceived = null;

    await pubsub.subscribe('chess:game:game_dist_1', (envelope) => {
      messageReceived = envelope;
    });

    // Allow subscribe command to process
    await new Promise(r => setTimeout(r, 60));

    await pubsub.publish('chess:game:game_dist_1', 'MOVE_ACCEPTED', {
      gameId: 'game_dist_1',
      san: 'e4',
      stateVersion: 1
    });

    await new Promise(r => setTimeout(r, 100));

    assert.ok(messageReceived, 'Message was delivered over Redis Pub/Sub');
    assert.equal(messageReceived.eventType, 'MOVE_ACCEPTED');
    assert.equal(messageReceived.payload.gameId, 'game_dist_1');
    assert.equal(messageReceived.payload.san, 'e4');
    assert.equal(messageReceived.payload.stateVersion, 1);
  });

  // Cleanup
  await closeRedis();
  await server.stop();
});
