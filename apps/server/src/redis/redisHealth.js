import { getRedisClient, isRedisConnected } from './redisClient.js';
import { redisConfig } from './redisConfig.js';

export async function checkRedisHealth() {
  if (!isRedisConnected()) {
    return {
      status: redisConfig.isRequired ? 'error' : 'disabled',
      mode: redisConfig.isRequired ? 'disconnected' : 'in-memory'
    };
  }

  const client = getRedisClient();
  const start = Date.now();

  try {
    const pong = await client.ping();
    const latencyMs = Date.now() - start;

    return {
      status: pong === 'PONG' ? 'ok' : 'degraded',
      latencyMs,
      mode: 'redis'
    };
  } catch (err) {
    return {
      status: 'error',
      error: err.message,
      mode: 'redis'
    };
  }
}
