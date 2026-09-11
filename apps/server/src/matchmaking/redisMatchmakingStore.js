import { MatchmakingStore } from './matchmakingStore.js';
import { getRedisClient, isRedisConnected } from '../redis/redisClient.js';
import { redisKeys } from '../redis/redisKeys.js';

const CLAIM_PAIR_LUA = `
local claimA = KEYS[1]
local claimB = KEYS[2]
local token = ARGV[1]
local ttl = tonumber(ARGV[2])

if redis.call('EXISTS', claimA) == 1 or redis.call('EXISTS', claimB) == 1 then
  return 0
end

redis.call('SET', claimA, token, 'PX', ttl)
redis.call('SET', claimB, token, 'PX', ttl)
return 1
`;

export class RedisMatchmakingStore extends MatchmakingStore {
  constructor() {
    super();
    this.ttlSeconds = 300; // 5 minutes queue TTL
  }

  async add(userId, entry) {
    if (!isRedisConnected()) return false;
    const client = getRedisClient();

    const playerKey = redisKeys.matchmakingPlayer(userId);
    const queueKey = redisKeys.matchmakingQueue(entry.ratingType, entry.timeControl);
    const allPlayersKey = redisKeys.matchmakingAllPlayers();

    // Strip socket object before serialization for clean Redis storage
    const cleanEntry = {
      userId: entry.userId,
      user: {
        id: entry.user.id,
        username: entry.user.username,
        rating: entry.user.rating
      },
      timeControl: entry.timeControl,
      ratingType: entry.ratingType,
      rating: entry.rating,
      joinedAt: entry.joinedAt
    };

    const pipeline = client.pipeline();
    pipeline.set(playerKey, JSON.stringify(cleanEntry), 'EX', this.ttlSeconds);
    pipeline.sadd(queueKey, userId);
    pipeline.sadd(allPlayersKey, userId);
    await pipeline.exec();

    return true;
  }

  async get(userId) {
    if (!isRedisConnected()) return null;
    const client = getRedisClient();
    const playerKey = redisKeys.matchmakingPlayer(userId);

    const data = await client.get(playerKey);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async has(userId) {
    if (!isRedisConnected()) return false;
    const client = getRedisClient();
    const playerKey = redisKeys.matchmakingPlayer(userId);
    const exists = await client.exists(playerKey);
    return exists === 1;
  }

  async remove(userId) {
    if (!isRedisConnected()) return false;
    const client = getRedisClient();

    const entry = await this.get(userId);
    const playerKey = redisKeys.matchmakingPlayer(userId);
    const allPlayersKey = redisKeys.matchmakingAllPlayers();

    const pipeline = client.pipeline();
    pipeline.del(playerKey);
    pipeline.srem(allPlayersKey, userId);

    if (entry) {
      const queueKey = redisKeys.matchmakingQueue(entry.ratingType, entry.timeControl);
      pipeline.srem(queueKey, userId);
    }

    await pipeline.exec();
    return true;
  }

  async getAll() {
    if (!isRedisConnected()) return [];
    const client = getRedisClient();
    const allPlayersKey = redisKeys.matchmakingAllPlayers();

    const userIds = await client.smembers(allPlayersKey);
    if (!userIds || userIds.length === 0) return [];

    const keys = userIds.map(id => redisKeys.matchmakingPlayer(id));
    const results = await client.mget(keys);

    const entries = [];
    const staleIds = [];

    for (let i = 0; i < userIds.length; i++) {
      const raw = results[i];
      if (raw) {
        try {
          entries.push(JSON.parse(raw));
        } catch {}
      } else {
        // Player key expired or deleted; queue membership is stale
        staleIds.push(userIds[i]);
      }
    }

    // Clean up stale IDs asynchronously
    if (staleIds.length > 0) {
      const p = client.pipeline();
      staleIds.forEach(id => p.srem(allPlayersKey, id));
      p.exec().catch(() => {});
    }

    return entries;
  }

  async size() {
    if (!isRedisConnected()) return 0;
    const client = getRedisClient();
    const allPlayersKey = redisKeys.matchmakingAllPlayers();
    return client.scard(allPlayersKey);
  }

  /**
   * Atomic claim for a matched pair of players across multiple Fastify instances.
   * Prevents two instances from concurrently creating two games for the same pair.
   */
  async claimPair(playerAId, playerBId, claimTtlMs = 10000) {
    if (!isRedisConnected()) return true;
    const client = getRedisClient();

    const claimKeyA = redisKeys.matchmakingClaim(playerAId);
    const claimKeyB = redisKeys.matchmakingClaim(playerBId);
    const token = `claim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const result = await client.eval(CLAIM_PAIR_LUA, 2, claimKeyA, claimKeyB, token, claimTtlMs);
    return result === 1;
  }
}
