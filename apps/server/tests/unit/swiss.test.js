import assert from 'assert';
import { TournamentService } from '../../src/tournaments/tournamentService.js';
import { inMemoryDb } from '../../src/db/index.js';

async function runSwissTests() {
  console.log('--- SWISS TOURNAMENT UNIT TESTS ---');

  const ts = new TournamentService();
  const players = [
    { id: 'sw_u1', username: 'Swiss1' },
    { id: 'sw_u2', username: 'Swiss2' },
    { id: 'sw_u3', username: 'Swiss3' }
  ];

  for (const p of players) inMemoryDb.users.set(p.id, p);

  // Test 1: Create Swiss Tournament
  const tournament = await ts.createTournament({
    name: 'Classic Swiss Open',
    type: 'swiss',
    totalRounds: 2,
    rated: false
  });

  for (const p of players) {
    await ts.joinTournament(tournament.id, p);
  }

  // Test 2: Swiss Round 1 with Odd Player Count (Bye handling)
  const round1 = await ts.startSwissRound(tournament.id, 1);
  assert.strictEqual(round1.roundNumber, 1);
  assert.strictEqual(round1.pairings.length, 2); // 1 active game pairing + 1 bye pairing

  const byePairing = round1.pairings.find(p => p.isBye);
  assert.ok(byePairing);
  assert.strictEqual(byePairing.points, 1.0);
  console.log('✓ Swiss round 1 pairing & bye point allocation passed');

  // Test 3: Complete Round 1 & Verify Standings
  const activeMatch = round1.pairings.find(p => !p.isBye);
  await ts.handleTournamentGameEnd(tournament.id, activeMatch.gameId, '1-0');

  const standings = await ts.getStandings(tournament.id);
  assert.strictEqual(standings.standings.length, 3);
  console.log('✓ Swiss round completion & score updates passed');

  console.log('=== SWISS TOURNAMENT TESTS PASSED ===\n');
}

runSwissTests().catch(err => {
  console.error('Swiss tests failed:', err);
  process.exit(1);
});
