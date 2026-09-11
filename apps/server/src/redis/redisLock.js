import crypto from 'crypto';
import { isRedisConnected, getRedisClient } from './redisClient.js';

// In-memory fallback lock store when Redis is unavailable
const inMemoryLocks = new Map(); // key -> { token, expireAt }

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Acquire a distributed lock with a unique ownership token and TTL.
 * @param {string} key - Lock key
 * @param {number} ttlMs - Time-to-live in milliseconds
 * @param {string} [customToken] - Optional ownership token
 * @returns {Promise<{ acquired: boolean, token: string | null, key: string }>}
 */
export async function acquireLock(key, ttlMs = 5000, customToken = null) {
  const token = customToken || crypto.randomUUID();

  if (isRedisConnected()) {
    try {
      const client = getRedisClient();
      const res = await client.set(key, token, 'PX', ttlMs, 'NX');
      if (res === 'OK') {
        return { acquired: true, token, key };
      }
      return { acquired: false, token: null, key };
    } catch (err) {
      console.warn('[RedisLock] Error acquiring lock on Redis, falling back to memory:', err.message);
    }
  }

  // In-Memory Fallback
  const now = Date.now();
  const existing = inMemoryLocks.get(key);
  if (existing && existing.expireAt > now) {
    return { acquired: false, token: null, key };
  }

  inMemoryLocks.set(key, { token, expireAt: now + ttlMs });
  return { acquired: true, token, key };
}

/**
 * Safely release a distributed lock verifying that the caller still owns it.
 * Prevents Server A from releasing Server B's lock if A's TTL expired.
 * @param {string} key - Lock key
 * @param {string} token - Ownership token
 * @returns {Promise<boolean>} - True if the lock was released by its rightful owner
 */
export async function releaseLock(key, token) {
  if (!token) return false;

  if (isRedisConnected()) {
    try {
      const client = getRedisClient();
      const res = await client.eval(RELEASE_LOCK_LUA, 1, key, token);
      return res === 1;
    } catch (err) {
      console.warn('[RedisLock] Error releasing lock on Redis:', err.message);
    }
  }

  // In-Memory Fallback
  const existing = inMemoryLocks.get(key);
  if (existing && existing.token === token) {
    inMemoryLocks.delete(key);
    return true;
  }
  return false;
}

/**
 * Execute a task with distributed lock protection.
 * Automatically acquires lock, handles retries, and guarantees release.
 * @param {string} key - Lock key
 * @param {number} ttlMs - Lock TTL in ms
 * @param {Function} fn - Asynchronous function to execute
 * @param {number} [maxWaitMs=1000] - Max time to wait for lock acquisition
 * @returns {Promise<any>}
 */
export async function withLock(key, ttlMs, fn, maxWaitMs = 1500) {
  const start = Date.now();
  let lock = await acquireLock(key, ttlMs);

  while (!lock.acquired && Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 40));
    lock = await acquireLock(key, ttlMs);
  }

  if (!lock.acquired) {
    const err = new Error(`Failed to acquire distributed lock for ${key} within ${maxWaitMs}ms`);
    err.code = 'LOCK_TIMEOUT';
    throw err;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(key, lock.token);
  }
}
