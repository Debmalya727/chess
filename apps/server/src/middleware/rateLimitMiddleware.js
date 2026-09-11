import { isRedisConnected } from '../redis/redisClient.js';
import { InMemoryRateLimitStore, RedisRateLimitStore } from '../websocket/rateLimitStore.js';

const inMemoryStore = new InMemoryRateLimitStore();
const redisStore = new RedisRateLimitStore();

/**
 * Returns a Fastify preHandler hook enforcing distributed rate limiting.
 * @param {string} scope - Rate limit namespace (e.g. 'auth:login', 'challenges')
 * @param {number} limit - Maximum allowed requests in window
 * @param {number} windowMs - Sliding window duration in milliseconds
 * @param {Function} [keyExtractor] - Function (request) => identifier string
 */
export function rateLimit(scope, limit = 60, windowMs = 60000, keyExtractor = null) {
  return async function (request, reply) {
    let identifier;
    if (keyExtractor) {
      identifier = keyExtractor(request);
    } else {
      // Default to authenticated user ID or remote client IP
      identifier = request.user?.id || request.ip || request.headers['x-forwarded-for'] || 'anonymous';
    }

    let allowed = false;
    if (isRedisConnected()) {
      allowed = await redisStore.isAllowed(scope, identifier, limit, windowMs);
    } else {
      allowed = await inMemoryStore.isAllowed(scope, identifier, limit, windowMs);
    }

    if (!allowed) {
      const retryAfterSec = Math.ceil(windowMs / 1000);
      reply.header('Retry-After', String(retryAfterSec));
      return reply.status(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.'
      });
    }
  };
}
