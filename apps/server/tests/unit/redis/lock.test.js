import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquireLock, releaseLock, withLock } from '../../../src/redis/redisLock.js';

test('Distributed Lock Unit Tests (In-Memory Fallback & Contract)', async (t) => {
  await t.test('Acquires lock with unique token', async () => {
    const lock = await acquireLock('test:lock:1', 1000);
    assert.strictEqual(lock.acquired, true);
    assert.ok(lock.token);
    assert.strictEqual(lock.key, 'test:lock:1');

    // Re-acquire fails before release
    const second = await acquireLock('test:lock:1', 1000);
    assert.strictEqual(second.acquired, false);
    assert.strictEqual(second.token, null);

    // Release with wrong token fails
    const releasedWrong = await releaseLock('test:lock:1', 'wrong-token');
    assert.strictEqual(releasedWrong, false);

    // Release with correct token succeeds
    const released = await releaseLock('test:lock:1', lock.token);
    assert.strictEqual(released, true);

    // Now re-acquire succeeds
    const third = await acquireLock('test:lock:1', 1000);
    assert.strictEqual(third.acquired, true);
    await releaseLock('test:lock:1', third.token);
  });

  await t.test('Lock expires after TTL', async () => {
    const lock = await acquireLock('test:lock:expire', 100);
    assert.strictEqual(lock.acquired, true);

    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 120));

    // Can be acquired by someone else after expiration
    const second = await acquireLock('test:lock:expire', 500);
    assert.strictEqual(second.acquired, true);
    assert.notStrictEqual(second.token, lock.token);

    // Old owner cannot release expired lock
    const oldRelease = await releaseLock('test:lock:expire', lock.token);
    assert.strictEqual(oldRelease, false);

    // New owner can release
    const newRelease = await releaseLock('test:lock:expire', second.token);
    assert.strictEqual(newRelease, true);
  });

  await t.test('withLock executes callback and automatically releases', async () => {
    let executed = false;
    const result = await withLock('test:lock:withLock', 1000, async () => {
      executed = true;
      return 42;
    });

    assert.strictEqual(executed, true);
    assert.strictEqual(result, 42);

    // Immediately acquirable because withLock released it
    const lock = await acquireLock('test:lock:withLock', 500);
    assert.strictEqual(lock.acquired, true);
    await releaseLock('test:lock:withLock', lock.token);
  });

  await t.test('withLock releases lock even when callback throws', async () => {
    await assert.rejects(
      () => withLock('test:lock:error', 1000, async () => {
        throw new Error('Something failed');
      }),
      /Something failed/
    );

    // Lock was released in finally
    const lock = await acquireLock('test:lock:error', 500);
    assert.strictEqual(lock.acquired, true);
    await releaseLock('test:lock:error', lock.token);
  });
});
