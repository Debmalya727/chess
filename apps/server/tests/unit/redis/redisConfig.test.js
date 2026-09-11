import test from 'node:test';
import assert from 'node:assert';
import { redisConfig, getRedisOptions } from '../../../src/redis/redisConfig.js';

test('Redis Configuration Unit Tests', async (t) => {
  await t.test('Provides defaults for host, port, and timeout', () => {
    assert.ok(redisConfig.host, 'Host must have a default value');
    assert.strictEqual(typeof redisConfig.port, 'number', 'Port must be a number');
    assert.ok(redisConfig.port > 0, 'Port must be positive');
    assert.ok(redisConfig.connectTimeout >= 1000, 'Connect timeout must be at least 1s');
  });

  await t.test('Builds valid ioredis options object', () => {
    const options = getRedisOptions();
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof options.retryStrategy, 'function');
    assert.strictEqual(options.lazyConnect, true);
    assert.strictEqual(options.port, redisConfig.port);
  });

  await t.test('Calculates backoff capped at 2000ms', () => {
    assert.strictEqual(redisConfig.retryStrategy(1), 100);
    assert.strictEqual(redisConfig.retryStrategy(10), 1000);
    assert.strictEqual(redisConfig.retryStrategy(50), 2000);
  });
});
