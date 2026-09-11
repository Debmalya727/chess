import { PresenceStore } from './presenceStore.js';
import { getRedisClient, isRedisConnected } from '../redis/redisClient.js';
import { redisKeys } from '../redis/redisKeys.js';

export class RedisPresenceStore extends PresenceStore {
  constructor() {
    super();
    this.socketTtlSeconds = 120; // 2 minutes heartbeat TTL
    this.playingTtlSeconds = 7200; // 2 hours max game safety TTL
  }

  async addSocket(userId, socketId) {
    if (!userId || !socketId || !isRedisConnected()) return;
    const client = getRedisClient();

    const userKey = redisKeys.presenceUser(userId);
    const socketKey = redisKeys.presenceSocket(socketId);
    const allUsersKey = redisKeys.presenceAllUsers();

    const pipeline = client.pipeline();
    pipeline.sadd(userKey, socketId);
    pipeline.sadd(allUsersKey, userId);
    pipeline.set(socketKey, userId, 'EX', this.socketTtlSeconds);
    await pipeline.exec();
  }

  async removeSocket(userId, socketId) {
    if (!userId || !socketId || !isRedisConnected()) return false;
    const client = getRedisClient();

    const userKey = redisKeys.presenceUser(userId);
    const socketKey = redisKeys.presenceSocket(socketId);
    const allUsersKey = redisKeys.presenceAllUsers();
    const playingKey = redisKeys.presencePlaying(userId);

    const pipeline = client.pipeline();
    pipeline.srem(userKey, socketId);
    pipeline.del(socketKey);
    pipeline.scard(userKey);
    const results = await pipeline.exec();

    // results[2][1] is remaining socket count
    const remainingSockets = results[2] ? results[2][1] : 0;

    if (remainingSockets === 0) {
      const cleanupPipeline = client.pipeline();
      cleanupPipeline.srem(allUsersKey, userId);
      cleanupPipeline.del(playingKey);
      cleanupPipeline.del(userKey);
      await cleanupPipeline.exec();
      return true; // Became offline
    }

    return false; // Still has other active sockets
  }

  async getUserStatus(userId) {
    if (!userId || !isRedisConnected()) return 'offline';
    const client = getRedisClient();

    const userKey = redisKeys.presenceUser(userId);
    const playingKey = redisKeys.presencePlaying(userId);

    const socketIds = await client.smembers(userKey);
    if (!socketIds || socketIds.length === 0) {
      return 'offline';
    }

    // Verify which sockets are still alive via individual socket TTL (crash protection)
    const pipeline = client.pipeline();
    for (const sid of socketIds) {
      pipeline.exists(redisKeys.presenceSocket(sid));
    }
    pipeline.exists(playingKey);
    const results = await pipeline.exec();

    const isPlaying = results[results.length - 1] ? results[results.length - 1][1] === 1 : false;
    let liveSocketCount = 0;
    const staleSocketIds = [];

    for (let i = 0; i < socketIds.length; i++) {
      if (results[i] && results[i][1] === 1) {
        liveSocketCount++;
      } else {
        staleSocketIds.push(socketIds[i]);
      }
    }

    // Clean up stale sockets from crashed nodes
    if (staleSocketIds.length > 0) {
      const cleanPipe = client.pipeline();
      cleanPipe.srem(userKey, ...staleSocketIds);
      if (liveSocketCount === 0) {
        cleanPipe.srem(redisKeys.presenceAllUsers(), userId);
        cleanPipe.del(playingKey);
        cleanPipe.del(userKey);
      }
      cleanPipe.exec().catch(() => {});
    }

    if (liveSocketCount === 0) {
      return 'offline';
    }
    if (isPlaying) {
      return 'playing';
    }
    return 'online';
  }

  async setUserPlaying(userId, isPlaying) {
    if (!userId || !isRedisConnected()) return;
    const client = getRedisClient();
    const playingKey = redisKeys.presencePlaying(userId);

    if (isPlaying) {
      await client.set(playingKey, '1', 'EX', this.playingTtlSeconds);
    } else {
      await client.del(playingKey);
    }
  }

  async getOnlineUserIds() {
    if (!isRedisConnected()) return [];
    const client = getRedisClient();
    const allUsersKey = redisKeys.presenceAllUsers();
    return client.smembers(allUsersKey);
  }

  async getSocketCount(userId) {
    if (!userId || !isRedisConnected()) return 0;
    const client = getRedisClient();
    const userKey = redisKeys.presenceUser(userId);
    return client.scard(userKey);
  }
}
