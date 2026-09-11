/**
 * tests/security/game_integrity_security.test.cjs
 *
 * Phase 9 Security Suite: Game Authority, Turn Validation, Illegal Move
 * Prevention, Move Idempotency, Stale State Versioning & Rating Isolation.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');

describe('Game Integrity & Rating Security Hardening', () => {
  let userAlice;
  let userBob;
  let userEve;
  let GameService;
  let globalRoomManager;
  let globalGameManager;
  let getUserRatings;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_MODE = 'memory';
    process.env.REDIS_REQUIRED = 'false';

    const { initDb } = await import('../../apps/server/src/db/index.js');
    const { createUser } = await import('../../apps/server/src/db/userRepository.js');
    const { hashPassword } = await import('../../apps/server/src/auth/passwordService.js');
    const gameServiceModule = await import('../../apps/server/src/games/gameService.js');
    const roomManagerModule = await import('../../apps/server/src/rooms/roomManager.js');
    const gameManagerModule = await import('../../apps/server/src/games/gameManager.js');
    const ratingRepo = await import('../../apps/server/src/db/ratingRepository.js');

    GameService = gameServiceModule.GameService;
    globalRoomManager = roomManagerModule.globalRoomManager;
    globalGameManager = gameManagerModule.globalGameManager;
    getUserRatings = ratingRepo.getUserRatings;

    await initDb();

    const pwdHash = await hashPassword('Secret123!');
    userAlice = await createUser({ username: `alice_gi_${Date.now()}`, email: `a_${Date.now()}@chess.com`, passwordHash: pwdHash });
    userBob = await createUser({ username: `bob_gi_${Date.now()}`, email: `b_${Date.now()}@chess.com`, passwordHash: pwdHash });
    userEve = await createUser({ username: `eve_gi_${Date.now()}`, email: `e_${Date.now()}@chess.com`, passwordHash: pwdHash });
  });

  const createTestGame = (rated = true) => {
    const roomId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const room = {
      id: roomId,
      roomCode: 'TEST_' + Math.random().toString(36).substr(2, 4).toUpperCase(),
      whitePlayerId: userAlice.id,
      whiteUsername: userAlice.username,
      blackPlayerId: userBob.id,
      blackUsername: userBob.username,
      timeControl: '10+0',
      status: 'ACTIVE',
      rated,
      players: new Map([[userAlice.id, userAlice], [userBob.id, userBob]]),
      connectedSockets: new Map(),
      createdAt: new Date().toISOString()
    };
    globalRoomManager.roomsById.set(room.id, room);
    const session = globalGameManager.getOrCreateSession(room);
    return { room, session };
  };

  test('Impersonator or third-party player cannot submit moves (NOT_YOUR_TURN)', async () => {
    const { session } = createTestGame();

    // Eve attempts move on Alice & Bob's game
    const res = await session.processMove({
      user: userEve,
      from: 'e2',
      to: 'e4'
    });

    assert.strictEqual(res.error, 'NOT_YOUR_TURN', 'Third-party user is rejected');
  });

  test('Player cannot move out of turn (NOT_YOUR_TURN)', async () => {
    const { session } = createTestGame();

    // Bob (Black) attempts to move on White's first turn
    const res = await session.processMove({
      user: userBob,
      from: 'e7',
      to: 'e5'
    });

    assert.strictEqual(res.error, 'NOT_YOUR_TURN', 'Black player moving on White turn rejected');
  });

  test('Illegal chess moves are rejected by server chess authority (INVALID_MOVE)', async () => {
    const { session } = createTestGame();

    // Alice attempts illegal pawn move e2 -> e5
    const res = await session.processMove({
      user: userAlice,
      from: 'e2',
      to: 'e5'
    });

    assert.strictEqual(res.error, 'INVALID_MOVE', 'Illegal move rejected by authoritative engine');
  });

  test('Move submission idempotency preserves stateVersion and caches result', async () => {
    const { session } = createTestGame();

    const clientMoveId = `move_test_${Date.now()}`;
    const firstRes = await session.processMove({
      user: userAlice,
      from: 'e2',
      to: 'e4',
      clientMoveId
    });

    assert.strictEqual(firstRes.success, true);
    assert.strictEqual(firstRes.stateVersion, 2);

    // Replay identical move with same clientMoveId
    const replayRes = await session.processMove({
      user: userAlice,
      from: 'e2',
      to: 'e4',
      clientMoveId
    });

    assert.strictEqual(replayRes.success, true);
    assert.strictEqual(replayRes.isDuplicate, true, 'Replay recognized as duplicate');
    assert.strictEqual(replayRes.stateVersion, 2, 'State version does not increment on replay');
  });

  test('Stale state version rejection enforces client synchronization (STALE_STATE)', async () => {
    const { session } = createTestGame();

    // Move 1: Alice plays e4 (stateVersion -> 1)
    await session.processMove({ user: userAlice, from: 'e2', to: 'e4' });

    // Bob attempts to move sending outdated stateVersion: 0
    const staleRes = await session.processMove({
      user: userBob,
      from: 'e7',
      to: 'e5',
      expectedStateVersion: 0
    });

    assert.strictEqual(staleRes.error, 'STALE_STATE', 'Stale expectedStateVersion rejected');
  });

  test('Moves on finished games are strictly rejected (GAME_FINISHED)', async () => {
    const { session } = createTestGame();

    // Resign game
    session.resign(userAlice);
    assert.strictEqual(session.isEnded, true);

    // Attempt move
    const res = await session.processMove({
      user: userBob,
      from: 'e7',
      to: 'e5'
    });

    assert.strictEqual(res.error, 'GAME_FINISHED', 'Moves on finished game rejected');
  });

  test('Tournament games remain unrated (Elo ratings remain untouched)', async () => {
    const initialAliceRatings = await getUserRatings(userAlice.id);
    const initialBobRatings = await getUserRatings(userBob.id);

    // Create unrated tournament game
    const { session } = createTestGame(false);

    // Alice resigns -> Bob wins
    session.resign(userAlice);

    // Wait for async finish handler to complete
    await new Promise(r => setTimeout(r, 200));

    const postAliceRatings = await getUserRatings(userAlice.id);
    const postBobRatings = await getUserRatings(userBob.id);

    assert.strictEqual(
      postAliceRatings.rapid?.rating,
      initialAliceRatings.rapid?.rating,
      'Alice rating unchanged after tournament game'
    );
    assert.strictEqual(
      postBobRatings.rapid?.rating,
      initialBobRatings.rapid?.rating,
      'Bob rating unchanged after tournament game'
    );
  });
});
