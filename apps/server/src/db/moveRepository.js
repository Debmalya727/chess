import { getPool, isUsingMysql, inMemoryDb } from './index.js';

/**
 * Persist a move to the database.
 * Authoritative target is TiDB/MySQL; Redis is strictly an ephemeral, rebuildable cache.
 * @param {Object} moveData
 * @returns {Promise<Object>}
 */
export async function createMove(moveData) {
  if (isUsingMysql()) {
    const pool = getPool();
    // 1. Authoritative Persistence into TiDB
    await pool.query(
      `INSERT INTO game_moves (game_id, ply, player_id, from_square, to_square, promotion, san, fen_after, move_time_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        moveData.gameId,
        moveData.ply,
        moveData.playerId || null,
        moveData.from,
        moveData.to,
        moveData.promotion || null,
        moveData.san,
        moveData.fenAfter,
        moveData.moveTimeMs || 0
      ]
    );

    // 2. Populate Redis Move Cache (Cache Only - safe to delete)
    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      const { redisKeys } = await import('../redis/redisKeys.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const moveKey = redisKeys.gameMoves(moveData.gameId);
        await client.rpush(moveKey, JSON.stringify(moveData));
        await client.pexpire(moveKey, 7200 * 1000);
      }
    } catch (cacheErr) {
      console.warn('[MoveRepository] Redis cache write warning (TiDB write succeeded):', cacheErr.message);
    }

    return moveData;
  } else {
    // Isolated In-Memory Store
    if (!inMemoryDb.gameMoves.has(moveData.gameId)) {
      inMemoryDb.gameMoves.set(moveData.gameId, []);
    }
    inMemoryDb.gameMoves.get(moveData.gameId).push(moveData);

    // Sync to Redis for multi-instance consistency in test/dev
    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      const { redisKeys } = await import('../redis/redisKeys.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const moveKey = redisKeys.gameMoves(moveData.gameId);
        await client.rpush(moveKey, JSON.stringify(moveData));
        await client.pexpire(moveKey, 7200 * 1000);
      }
    } catch {}

    return moveData;
  }
}

/**
 * Retrieve moves for a game.
 * Checks Redis cache first for sub-millisecond retrieval; on cache miss, reads
 * from authoritative TiDB storage and lazily repopulates the Redis cache.
 * @param {string} gameId
 * @returns {Promise<Array>}
 */
export async function findMovesByGameId(gameId) {
  if (isUsingMysql()) {
    // 1. Try reading from Redis cache
    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      const { redisKeys } = await import('../redis/redisKeys.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const moveKey = redisKeys.gameMoves(gameId);
        const raw = await client.lrange(moveKey, 0, -1);
        if (raw && raw.length > 0) {
          return raw.map(s => JSON.parse(s));
        }
      }
    } catch {}

    // 2. Cache miss or Redis deleted: Authoritative query from TiDB
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM game_moves WHERE game_id = ? ORDER BY ply ASC`,
      [gameId]
    );
    const moves = rows.map(r => ({
      id: r.id,
      gameId: r.game_id,
      ply: r.ply,
      playerId: r.player_id,
      from: r.from_square,
      to: r.to_square,
      promotion: r.promotion,
      san: r.san,
      fenAfter: r.fen_after,
      moveTimeMs: r.move_time_ms,
      createdAt: r.created_at
    }));

    // 3. Transparently rehydrate Redis cache from authoritative TiDB data
    if (moves.length > 0) {
      try {
        const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
        const { redisKeys } = await import('../redis/redisKeys.js');
        if (isRedisConnected()) {
          const client = getRedisClient();
          const moveKey = redisKeys.gameMoves(gameId);
          await client.del(moveKey);
          await client.rpush(moveKey, ...moves.map(m => JSON.stringify(m)));
          await client.pexpire(moveKey, 7200 * 1000);
        }
      } catch {}
    }

    return moves;
  } else {
    // In-memory mode
    const local = inMemoryDb.gameMoves.get(gameId);
    if (local && local.length > 0) {
      return local;
    }

    // Try fetching from Redis across instances
    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      const { redisKeys } = await import('../redis/redisKeys.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const moveKey = redisKeys.gameMoves(gameId);
        const raw = await client.lrange(moveKey, 0, -1);
        if (raw && raw.length > 0) {
          const parsed = raw.map(s => JSON.parse(s));
          inMemoryDb.gameMoves.set(gameId, parsed);
          return parsed;
        }
      }
    } catch {}

    return [];
  }
}
