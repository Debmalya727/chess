import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, inMemoryDb } from '../../src/db/index.js';
import { createUser } from '../../src/db/userRepository.js';
import { createGame, findGameById } from '../../src/db/gameRepository.js';
import { globalRoomManager } from '../../src/rooms/roomManager.js';
import { globalGameManager } from '../../src/games/gameManager.js';
import { RematchService } from '../../src/games/rematchService.js';
import { WS_EVENTS, ERROR_CODES } from '@chess/protocol';

test('Rematch Service Unit & Integration Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();

  // Helper to create mock sockets
  function createMockSocket(userId) {
    return {
      id: `mock_sock_${userId}_${Math.random()}`,
      readyState: 1, // OPEN
      user: { id: userId },
      messages: [],
      send(data) {
        this.messages.push(JSON.parse(data));
      }
    };
  }

  // Setup test users
  const userA = await createUser({ id: 'u_rematch_A', username: 'PlayerA', email: 'pa@test.com', rating: 1500 });
  const userB = await createUser({ id: 'u_rematch_B', username: 'PlayerB', email: 'pb@test.com', rating: 1600 });
  const spectator = await createUser({ id: 'u_spectator', username: 'Spectator', email: 'spec@test.com', rating: 1400 });

  t.beforeEach(() => {
    // Clear rooms and games between tests to prevent active-game state leakage
    globalRoomManager.roomsById.clear();
    globalRoomManager.roomsByCode.clear();
    inMemoryDb.games.clear();
    inMemoryDb.gamesByRoomCode.clear();
  });

  // Helper to create a completed test game
  async function createCompletedGame({
    timeControl = '5+0',
    rated = true,
    tournamentId = null,
    whiteId = userA.id,
    blackId = userB.id
  } = {}) {
    const whiteUser = whiteId === userA.id ? userA : userB;
    const blackUser = whiteId === userA.id ? userB : userA;

    const room = globalRoomManager.createRoom({
      hostUser: whiteUser,
      timeControl,
      colorPreference: 'w'
    });
    room.whiteUsername = whiteUser.username;
    room.blackUsername = blackUser.username;
    room.rated = rated;
    if (tournamentId) room.tournamentId = tournamentId;

    globalRoomManager.joinRoom(room.roomCode, blackUser);
    room.status = 'FINISHED';

    const session = globalGameManager.getOrCreateSession(room);
    session.isEnded = true;
    session.result = '1-0';
    session.termination = 'checkmate';

    const sockA = createMockSocket(whiteUser.id);
    const sockB = createMockSocket(blackUser.id);
    room.connectedSockets.set(whiteUser.id, sockA);
    room.connectedSockets.set(blackUser.id, sockB);

    await createGame({
      id: room.id,
      roomCode: room.roomCode,
      whitePlayerId: whiteUser.id,
      blackPlayerId: blackUser.id,
      mode: 'ONLINE',
      status: 'FINISHED',
      timeControl,
      rated,
      tournamentId,
      initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    });

    return { room, session, sockA, sockB };
  }

  await t.test('Offer: Valid offer creates pending offer and notifies opponent', async () => {
    const service = new RematchService();
    const { room, sockB } = await createCompletedGame();

    const res = await service.requestRematch(userA, room.id);
    assert.ok(res.success);
    assert.equal(res.gameId, room.id);
    assert.equal(res.offeredBy, userA.id);
    assert.ok(res.expiresAt > Date.now());

    // Check opponent socket notification
    const offeredMsg = sockB.messages.find(m => m.event === WS_EVENTS.REMATCH_OFFERED);
    assert.ok(offeredMsg);
    assert.equal(offeredMsg.payload.gameId, room.id);
    assert.equal(offeredMsg.payload.offeredBy, userA.id);
    assert.equal(offeredMsg.payload.offeredByUsername, userA.username);
  });

  await t.test('Offer: Invalid payload returns error', async () => {
    const service = new RematchService();
    const res1 = await service.requestRematch(null, 'some_id');
    assert.equal(res1.error, ERROR_CODES.UNAUTHORIZED);

    const res2 = await service.requestRematch(userA, '');
    assert.equal(res2.error, 'INVALID_INPUT');
  });

  await t.test('Offer: Nonexistent game returns GAME_NOT_FOUND', async () => {
    const service = new RematchService();
    const res = await service.requestRematch(userA, 'nonexistent_game_id');
    assert.equal(res.error, ERROR_CODES.GAME_NOT_FOUND);
  });

  await t.test('Offer: Ongoing active game returns GAME_NOT_FINISHED', async () => {
    const service = new RematchService();
    const room = globalRoomManager.createRoom({ hostUser: userA, timeControl: '10+0', colorPreference: 'w' });
    globalRoomManager.joinRoom(room.roomCode, userB);
    room.status = 'ACTIVE';

    await createGame({
      id: room.id,
      roomCode: room.roomCode,
      whitePlayerId: userA.id,
      blackPlayerId: userB.id,
      status: 'ACTIVE',
      timeControl: '10+0'
    });

    const res = await service.requestRematch(userA, room.id);
    assert.equal(res.error, ERROR_CODES.GAME_NOT_FINISHED);
    room.status = 'FINISHED';
  });

  await t.test('Offer: Non-player spectator is rejected with FORBIDDEN', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame();

    const res = await service.requestRematch(spectator, room.id);
    assert.equal(res.error, ERROR_CODES.FORBIDDEN);
  });

  await t.test('Offer: Tournament match is rejected with TOURNAMENT_REMATCH_NOT_ALLOWED', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame({ tournamentId: 'tourn_123' });

    const res = await service.requestRematch(userA, room.id);
    assert.equal(res.error, ERROR_CODES.TOURNAMENT_REMATCH_NOT_ALLOWED);
  });

  await t.test('Offer: Duplicate offer from same player is idempotent', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame();

    const res1 = await service.requestRematch(userA, room.id);
    assert.ok(res1.success);
    assert.ok(!res1.alreadyPending);

    const res2 = await service.requestRematch(userA, room.id);
    assert.ok(res2.success);
    assert.equal(res2.alreadyPending, true);
    assert.equal(res2.offeredBy, userA.id);
  });

  await t.test('Accept: Valid acceptance creates Game 2 with inverted colors and fresh room', async () => {
    const service = new RematchService();
    const { room: room1, sockA, sockB } = await createCompletedGame({ timeControl: '3+2', rated: true });

    // User A offers
    await service.requestRematch(userA, room1.id);

    // User B accepts
    const res = await service.respondRematch(userB, room1.id, true);
    assert.ok(res.success);
    assert.ok(res.newGameId);
    assert.notEqual(res.newGameId, room1.id);
    assert.ok(res.newRoomCode);
    assert.notEqual(res.newRoomCode, room1.roomCode);

    // Color Inversion check:
    // Game 1: White = userA, Black = userB
    // Game 2: White = userB, Black = userA
    assert.equal(res.whitePlayerId, userB.id);
    assert.equal(res.blackPlayerId, userA.id);

    // Verify Game 2 state in DB
    const game2 = await findGameById(res.newGameId);
    assert.ok(game2);
    assert.equal(game2.whitePlayerId, userB.id);
    assert.equal(game2.blackPlayerId, userA.id);
    assert.equal(game2.timeControl, '3+2');
    assert.equal(game2.rated, true);
    assert.equal(game2.status, 'ACTIVE');

    // Verify Game 1 remains immutable
    const game1Post = await findGameById(room1.id);
    assert.equal(game1Post.whitePlayerId, userA.id);
    assert.equal(game1Post.blackPlayerId, userB.id);
    assert.equal(game1Post.status, 'FINISHED');
    assert.equal(game1Post.roomCode, room1.roomCode);

    // Verify game:init dispatched to both sockets with correct colors
    const initA = sockA.messages.find(m => m.event === WS_EVENTS.GAME_INIT);
    const initB = sockB.messages.find(m => m.event === WS_EVENTS.GAME_INIT);
    assert.ok(initA);
    assert.ok(initB);
    assert.equal(initA.payload.color, 'b'); // userA is Black in Game 2
    assert.equal(initB.payload.color, 'w'); // userB is White in Game 2
    assert.equal(initA.payload.gameId, res.newGameId);
  });

  await t.test('Accept: Offering player cannot accept their own offer', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame();

    await service.requestRematch(userA, room.id);
    const res = await service.respondRematch(userA, room.id, true);
    assert.equal(res.error, ERROR_CODES.FORBIDDEN);
  });

  await t.test('Accept: Non-player cannot respond to rematch offer', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame();

    await service.requestRematch(userA, room.id);
    const res = await service.respondRematch(spectator, room.id, true);
    assert.equal(res.error, ERROR_CODES.FORBIDDEN);
  });

  await t.test('Accept: Cannot accept expired or nonexistent offer', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame();

    const res = await service.respondRematch(userB, room.id, true);
    assert.equal(res.error, ERROR_CODES.REMATCH_NOT_FOUND);
  });

  await t.test('Decline: Declining offer cleans up pending offer and broadcasts rematch:declined', async () => {
    const service = new RematchService();
    const { room, sockA, sockB } = await createCompletedGame();

    await service.requestRematch(userA, room.id);
    const res = await service.respondRematch(userB, room.id, false);
    assert.ok(res.success);
    assert.equal(res.declined, true);

    // Verify rematch:declined message sent to offering player
    const declMsg = sockA.messages.find(m => m.event === WS_EVENTS.REMATCH_DECLINED);
    assert.ok(declMsg);
    assert.equal(declMsg.payload.declinedBy, userB.id);

    // Subsequent response returns REMATCH_NOT_FOUND
    const resAfter = await service.respondRematch(userB, room.id, true);
    assert.equal(resAfter.error, ERROR_CODES.REMATCH_NOT_FOUND);
  });

  await t.test('Cancel: Player who offered can cancel rematch offer', async () => {
    const service = new RematchService();
    const { room, sockA, sockB } = await createCompletedGame();

    await service.requestRematch(userA, room.id);
    const res = await service.cancelRematch(userA, room.id);
    assert.ok(res.success);
    assert.equal(res.cancelled, true);

    const cancelMsgA = sockA.messages.find(m => m.event === WS_EVENTS.REMATCH_CANCELLED);
    const cancelMsgB = sockB.messages.find(m => m.event === WS_EVENTS.REMATCH_CANCELLED);
    assert.ok(cancelMsgA);
    assert.ok(cancelMsgB);
    assert.equal(cancelMsgA.payload.reason, 'cancelled_by_player');

    // Offer no longer pending
    const resAfter = await service.respondRematch(userB, room.id, true);
    assert.equal(resAfter.error, ERROR_CODES.REMATCH_NOT_FOUND);
  });

  await t.test('Cancel: Recipient cannot cancel an offer they did not make', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame();

    await service.requestRematch(userA, room.id);
    const res = await service.cancelRematch(userB, room.id);
    assert.equal(res.error, ERROR_CODES.FORBIDDEN);
  });

  await t.test('Concurrency: Simultaneous mutual requests coalesce into single game creation', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame();

    // User A requests rematch
    const resA = await service.requestRematch(userA, room.id);
    assert.ok(resA.success);

    // User B requests rematch while A's offer is pending (Mutual Request)
    const resB = await service.requestRematch(userB, room.id);
    assert.ok(resB.success);
    assert.ok(resB.newGameId); // Coalesced into game creation!

    // Verify only ONE game was resolved for this room
    assert.equal(service.resolvedRematches.get(room.id), resB.newGameId);

    // Any further request on room is rejected with REMATCH_ALREADY_RESOLVED
    const resLate = await service.requestRematch(userA, room.id);
    assert.equal(resLate.error, ERROR_CODES.REMATCH_ALREADY_RESOLVED);
  });

  await t.test('Concurrency Invariant: Exactly ONE Game 2 is created under parallel acceptance race', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame();

    await service.requestRematch(userA, room.id);

    // Trigger two acceptances concurrently
    const [race1, race2] = await Promise.all([
      service.respondRematch(userB, room.id, true),
      service.respondRematch(userB, room.id, true)
    ]);

    const successes = [race1, race2].filter(r => r.success);
    const errors = [race1, race2].filter(r => r.error);

    assert.equal(successes.length, 1, 'Exactly one acceptance must succeed');
    assert.equal(errors.length, 1, 'One acceptance must receive error');
    assert.equal(errors[0].error, ERROR_CODES.REMATCH_ALREADY_RESOLVED);
  });

  await t.test('Disconnect: Disconnect cancels pending offer and notifies opponent', async () => {
    const service = new RematchService();
    const { room, sockB } = await createCompletedGame();

    await service.requestRematch(userA, room.id);
    service.handleUserDisconnected(userA.id);

    // Opponent received cancellation
    const cancelMsg = sockB.messages.find(m => m.event === WS_EVENTS.REMATCH_CANCELLED);
    assert.ok(cancelMsg);
    assert.equal(cancelMsg.payload.reason, 'opponent_disconnected');

    // Offer no longer pending
    const resAfter = await service.respondRematch(userB, room.id, true);
    assert.equal(resAfter.error, ERROR_CODES.REMATCH_NOT_FOUND);
  });

  await t.test('Rating: Rematch creation does NOT directly modify player ratings', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame({ timeControl: '10+0', rated: true });

    const ratingABefore = inMemoryDb.users.get(userA.id).rating;
    const ratingBBefore = inMemoryDb.users.get(userB.id).rating;

    await service.requestRematch(userA, room.id);
    await service.respondRematch(userB, room.id, true);

    const ratingAAfter = inMemoryDb.users.get(userA.id).rating;
    const ratingBAfter = inMemoryDb.users.get(userB.id).rating;

    assert.equal(ratingAAfter, ratingABefore, 'Player A rating must not change during rematch creation');
    assert.equal(ratingBAfter, ratingBBefore, 'Player B rating must not change during rematch creation');
  });

  await t.test('Active Game: Reject rematch if either player is in another active game', async () => {
    const service = new RematchService();
    const { room } = await createCompletedGame();

    // Put User B in another active game
    const activeRoom = globalRoomManager.createRoom({ hostUser: userB, timeControl: '5+0' });
    activeRoom.status = 'ACTIVE';

    const res = await service.requestRematch(userA, room.id);
    assert.equal(res.error, ERROR_CODES.PLAYER_ALREADY_IN_GAME);

    // Cleanup active room
    activeRoom.status = 'FINISHED';
  });

  await t.test('Timeout: Offer expires after 30 seconds and broadcasts rematch:cancelled with reason timeout', async () => {
    const service = new RematchService();
    const { room, sockA, sockB } = await createCompletedGame();

    await service.requestRematch(userA, room.id);
    service._handleOfferTimeout(room.id);

    const cancelA = sockA.messages.find(m => m.event === WS_EVENTS.REMATCH_CANCELLED);
    const cancelB = sockB.messages.find(m => m.event === WS_EVENTS.REMATCH_CANCELLED);
    assert.ok(cancelA);
    assert.ok(cancelB);
    assert.equal(cancelA.payload.reason, 'timeout');
    assert.equal(cancelB.payload.reason, 'timeout');

    // Offer no longer pending
    const resAfter = await service.respondRematch(userB, room.id, true);
    assert.equal(resAfter.error, ERROR_CODES.REMATCH_NOT_FOUND);
  });
});
