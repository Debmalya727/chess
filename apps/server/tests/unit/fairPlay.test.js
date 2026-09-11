import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/index.js';
import { initDb } from '../../src/db/index.js';
import { createGame } from '../../src/db/gameRepository.js';
import { createMove } from '../../src/db/moveRepository.js';
import { createUser } from '../../src/db/userRepository.js';
import { generateToken } from '../../src/auth/authService.js';
import { globalFairPlayService } from '../../src/fairplay/fairPlayService.js';

test('Fair-Play Signal Engine Unit Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();
  const app = await createServer();

  const gameId = `g_fp_${Date.now()}`;
  const playerWhite = await createUser({ id: 'u_fp_w', username: 'FpWhite', email: 'fpw@test.com', passwordHash: 'hash', role: 'PLAYER' });
  const playerBlack = await createUser({ id: 'u_fp_b', username: 'FpBlack', email: 'fpb@test.com', passwordHash: 'hash', role: 'PLAYER' });
  const adminUser = await createUser({ id: 'u_fp_admin', username: 'FpAdmin', email: 'fpa@test.com', passwordHash: 'hash', role: 'ADMIN' });

  await createGame({
    id: gameId,
    roomCode: 'FP_TEST',
    whitePlayerId: playerWhite.id,
    blackPlayerId: playerBlack.id,
    status: 'FINISHED'
  });

  // Seed 12 moves with realistic human move times
  for (let i = 1; i <= 12; i++) {
    await createMove({
      gameId,
      ply: i,
      playerId: i % 2 === 1 ? playerWhite.id : playerBlack.id,
      from: 'e2',
      to: 'e4',
      san: 'e4',
      fenAfter: 'fen',
      moveTimeMs: 1500 + Math.floor(Math.random() * 2000)
    });
  }

  await t.test('Analyzes game and produces structured non-accusatory record', async () => {
    const analysis = await globalFairPlayService.analyzeGame(gameId);
    assert.ok(analysis);
    assert.equal(analysis.status, 'complete');
    assert.equal(analysis.engineCorrelation, null, 'Engine correlation must be null when server engine absent');
    assert.equal(analysis.averageCentipawnLoss, null, 'Centipawn loss must be null when server engine absent');
    assert.ok(typeof analysis.timingScore === 'number');
    assert.ok(typeof analysis.suspicionScore === 'number');
    assert.ok(Array.isArray(analysis.signals));
  });

  await t.test('Admin moderation API allows ADMIN, rejects regular PLAYER', async () => {
    const adminToken = generateToken(adminUser);
    const playerToken = generateToken(playerWhite);

    // Player rejected
    const resPlayer = await app.inject({
      method: 'GET',
      url: `/api/admin/fair-play/${gameId}`,
      headers: { authorization: `Bearer ${playerToken}` }
    });
    assert.equal(resPlayer.statusCode, 403);

    // Admin allowed
    const resAdmin = await app.inject({
      method: 'GET',
      url: `/api/admin/fair-play/${gameId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(resAdmin.statusCode, 200);
    const body = JSON.parse(resAdmin.payload);
    assert.equal(body.gameId, gameId);
    assert.equal(body.status, 'complete');
  });
});
