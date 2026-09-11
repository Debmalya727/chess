import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const redisConfig = {
  get url() { return process.env.REDIS_URL || null; },
  get host() { return process.env.REDIS_HOST || '127.0.0.1'; },
  get port() { return parseInt(process.env.REDIS_PORT || '6379', 10); },
  get username() { return process.env.REDIS_USERNAME || undefined; },
  get password() { return process.env.REDIS_PASSWORD || undefined; },
  get tls() { return process.env.REDIS_TLS === 'true' || (process.env.REDIS_URL && process.env.REDIS_URL.startsWith('rediss://')); },
  get isRequired() { return process.env.REDIS_REQUIRED === 'true'; },
  get connectTimeout() { return parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10); },
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    // Exponential backoff capped at 2 seconds
    return Math.min(times * 100, 2000);
  }
};

/**
 * Build options object suitable for ioredis constructor
 */
export function getRedisOptions() {
  if (redisConfig.url) {
    const options = {
      maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
      retryStrategy: redisConfig.retryStrategy,
      connectTimeout: redisConfig.connectTimeout,
      lazyConnect: true
    };
    if (redisConfig.tls) {
      options.tls = { rejectUnauthorized: true };
    }
    return options;
  }

  const options = {
    host: redisConfig.host,
    port: redisConfig.port,
    username: redisConfig.username,
    password: redisConfig.password,
    maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
    retryStrategy: redisConfig.retryStrategy,
    connectTimeout: redisConfig.connectTimeout,
    lazyConnect: true
  };

  if (redisConfig.tls) {
    options.tls = { rejectUnauthorized: true };
  }

  return options;
}
