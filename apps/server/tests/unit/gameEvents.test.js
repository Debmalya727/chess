import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../src/index.js';
import { initDb } from '../../src/db/index.js';
import { recordGameEvent, getGameEvents } from '../../src/db/gameEventRepository.js';
import { createGame } from '../../src/db/gameRepository.js';
import { createUser } from '../../src/db/userRepository.js';
import { generateToken } from '../../src/auth/authService.js';

test('Game Event Audit Trail Unit Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();
  const app = await createServer();

  const gameId = `g_audit_${Date.now()}`;
  const playerA = await createUser({ id: 'u_ev_1', username: 'EvPlayerA', email: 'ea@test.com', passwordHash: 'hash', role: 'PLAYER' });
  const playerB = await createUser({ id: 'u_ev_2', username: 'EvPlayerB', email: 'eb@test.com', passwordHash: 'hash', role: 'PLAYER' });
  const outsider = await createUser({ id: 'u_ev_3', username: 'EvOutsider', email: 'eo@test.com', passwordHash: 'hash', role: 'PLAYER' });
  const admin = await createUser({ id: 'u_ev_admin', username: 'EvAdmin', email: 'admin_ev@test.com', passwordHash: 'hash', role: 'ADMIN' });

  await createGame({
    id: gameId,
    roomCode: 'AUDIT_RM',
    whitePlayerId: playerA.id,
    blackPlayerId: playerB.id,
    status: 'ACTIVE'
  });

  await t.test('Authoritatively records game events sequentially', async () => {
    await recordGameEvent({ gameId, eventType: 'GAME_CREATED', userId: playerA.id });
    await recordGameEvent({ gameId, eventType: 'PLAYER_JOINED', userId: playerB.id });
    await recordGameEvent({ gameId, eventType: 'GAME_STARTED', userId: playerA.id });
    await recordGameEvent({ gameId, eventType: 'MOVE_PLAYED', userId: playerA.id, ply: 1, metadata: { san: 'e4' } });
    await recordGameEvent({ gameId, eventType: 'GAME_FINISHED', metadata: { result: '1-0', termination: 'checkmate' } });

    const events = await getGameEvents(gameId);
    assert.equal(events.length, 5);
    assert.equal(events[0].eventType, 'GAME_CREATED');
    assert.equal(events[1].eventType, 'PLAYER_JOINED');
    assert.equal(events[2].eventType, 'GAME_STARTED');
    assert.equal(events[3].eventType, 'MOVE_PLAYED');
    assert.equal(events[4].eventType, 'GAME_FINISHED');
  });

  await t.test('Audit API allows game participants and admins, rejects outsiders', async () => {
    const tokenA = generateToken(playerA);
    const tokenOutsider = generateToken(outsider);
    const tokenAdmin = generateToken(admin);

    // Participant allowed
    const resA = await app.inject({
      method: 'GET',
      url: `/api/games/${gameId}/events`,
      headers: { authorization: `Bearer ${tokenA}` }
    });
    assert.equal(resA.statusCode, 200);
    const bodyA = JSON.parse(resA.payload);
    assert.equal(bodyA.events.length, 5);

    // Outsider rejected (403)
    const resOutsider = await app.inject({
      method: 'GET',
      url: `/api/games/${gameId}/events`,
      headers: { authorization: `Bearer ${tokenOutsider}` }
    });
    assert.equal(resOutsider.statusCode, 403);

    // Admin allowed
    const resAdmin = await app.inject({
      method: 'GET',
      url: `/api/games/${gameId}/events`,
      headers: { authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(resAdmin.statusCode, 200);
  });
});
