import { getRedisClient, isRedisConnected } from '../redis/redisClient.js';
import { redisKeys } from '../redis/redisKeys.js';
import { redisConfig } from '../redis/redisConfig.js';

export class RateLimitStore {
  async isAllowed(scope, identifier, limit, windowMs) {
    throw new Error('Not implemented');
  }
}

export class InMemoryRateLimitStore extends RateLimitStore {
  constructor() {
    super();
    this.hits = new Map(); // `${scope}:${identifier}` -> Array of timestamps
  }

  async isAllowed(scope, identifier, limit = 10, windowMs = 1000) {
    const key = `${scope}:${identifier}`;
    const now = Date.now();
    let timestamps = this.hits.get(key);

    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    // Filter out entries outside the sliding window
    timestamps = timestamps.filter(t => now - t < windowMs);

    if (timestamps.length >= limit) {
      this.hits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }
}

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('PEXPIRE', key, windowMs)
end

if current > limit then
  return 0
else
  return 1
end
`;

export class RedisRateLimitStore extends RateLimitStore {
  async isAllowed(scope, identifier, limit = 10, windowMs = 1000) {
    if (!isRedisConnected()) {
      // Production fail-closed when REDIS_REQUIRED=true; Development allows fallback
      return !redisConfig.isRequired;
    }

    const client = getRedisClient();
    const key = redisKeys.rateLimit(scope, identifier);

    try {
      const result = await client.eval(RATE_LIMIT_LUA, 1, key, limit, windowMs);
      return result === 1;
    } catch (err) {
      console.warn('[RateLimit] Redis eval error:', err.message);
      return !redisConfig.isRequired;
    }
  }
}
