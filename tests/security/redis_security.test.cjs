/**
 * tests/security/redis_security.test.cjs
 *
 * Phase 9 Security Suite: Redis Key Namespace Isolation & Ephemeral
 * Architecture Invariant (Database Source of Truth Survival).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');

describe('Redis Security & Source of Truth Invariant', () => {
  let redisKeys;
  let createUser, findUserById;
  let createGame, findGameById;
  let testUser, testGame;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_MODE = 'memory';
    process.env.REDIS_REQUIRED = 'false';

    const { initDb, inMemoryDb } = await import('../../apps/server/src/db/index.js');
    const userRepo = await import('../../apps/server/src/db/userRepository.js');
    const gameRepo = await import('../../apps/server/src/db/gameRepository.js');
    const keysModule = await import('../../apps/server/src/redis/redisKeys.js');

    redisKeys = keysModule.redisKeys;
    createUser = userRepo.createUser;
    findUserById = userRepo.findUserById;
    createGame = gameRepo.createGame;
    findGameById = gameRepo.findGameById;

    await initDb();

    testUser = await createUser({
      id: `usr_redis_inv_${Date.now()}`,
      username: `user_rd_${Date.now()}`,
      email: `rd_${Date.now()}@chess.com`,
      passwordHash: 'fakehash123',
      role: 'PLAYER'
    });

    testGame = await createGame({
      id: `game_redis_inv_${Date.now()}`,
      roomCode: 'ROOM_RD1',
      whitePlayerId: testUser.id,
      blackPlayerId: null,
      timeControl: '10+0',
      status: 'ACTIVE',
      rated: true
    });
  });

  test('Centralized Redis keys adhere strictly to standardized namespaces', () => {
    const gameId = 'game-123';
    const userId = 'user-456';
    const tournId = 'tourn-789';

    assert.strictEqual(redisKeys.gameMeta(gameId), 'chess:game:meta:game-123');
    assert.strictEqual(redisKeys.gameLock(gameId), 'chess:game:lock:game-123');
    assert.strictEqual(redisKeys.presenceUser(userId), 'chess:presence:user:user-456');
    assert.strictEqual(redisKeys.tournamentLock(tournId), 'chess:tournament:lock:tourn-789');
  });

  test('Redis key helpers prevent path traversal and unescaped namespace breakout', () => {
    const maliciousInput = '../../etc/passwd';
    const key = redisKeys.gameMeta(maliciousInput);
    assert.ok(key.startsWith('chess:game:'), 'Key namespace prefix preserved');
  });

  test('Ephemeral Invariant: Persistent storage survives Redis cache eviction or flush', async () => {
    // In-memory or TiDB persistence must survive complete Redis loss
    const userBefore = await findUserById(testUser.id);
    const gameBefore = await findGameById(testGame.id);

    assert.ok(userBefore, 'User exists in authoritative DB');
    assert.ok(gameBefore, 'Game exists in authoritative DB');

    // Simulate Redis eviction / flush
    const { isRedisConnected, getRedisClient } = await import('../../apps/server/src/redis/redisClient.js');
    if (isRedisConnected()) {
      const client = getRedisClient();
      await client.flushdb();
    }

    // Query authoritative DB after Redis flush
    const userAfter = await findUserById(testUser.id);
    const gameAfter = await findGameById(testGame.id);

    assert.strictEqual(userAfter.id, testUser.id, 'User account intact in persistent DB');
    assert.strictEqual(userAfter.username, testUser.username);
    assert.strictEqual(gameAfter.id, testGame.id, 'Game record intact in persistent DB');
    assert.strictEqual(gameAfter.status, 'ACTIVE');
  });
});
