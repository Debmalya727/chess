import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceService } from '../../src/presence/presenceService.js';
import { InMemoryPresenceStore } from '../../src/presence/inMemoryPresenceStore.js';

test('Presence Service & Multi-Tab Store Unit Tests', async (t) => {
  const store = new InMemoryPresenceStore();
  const presenceService = new PresenceService(store);

  const userId = 'user_multi_tab';

  await t.test('Initial status is offline', async () => {
    const status = await presenceService.getUserStatus(userId);
    assert.equal(status, 'offline');
  });

  const mockSocket1 = { id: 'sock_tab_1', readyState: 1, send: () => {} };
  const mockSocket2 = { id: 'sock_tab_2', readyState: 1, send: () => {} };

  await t.test('User opens first tab -> status becomes online', async () => {
    await presenceService.handleUserConnected(userId, mockSocket1, 'Tester');
    const status = await presenceService.getUserStatus(userId);
    assert.equal(status, 'online');
    assert.equal(await store.getSocketCount(userId), 1);
  });

  await t.test('User opens second tab -> status remains online with 2 sockets', async () => {
    await presenceService.handleUserConnected(userId, mockSocket2, 'Tester');
    const status = await presenceService.getUserStatus(userId);
    assert.equal(status, 'online');
    assert.equal(await store.getSocketCount(userId), 2);
  });

  await t.test('User enters active game -> status becomes playing', async () => {
    await presenceService.setUserPlaying(userId, true);
    const status = await presenceService.getUserStatus(userId);
    assert.equal(status, 'playing');
  });

  await t.test('User finishes game -> status returns to online', async () => {
    await presenceService.setUserPlaying(userId, false);
    const status = await presenceService.getUserStatus(userId);
    assert.equal(status, 'online');
  });

  await t.test('User closes first tab -> status remains online because tab 2 is still open', async () => {
    await presenceService.handleUserDisconnected(userId, mockSocket1.id);
    const status = await presenceService.getUserStatus(userId);
    assert.equal(status, 'online');
    assert.equal(await store.getSocketCount(userId), 1);
  });

  await t.test('User closes second (final) tab -> status transitions to offline', async () => {
    await presenceService.handleUserDisconnected(userId, mockSocket2.id);
    const status = await presenceService.getUserStatus(userId);
    assert.equal(status, 'offline');
    assert.equal(await store.getSocketCount(userId), 0);
  });
});
