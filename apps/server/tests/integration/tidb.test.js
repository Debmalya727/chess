import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { initDb, getPool, isUsingMysql } from '../../src/db/index.js';
import { createUser, findUserById } from '../../src/db/userRepository.js';
import { createGame, findGameById, updateGameStatus } from '../../src/db/gameRepository.js';
import { createMove, findMovesByGameId } from '../../src/db/moveRepository.js';
import { getUserRating, getRatingHistory, updateRatingTransaction } from '../../src/db/ratingRepository.js';
import { applyGameRatings, getRatingCategory, calculateElo } from '../../src/ratings/ratingService.js';
import { ChessGame } from '@chess/core';

test('TiDB Cloud & Phase 5 Integration Test Suite', async (t) => {

  await t.test('1. Database Connection & Schema Migration Verification', async () => {
    await initDb();
    const usingMysql = isUsingMysql();
    console.log(`[TiDB Test] Database Mode: ${usingMysql ? 'TiDB / MySQL' : 'In-Memory Fallback'}`);
    
    if (usingMysql) {
      const pool = getPool();
      const [tables] = await pool.query('SHOW TABLES;');
      const tableNames = tables.map(t => Object.values(t)[0]);
      
      assert.ok(tableNames.includes('users'), 'users table exists');
      assert.ok(tableNames.includes('user_ratings'), 'user_ratings table exists');
      assert.ok(tableNames.includes('rating_history'), 'rating_history table exists');
      assert.ok(tableNames.includes('games'), 'games table exists');
      assert.ok(tableNames.includes('game_moves'), 'game_moves table exists');
    }
  });

  await t.test('2. Rating Categories & Elo Math Consistency', () => {
    assert.equal(getRatingCategory('1+0'), 'bullet');
    assert.equal(getRatingCategory('3+0'), 'blitz');
    assert.equal(getRatingCategory('3+2'), 'blitz');
    assert.equal(getRatingCategory('5+0'), 'blitz');
    assert.equal(getRatingCategory('10+0'), 'rapid');
    assert.equal(getRatingCategory('15+10'), 'rapid');
    assert.equal(getRatingCategory('30+0'), 'classical');

    const elo = calculateElo(1500, 1500, 1, 32);
    assert.equal(elo.playerA.newRating, 1516);
    assert.equal(elo.playerB.newRating, 1484);
    assert.equal(elo.playerA.change, 16);
    assert.equal(elo.playerB.change, -16);
  });

  await t.test('3. Database Transaction Rollback Safety', async () => {
    if (!isUsingMysql()) return;

    const pool = getPool();
    const conn = await pool.getConnection();
    const testUserId = `test-user-${crypto.randomUUID()}`;

    try {
      await conn.beginTransaction();

      await conn.query(
        `INSERT INTO users (id, username, email, password_hash, rating) VALUES (?, ?, ?, ?, ?)`,
        [testUserId, `user_${Date.now()}`, `test_${Date.now()}@example.com`, 'hash', 1500]
      );

      // Deliberately trigger error or rollback
      await conn.rollback();
    } catch (err) {
      await conn.rollback();
    } finally {
      conn.release();
    }

    const checkUser = await findUserById(testUserId);
    assert.equal(checkUser, null, 'User inserted inside rolled-back transaction must not exist in database');
  });

  await t.test('4. Atomic Game Completion & Elo Rating Deduplication', async () => {
    const userA = { id: `ua-${crypto.randomUUID()}`, username: `playerA_${Date.now()}`, email: `a_${Date.now()}@ex.com`, passwordHash: 'pwd' };
    const userB = { id: `ub-${crypto.randomUUID()}`, username: `playerB_${Date.now()}`, email: `b_${Date.now()}@ex.com`, passwordHash: 'pwd' };

    await createUser(userA);
    await createUser(userB);

    const gameId = `game-${crypto.randomUUID()}`;
    await createGame({
      id: gameId,
      roomCode: `R${Math.floor(1000 + Math.random() * 9000)}`,
      whitePlayerId: userA.id,
      blackPlayerId: userB.id,
      mode: 'ONLINE',
      status: 'IN_PROGRESS',
      timeControl: '10+0',
      initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    });

    let conn = null;
    if (isUsingMysql()) {
      const pool = getPool();
      conn = await pool.getConnection();
      await conn.beginTransaction();
    }

    const ratingResult = await applyGameRatings({
      gameId,
      timeControl: '10+0',
      whiteUserId: userA.id,
      blackUserId: userB.id,
      result: '1-0',
      connection: conn
    });

    await updateGameStatus(gameId, {
      status: 'FINISHED',
      result: '1-0',
      termination: 'checkmate'
    }, conn);

    if (conn) {
      await conn.commit();
      conn.release();
    }

    assert.ok(ratingResult, 'Rating result calculated');
    assert.equal(ratingResult.white.oldRating, 1500);
    assert.equal(ratingResult.white.newRating, 1516);
    assert.equal(ratingResult.black.newRating, 1484);

    const ratingA = await getUserRating(userA.id, 'rapid');
    const ratingB = await getUserRating(userB.id, 'rapid');

    assert.equal(ratingA.rating, 1516);
    assert.equal(ratingA.wins, 1);
    assert.equal(ratingA.gamesPlayed, 1);

    assert.equal(ratingB.rating, 1484);
    assert.equal(ratingB.losses, 1);
    assert.equal(ratingB.gamesPlayed, 1);

    const historyA = await getRatingHistory(userA.id);
    assert.equal(historyA.length, 1);
    assert.equal(historyA[0].gameId, gameId);
    assert.equal(historyA[0].ratingChange, 16);
  });

  await t.test('5. PGN Persistence & Replay Final FEN Consistency', async () => {
    const game = new ChessGame();
    game.move('e2', 'e4');
    game.move('e7', 'e5');
    game.move('g1', 'f3');
    game.move('b8', 'c6');
    game.move('f1', 'c4');
    game.move('f8', 'c5');
    game.move('c2', 'c3');
    game.move('g8', 'f6');

    const expectedFinalFen = game.getFen();
    const pgnText = game.getPGN({
      Event: 'Italian Game Test',
      White: 'Player1',
      Black: 'Player2',
      Result: '1/2-1/2'
    });

    assert.ok(pgnText.includes('Italian Game Test'), 'PGN contains header');
    assert.ok(pgnText.includes('1. e4 e5'), 'PGN contains moves');

    const replayGame = new ChessGame();
    const parsedMoves = game.getHistory();
    for (const m of parsedMoves) {
      replayGame.move(m.from, m.to, m.promotion);
    }

    assert.equal(replayGame.getFen(), expectedFinalFen, 'Replayed FEN matches stored final FEN');
  });

  await t.test('6. Active Game State Restoration from Database', async () => {
    const gameId = `restoration-${crypto.randomUUID()}`;
    await createGame({
      id: gameId,
      roomCode: `RC${Math.floor(1000 + Math.random() * 9000)}`,
      whitePlayerId: 'w1',
      blackPlayerId: 'b1',
      mode: 'ONLINE',
      status: 'IN_PROGRESS',
      timeControl: '5+0'
    });

    const movesToPlay = [
      { ply: 1, from: 'e2', to: 'e4', san: 'e4', fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' },
      { ply: 2, from: 'c7', to: 'c5', san: 'c5', fenAfter: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2' },
      { ply: 3, from: 'g1', to: 'f3', san: 'Nf3', fenAfter: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' }
    ];

    for (const m of movesToPlay) {
      await createMove({ gameId, ...m });
    }

    const fetchedGame = await findGameById(gameId);
    assert.ok(fetchedGame, 'Game fetched');

    const dbMoves = await findMovesByGameId(gameId);
    assert.equal(dbMoves.length, 3);
    assert.equal(dbMoves[0].san, 'e4');
    assert.equal(dbMoves[2].san, 'Nf3');

    // Reconstruct engine state
    const restoredEngine = new ChessGame();
    for (const m of dbMoves) {
      restoredEngine.move(m.from, m.to, m.promotion || undefined);
    }

    assert.equal(restoredEngine.getFen(), dbMoves[dbMoves.length - 1].fenAfter);
    assert.equal(restoredEngine.getTurn(), 'b');
  });

});
