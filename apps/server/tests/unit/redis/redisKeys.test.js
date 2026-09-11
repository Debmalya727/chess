import test from 'node:test';
import assert from 'node:assert/strict';
import { redisKeys } from '../../../src/redis/redisKeys.js';

test('Redis Keys Namespace Unit Tests', async (t) => {
  await t.test('Generates consistent matchmaking keys', () => {
    assert.equal(
      redisKeys.matchmakingQueue('blitz', '3+2'),
      'chess:matchmaking:queue:blitz:3+2'
    );
    assert.equal(
      redisKeys.matchmakingPlayer('user_123'),
      'chess:matchmaking:player:user_123'
    );
    assert.equal(
      redisKeys.matchmakingClaim('user_456'),
      'chess:matchmaking:claim:user_456'
    );
    assert.equal(
      redisKeys.matchmakingAllPlayers(),
      'chess:matchmaking:all_players'
    );
  });

  await t.test('Generates consistent presence keys', () => {
    assert.equal(
      redisKeys.presenceUser('user_abc'),
      'chess:presence:user:user_abc'
    );
    assert.equal(
      redisKeys.presenceSocket('sock_xyz'),
      'chess:presence:socket:sock_xyz'
    );
    assert.equal(
      redisKeys.presencePlaying('user_abc'),
      'chess:presence:playing:user_abc'
    );
    assert.equal(
      redisKeys.presenceAllUsers(),
      'chess:presence:users'
    );
  });

  await t.test('Generates rate limit and lock keys', () => {
    assert.equal(
      redisKeys.rateLimit('ws', 'user_789'),
      'chess:rate:ws:user_789'
    );
    assert.equal(
      redisKeys.gameLock('game_999'),
      'chess:game:lock:game_999'
    );
    assert.equal(
      redisKeys.challengeLock('chal_111'),
      'chess:challenge:lock:chal_111'
    );
  });

  await t.test('Generates Pub/Sub channel names', () => {
    assert.equal(
      redisKeys.pubsubGame('g_123'),
      'chess:pubsub:game:g_123'
    );
    assert.equal(
      redisKeys.pubsubUser('u_456'),
      'chess:pubsub:user:u_456'
    );
    assert.equal(
      redisKeys.pubsubTournament('tour_789'),
      'chess:pubsub:tournament:tour_789'
    );
    assert.equal(
      redisKeys.pubsubPresence(),
      'chess:pubsub:presence'
    );
  });
});
