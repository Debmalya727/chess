import assert from 'assert';
import { getPaginatedLeaderboard, getUserRankings, isValidRatingType } from '../../src/db/leaderboardRepository.js';
import { inMemoryDb } from '../../src/db/index.js';

async function runLeaderboardTests() {
  console.log('--- LEADERBOARD UNIT TESTS ---');

  // Test 1: Category Validation
  assert.strictEqual(isValidRatingType('blitz'), true);
  assert.strictEqual(isValidRatingType('rapid'), true);
  assert.strictEqual(isValidRatingType('invalid_cat'), false);
  console.log('✓ Category validation passed');

  // Test 2: In-Memory Leaderboard Ranking & Deterministic Tie-breaking
  inMemoryDb.users.set('usr_1', { id: 'usr_1', username: 'playerA' });
  inMemoryDb.users.set('usr_2', { id: 'usr_2', username: 'playerB' });
  inMemoryDb.users.set('usr_3', { id: 'usr_3', username: 'playerC' });

  inMemoryDb.userRatings.set('usr_1:blitz', { userId: 'usr_1', ratingType: 'blitz', rating: 1600, gamesPlayed: 20, wins: 15, losses: 5, draws: 0 });
  inMemoryDb.userRatings.set('usr_2:blitz', { userId: 'usr_2', ratingType: 'blitz', rating: 1800, gamesPlayed: 50, wins: 30, losses: 10, draws: 10 });
  inMemoryDb.userRatings.set('usr_3:blitz', { userId: 'usr_3', ratingType: 'blitz', rating: 1600, gamesPlayed: 30, wins: 20, losses: 5, draws: 5 });

  const lbData = await getPaginatedLeaderboard('blitz', { page: 1, limit: 10 });
  assert.strictEqual(lbData.players.length, 3);
  assert.strictEqual(lbData.players[0].username, 'playerB'); // 1800 rating
  assert.strictEqual(lbData.players[0].rank, 1);
  assert.strictEqual(lbData.players[1].username, 'playerC'); // 1600 rating, 30 games (tie break win over 20 games)
  assert.strictEqual(lbData.players[1].rank, 2);
  assert.strictEqual(lbData.players[2].username, 'playerA'); // 1600 rating, 20 games
  assert.strictEqual(lbData.players[2].rank, 3);
  console.log('✓ Deterministic tie-breaking (rating DESC, games DESC) passed');

  // Test 3: User Category Rankings
  const rankings = await getUserRankings('usr_2');
  assert.strictEqual(rankings.blitz.rank, 1);
  assert.strictEqual(rankings.blitz.rating, 1800);
  console.log('✓ User rankings lookup passed');

  console.log('=== LEADERBOARD TESTS PASSED ===\n');
}

runLeaderboardTests().catch(err => {
  console.error('Leaderboard tests failed:', err);
  process.exit(1);
});
