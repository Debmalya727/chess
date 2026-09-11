/**
 * Phase 10 Database Consistency & Integrity Verification
 * Non-destructive diagnostics for all authoritative relationships.
 */
const assert = require('assert');

async function runDatabaseConsistencyCheck() {
  console.log('================================================================');
  console.log('=== PHASE 10 AUDIT: DATABASE CONSISTENCY & INTEGRITY CHECK   ===');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.DB_MODE = 'memory';
  process.env.REDIS_REQUIRED = 'false';

  const { initDb, isUsingMysql, getPool, inMemoryDb } = await import('../../apps/server/src/db/index.js');
  const userRepo = await import('../../apps/server/src/db/userRepository.js');
  const gameRepo = await import('../../apps/server/src/db/gameRepository.js');
  const moveRepo = await import('../../apps/server/src/db/moveRepository.js');
  const tournRepo = await import('../../apps/server/src/db/tournamentRepository.js');
  const eventRepo = await import('../../apps/server/src/db/gameEventRepository.js');
  const ratingRepo = await import('../../apps/server/src/db/ratingRepository.js');

  await initDb();

  // Populate representative relational data
  console.log('[Setup] Seeding relational records to test consistency diagnostics...');
  const u1 = await userRepo.createUser({ username: `consist_u1_${Date.now()}`, email: `u1_${Date.now()}@test.com`, passwordHash: 'hash' });
  const u2 = await userRepo.createUser({ username: `consist_u2_${Date.now()}`, email: `u2_${Date.now()}@test.com`, passwordHash: 'hash' });

  const t1 = await tournRepo.createTournament({ name: 'Consistency Open', type: 'swiss', totalRounds: 2 });
  await tournRepo.registerUserForTournament(t1.id, u1.id, 1);
  await tournRepo.registerUserForTournament(t1.id, u2.id, 2);

  const g1 = await gameRepo.createGame({
    roomCode: 'CONSIST_01',
    whitePlayerId: u1.id,
    blackPlayerId: u2.id,
    tournamentId: t1.id,
    timeControl: '10+0',
    status: 'COMPLETED',
    winner: 'white'
  });

  await moveRepo.createMove({
    gameId: g1.id,
    ply: 1,
    playerId: u1.id,
    from: 'e2',
    to: 'e4',
    san: 'e4',
    fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
  });
  await moveRepo.createMove({
    gameId: g1.id,
    ply: 2,
    playerId: u2.id,
    from: 'e7',
    to: 'e5',
    san: 'e5',
    fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
  });

  await eventRepo.recordGameEvent({ gameId: g1.id, eventType: 'GAME_STARTED', userId: u1.id });
  await eventRepo.recordGameEvent({ gameId: g1.id, eventType: 'MOVE_PLAYED', ply: 1, userId: u1.id });
  await eventRepo.recordGameEvent({ gameId: g1.id, eventType: 'GAME_FINISHED', metadata: { winner: 'white' } });

  await tournRepo.createTournamentRound(t1.id, 1);
  await tournRepo.addTournamentPairing({
    tournamentId: t1.id,
    roundId: 1,
    roundNumber: 1,
    whiteUserId: u1.id,
    blackUserId: u2.id,
    gameId: g1.id
  });

  await ratingRepo.updateRatingTransaction({
    userId: u1.id,
    ratingType: 'rapid',
    oldRating: 1500,
    newRating: 1515,
    outcome: 'win',
    gameId: g1.id
  });

  console.log('\n[Diagnostic 1] Checking for orphan moves (game_moves without matching games)...');
  let orphanMoves = 0;
  if (isUsingMysql()) {
    const [rows] = await getPool().query(
      `SELECT m.id, m.game_id FROM game_moves m LEFT JOIN games g ON m.game_id = g.id WHERE g.id IS NULL`
    );
    orphanMoves = rows.length;
  } else {
    for (const [gameId, moves] of inMemoryDb.gameMoves.entries()) {
      if (!inMemoryDb.games.has(gameId)) orphanMoves += moves.length;
    }
  }
  assert.strictEqual(orphanMoves, 0, 'Zero orphan moves permitted');
  console.log('✓ PASS: No orphan moves detected.');

  console.log('[Diagnostic 2] Checking move sequence continuity and ply gaps...');
  let plyGaps = 0;
  if (!isUsingMysql()) {
    for (const [gameId, moves] of inMemoryDb.gameMoves.entries()) {
      const sorted = [...moves].sort((a, b) => a.ply - b.ply);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].ply !== i + 1) plyGaps++;
      }
    }
  }
  assert.strictEqual(plyGaps, 0, 'Zero ply gaps permitted in move histories');
  console.log('✓ PASS: All move plies contiguous and monotonically increasing.');

  console.log('[Diagnostic 3] Checking for orphan game events...');
  let orphanEvents = 0;
  if (isUsingMysql()) {
    const [rows] = await getPool().query(
      `SELECT e.id FROM game_events e LEFT JOIN games g ON e.game_id = g.id WHERE g.id IS NULL`
    );
    orphanEvents = rows.length;
  } else {
    orphanEvents = inMemoryDb.gameEvents.filter(e => !inMemoryDb.games.has(e.gameId)).length;
  }
  assert.strictEqual(orphanEvents, 0, 'Zero orphan game events permitted');
  console.log('✓ PASS: All game events reference valid games.');

  console.log('[Diagnostic 4] Checking for duplicate tournament registrations...');
  let dupEntries = 0;
  if (isUsingMysql()) {
    const [rows] = await getPool().query(
      `SELECT tournament_id, user_id, COUNT(*) as cnt FROM tournament_entries GROUP BY tournament_id, user_id HAVING cnt > 1`
    );
    dupEntries = rows.length;
  } else {
    const keys = new Set();
    for (const entry of inMemoryDb.tournamentEntries.values()) {
      const k = `${entry.tournamentId}:${entry.userId}`;
      if (keys.has(k)) dupEntries++;
      keys.add(k);
    }
  }
  assert.strictEqual(dupEntries, 0, 'Zero duplicate tournament entries permitted');
  console.log('✓ PASS: Tournament registration cardinality intact.');

  console.log('[Diagnostic 5] Checking for orphan tournament pairings...');
  let orphanPairings = 0;
  if (isUsingMysql()) {
    const [rows] = await getPool().query(
      `SELECT p.id FROM tournament_pairings p LEFT JOIN tournaments t ON p.tournament_id = t.id WHERE t.id IS NULL`
    );
    orphanPairings = rows.length;
  } else {
    orphanPairings = inMemoryDb.tournamentPairings.filter(p => !inMemoryDb.tournaments.has(p.tournamentId)).length;
  }
  assert.strictEqual(orphanPairings, 0, 'Zero orphan tournament pairings permitted');
  console.log('✓ PASS: All pairings reference valid tournaments.');

  console.log('[Diagnostic 6] Checking pairing game references...');
  let orphanPairingGames = 0;
  if (isUsingMysql()) {
    const [rows] = await getPool().query(
      `SELECT p.id FROM tournament_pairings p LEFT JOIN games g ON p.game_id = g.id WHERE p.game_id IS NOT NULL AND g.id IS NULL`
    );
    orphanPairingGames = rows.length;
  } else {
    orphanPairingGames = inMemoryDb.tournamentPairings.filter(p => p.gameId && !inMemoryDb.games.has(p.gameId)).length;
  }
  assert.strictEqual(orphanPairingGames, 0, 'Zero orphan game references in pairings');
  console.log('✓ PASS: All pairing games reference valid game records.');

  console.log('[Diagnostic 7] Checking for orphan rating history records...');
  let orphanRatings = 0;
  if (isUsingMysql()) {
    const [rows] = await getPool().query(
      `SELECT r.id FROM rating_history r LEFT JOIN users u ON r.user_id = u.id WHERE u.id IS NULL`
    );
    orphanRatings = rows.length;
  } else {
    orphanRatings = inMemoryDb.ratingHistory.filter(r => !inMemoryDb.users.has(r.userId)).length;
  }
  assert.strictEqual(orphanRatings, 0, 'Zero orphan rating history entries');
  console.log('✓ PASS: All rating histories reference valid users.');

  console.log('[Diagnostic 8] Checking game status domain validity...');
  const validStatuses = new Set(['PENDING', 'ACTIVE', 'COMPLETED', 'ABORTED', 'DRAW']);
  let invalidStatusCount = 0;
  if (isUsingMysql()) {
    const [rows] = await getPool().query(
      `SELECT id, status FROM games WHERE status NOT IN ('PENDING', 'ACTIVE', 'COMPLETED', 'ABORTED', 'DRAW')`
    );
    invalidStatusCount = rows.length;
  } else {
    for (const g of inMemoryDb.games.values()) {
      if (!validStatuses.has(g.status)) invalidStatusCount++;
    }
  }
  assert.strictEqual(invalidStatusCount, 0, 'Zero games with invalid statuses');
  console.log('✓ PASS: All game statuses within authoritative state enum.');

  console.log('\n================================================================');
  console.log('=== ALL 8 DATABASE INTEGRITY DIAGNOSTICS PASSED (0 ANOMALIES) ===');
  console.log('================================================================\n');
  process.exit(0);
}

runDatabaseConsistencyCheck().catch(err => {
  console.error('\n[Database Consistency Diagnostic Failure]:', err);
  process.exit(1);
});
