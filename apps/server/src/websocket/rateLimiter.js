import { InMemoryRateLimitStore, RedisRateLimitStore } from './rateLimitStore.js';
import { isRedisConnected } from '../redis/redisClient.js';

export class WsRateLimiter {
  constructor(maxPerWindow = 10, windowMs = 1000) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
    this.inMemoryStore = new InMemoryRateLimitStore();
    this.redisStore = new RedisRateLimitStore();
  }

  get store() {
    return isRedisConnected() ? this.redisStore : this.inMemoryStore;
  }

  async isAllowed(socket, clientState = null) {
    const scope = clientState?.user ? 'ws_user' : 'ws_conn';
    const id = clientState?.user?.id || socket.id || socket._socket?.remoteAddress || 'unknown';
    return this.store.isAllowed(scope, id, this.maxPerWindow, this.windowMs);
  }
}

export const globalWsRateLimiter = new WsRateLimiter(10, 1000);
