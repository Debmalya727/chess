import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserStats } from '../../src/users/userStatsService.js';
import { initDb, inMemoryDb } from '../../src/db/index.js';

test('userStatsService unit tests', async (t) => {
  await t.test('Computes stats and rating categories correctly from records', async () => {
    process.env.DB_MODE = 'memory';
    await initDb();

    const testUserId = 'test-stats-user-1';
    inMemoryDb.userRatings.set(`${testUserId}:blitz`, {
      userId: testUserId,
      ratingType: 'blitz',
      rating: 1542,
      gamesPlayed: 10,
      wins: 6,
      losses: 3,
      draws: 1
    });

    inMemoryDb.userRatings.set(`${testUserId}:rapid`, {
      userId: testUserId,
      ratingType: 'rapid',
      rating: 1510,
      gamesPlayed: 5,
      wins: 3,
      losses: 2,
      draws: 0
    });

    const result = await getUserStats(testUserId);

    assert.equal(result.statistics.games, 15);
    assert.equal(result.statistics.wins, 9);
    assert.equal(result.statistics.losses, 5);
    assert.equal(result.statistics.draws, 1);
    assert.equal(result.statistics.winRate, 60);

    assert.equal(result.ratings.blitz.rating, 1542);
    assert.equal(result.ratings.blitz.games, 10);
    assert.equal(result.ratings.blitz.winRate, 60);

    assert.equal(result.ratings.rapid.rating, 1510);
    assert.equal(result.ratings.bullet.rating, 1500);
    assert.equal(result.ratings.classical.rating, 1500);
  });
});
