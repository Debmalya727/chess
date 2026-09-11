import test from 'node:test';
import assert from 'node:assert/strict';
import { PubSubService } from '../../../src/pubsub/pubSubService.js';

test('PubSubService Unit Tests', async (t) => {
  await t.test('Publishes envelope with eventId, eventVersion, timestamp, and payload', async () => {
    const pubsub = new PubSubService();
    let received = null;

    await pubsub.subscribe('test:channel', (envelope) => {
      received = envelope;
    });

    const published = await pubsub.publish('test:channel', 'TEST_EVENT', { foo: 'bar' });

    assert.ok(published.eventId.startsWith('evt_'));
    assert.equal(published.eventVersion, 1);
    assert.equal(published.eventType, 'TEST_EVENT');
    assert.equal(published.payload.foo, 'bar');
    assert.ok(typeof published.timestamp === 'number');

    assert.deepEqual(received, published);
  });

  await t.test('Multiple subscribers receive the message on the same channel', async () => {
    const pubsub = new PubSubService();
    let count = 0;

    const handlerA = () => { count++; };
    const handlerB = () => { count++; };

    await pubsub.subscribe('test:multicast', handlerA);
    await pubsub.subscribe('test:multicast', handlerB);

    await pubsub.publish('test:multicast', 'PING', {});

    assert.equal(count, 2);
  });

  await t.test('Unsubscribe removes handler correctly', async () => {
    const pubsub = new PubSubService();
    let count = 0;

    const handler = () => { count++; };

    await pubsub.subscribe('test:unsub', handler);
    await pubsub.publish('test:unsub', 'FIRST', {});
    assert.equal(count, 1);

    await pubsub.unsubscribe('test:unsub', handler);
    await pubsub.publish('test:unsub', 'SECOND', {});
    assert.equal(count, 1); // Not incremented
  });

  await t.test('Convenience publish methods target expected channels', async () => {
    const pubsub = new PubSubService();
    const channelsHit = [];

    await pubsub.subscribe('chess:pubsub:user:u10', (env) => {
      channelsHit.push({ channel: 'user', env });
    });
    await pubsub.subscribe('chess:pubsub:game:g20', (env) => {
      channelsHit.push({ channel: 'game', env });
    });
    await pubsub.subscribe('chess:pubsub:tournament:t30', (env) => {
      channelsHit.push({ channel: 'tournament', env });
    });
    await pubsub.subscribe('chess:pubsub:presence', (env) => {
      channelsHit.push({ channel: 'presence', env });
    });

    await pubsub.publishUserEvent('u10', 'CHALLENGE', { from: 'u20' });
    await pubsub.publishGameEvent('g20', 'MOVE', { san: 'e4' });
    await pubsub.publishTournamentEvent('t30', 'ROUND_STARTED', { round: 1 });
    await pubsub.publishPresenceEvent({ userId: 'u10', status: 'online' });

    assert.equal(channelsHit.length, 4);
    assert.equal(channelsHit[0].env.eventType, 'CHALLENGE');
    assert.equal(channelsHit[1].env.eventType, 'MOVE');
    assert.equal(channelsHit[2].env.eventType, 'ROUND_STARTED');
    assert.equal(channelsHit[3].env.eventType, 'presence:updated');
  });
});
