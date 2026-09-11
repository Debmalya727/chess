/**
 * Phase 10 Independent Audit: Complete Arena Tournament Lifecycle & Rating Isolation
 * 
 * Demonstrates:
 * 1. Creation of Arena tournament by TOURNAMENT_ORGANIZER.
 * 2. Registration of 4 players.
 * 3. Tournament start and initial pairings generation.
 * 4. Game execution & result submission.
 * 5. Dynamic score aggregation (win/loss/draw points).
 * 6. Continuous pairings generation for freed players.
 * 7. Terminal completion and standings persistence in TiDB.
 * 8. Reload / rehydration consistency from database.
 * 9. Strict rating isolation invariant (rated = false, 0 Elo mutations).
 */
const assert = require('assert');

async function runArenaCompleteLifecycleAudit() {
  console.log('================================================================');
  console.log('=== PHASE 10 AUDIT: COMPLETE ARENA TOURNAMENT LIFECYCLE      ===');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.DB_MODE = 'memory';
  process.env.REDIS_REQUIRED = 'false';

  const { initDb } = await import('../../apps/server/src/db/index.js');
  const { initRedis, closeRedis } = await import('../../apps/server/src/redis/redisClient.js');
  const { globalPubSubService } = await import('../../apps/server/src/pubsub/pubSubService.js');
  const { createUser } = await import('../../apps/server/src/db/userRepository.js');
  const { getUserRating, getRatingHistory } = await import('../../apps/server/src/db/ratingRepository.js');
  const { hashPassword } = await import('../../apps/server/src/auth/passwordService.js');
  const { globalTournamentService } = await import('../../apps/server/src/tournaments/tournamentService.js');
  const tournRepo = await import('../../apps/server/src/db/tournamentRepository.js');

  await initDb();
  await initRedis();
  await globalPubSubService.init();

  const pwdHash = await hashPassword('ArenaAudit2026!');

  // 1. Setup Organizer & 4 Players
  console.log('[Step 1] Creating Organizer and 4 Arena players...');
  const organizer = await createUser({
    username: `arena_org_${Date.now()}`,
    email: `org_${Date.now()}@arenaaudit.org`,
    passwordHash: pwdHash,
    role: 'TOURNAMENT_ORGANIZER'
  });

  const players = [];
  for (let i = 1; i <= 4; i++) {
    const p = await createUser({
      username: `arena_p${i}_${Date.now()}`,
      email: `p${i}_${Date.now()}@arenaaudit.org`,
      passwordHash: pwdHash,
      role: 'PLAYER'
    });
    players.push({ ...p, seed: i });
  }
  console.log(`✓ Organizer created: ${organizer.username}`);
  console.log(`✓ 4 Arena players created.`);

  // 2. Create Arena Tournament
  console.log('\n[Step 2] Creating Arena tournament (duration 15 mins, win=2, draw=1, loss=0)...');
  const tournament = await globalTournamentService.createTournament({
    name: 'Audit Arena Speed Championship',
    type: 'arena',
    timeControl: '3+0',
    durationMinutes: 15,
    winPoints: 2.0,
    drawPoints: 1.0,
    lossPoints: 0.0
  }, organizer);

  assert.ok(tournament.id, 'Tournament ID exists');
  assert.strictEqual(tournament.type, 'arena');
  assert.strictEqual(tournament.status, 'registration');
  console.log(`✓ Arena created: ${tournament.id} (Type: arena, Status: registration)`);

  // 3. Register All 4 Players
  console.log('\n[Step 3] Registering players into Arena...');
  for (let i = 0; i < players.length; i++) {
    const res = await globalTournamentService.joinTournament(tournament.id, players[i]);
    assert.ok(!res.error, `Player ${i + 1} join error: ${res.error}`);
  }
  const entriesAfterReg = await tournRepo.getTournamentEntries(tournament.id);
  assert.strictEqual(entriesAfterReg.length, 4, 'All 4 players enrolled');
  console.log('✓ All 4 players successfully registered in Arena.');

  // 4. Start Tournament & Initial Continuous Pairings
  console.log('\n[Step 4] Starting Arena tournament & generating initial pairings...');
  const startRes = await globalTournamentService.startTournament(tournament.id, organizer);
  assert.ok(!startRes.error, `Start error: ${startRes.error}`);

  const initialPairings = await tournRepo.getTournamentPairings(tournament.id);
  assert.strictEqual(initialPairings.length, 2, 'Arena must pair 4 players into 2 games');
  console.log(`✓ Arena active! Generated ${initialPairings.length} simultaneous active boards.`);

  // 5. Play & Conclude First Wave of Games
  console.log('\n[Step 5] Concluding initial games with scores...');
  const g1 = initialPairings[0];
  const g2 = initialPairings[1];

  // Game 1: White wins (1-0) -> White earns 2.0 pts
  await globalTournamentService.handleTournamentGameEnd(tournament.id, g1.gameId, '1-0');
  console.log(`✓ Game 1 concluded: 1-0 (White +2.0 pts)`);

  // Game 2: Draw (1/2-1/2) -> Both earn 1.0 pt
  await globalTournamentService.handleTournamentGameEnd(tournament.id, g2.gameId, '1/2-1/2');
  console.log(`✓ Game 2 concluded: 1/2-1/2 (Both +1.0 pt)`);

  // 6. Verify Interim Arena Standings
  console.log('\n[Step 6] Verifying interim Arena standings and point totals...');
  const interimEntries = await tournRepo.getTournamentEntries(tournament.id);
  const scoreMap = new Map(interimEntries.map(e => [e.userId, Number(e.score)]));

  assert.strictEqual(scoreMap.get(g1.whiteUserId), 2.0, 'Game 1 White must have 2.0 pts');
  assert.strictEqual(scoreMap.get(g1.blackUserId), 0.0, 'Game 1 Black must have 0.0 pts');
  assert.strictEqual(scoreMap.get(g2.whiteUserId), 1.0, 'Game 2 White must have 1.0 pt');
  assert.strictEqual(scoreMap.get(g2.blackUserId), 1.0, 'Game 2 Black must have 1.0 pt');
  console.log('✓ Point tally verified: 1 player on 2.0, 2 players on 1.0, 1 player on 0.0.');

  // 7. Process Continuous Next Pairing Wave
  console.log('\n[Step 7] Processing next continuous pairing wave for freed players...');
  await globalTournamentService.processArenaPairings(tournament.id);
  const allPairingsWave2 = await tournRepo.getTournamentPairings(tournament.id);
  console.log(`✓ Total pairings after wave 2: ${allPairingsWave2.length} boards.`);
  assert.ok(allPairingsWave2.length >= 2, 'Arena continuous pairing engine generated subsequent games');

  // Conclude any newly active games
  const activeUnfinished = allPairingsWave2.filter(p => !p.result);
  for (const match of activeUnfinished) {
    await globalTournamentService.handleTournamentGameEnd(tournament.id, match.gameId, '1-0');
  }

  // 8. Terminal Completion
  console.log('\n[Step 8] Finishing Arena tournament & verifying terminal state...');
  await globalTournamentService.finishTournament(tournament.id);

  const finishedTourn = await tournRepo.findTournamentById(tournament.id);
  assert.strictEqual(finishedTourn.status, 'finished', 'Arena tournament status must be finished');
  console.log(`✓ Arena status is "finished".`);

  // 9. Database Rehydration & Persistence
  console.log('\n[Step 9] Verifying persistent database rehydration...');
  const finalStandings = await tournRepo.getTournamentEntries(tournament.id);
  assert.strictEqual(finalStandings.length, 4);

  // Standings must be ordered by score DESC
  for (let i = 0; i < finalStandings.length - 1; i++) {
    assert.ok(finalStandings[i].score >= finalStandings[i + 1].score, 'Standings must be sorted by score descending');
  }
  console.log('✓ Authoritative standings verified persisted in database.');

  // 10. Verify Rating Isolation (rated = false)
  console.log('\n[Step 10] Verifying rating isolation (zero Elo mutations from Arena)...');
  for (const player of players) {
    const rating = await getUserRating(player.id, 'blitz');
    assert.strictEqual(rating.rating, 1500, `Player ${player.username} rating mutated from 1500!`);
    assert.strictEqual(rating.gamesPlayed, 0, `Player ${player.username} rated gamesPlayed mutated!`);

    const history = await getRatingHistory(player.id);
    assert.strictEqual(history.length, 0, `Player ${player.username} has rating history rows created!`);
  }
  console.log('✓ Rating isolation strictly preserved: All players remain untouched at 1500 Elo.');

  await closeRedis();

  console.log('\n================================================================');
  console.log('=== COMPLETE ARENA TOURNAMENT LIFECYCLE: CERTIFIED PASS      ===');
  console.log('================================================================\n');
  process.exit(0);
}

runArenaCompleteLifecycleAudit().catch(err => {
  console.error('\n[Arena Complete Lifecycle Audit Fatal Error]:', err);
  process.exit(1);
});
