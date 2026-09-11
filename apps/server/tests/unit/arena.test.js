import assert from 'assert';
import { TournamentService } from '../../src/tournaments/tournamentService.js';
import { inMemoryDb } from '../../src/db/index.js';

async function runArenaTests() {
  console.log('--- ARENA TOURNAMENT UNIT TESTS ---');

  const ts = new TournamentService();
  const u1 = { id: 'arena_u1', username: 'ArenaUser1' };
  const u2 = { id: 'arena_u2', username: 'ArenaUser2' };

  inMemoryDb.users.set('arena_u1', u1);
  inMemoryDb.users.set('arena_u2', u2);

  // Test 1: Create Arena Tournament
  const tournament = await ts.createTournament({
    name: 'Weekly Blitz Arena',
    type: 'arena',
    timeControl: '5+0',
    rated: false
  });
  assert.strictEqual(tournament.name, 'Weekly Blitz Arena');
  assert.strictEqual(tournament.type, 'arena');
  assert.strictEqual(tournament.rated, false);
  console.log('✓ Arena tournament creation passed');

  // Test 2: Registration & Duplicate Registration Guard
  const join1 = await ts.joinTournament(tournament.id, u1);
  assert.strictEqual(join1.success, true);

  const joinDup = await ts.joinTournament(tournament.id, u1);
  assert.strictEqual(joinDup.error, 'ALREADY_REGISTERED');

  await ts.joinTournament(tournament.id, u2);
  const standings = await ts.getStandings(tournament.id);
  assert.strictEqual(standings.standings.length, 2);
  console.log('✓ Registration and duplicate guard passed');

  // Test 3: Arena Pairing & Unrated Elo Isolation
  tournament.status = 'running';
  const matches = await ts.processArenaPairings(tournament.id);
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].roundNumber, 1);

  // Handle Game Completion
  await ts.handleTournamentGameEnd(tournament.id, matches[0].gameId, '1-0');
  const updatedStandings = await ts.getStandings(tournament.id);

  // Winner (white or black depending on random assignment) gets 1.0 points
  assert.strictEqual(updatedStandings.standings[0].score, 1.0);
  assert.strictEqual(updatedStandings.standings[1].score, 0.0);
  console.log('✓ Arena continuous pairing, game completion, and scoring passed');

  console.log('=== ARENA TOURNAMENT TESTS PASSED ===\n');
}

runArenaTests().catch(err => {
  console.error('Arena tests failed:', err);
  process.exit(1);
});
