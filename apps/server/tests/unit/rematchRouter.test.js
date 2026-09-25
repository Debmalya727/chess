import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../../src/db/index.js';
import { createUser } from '../../src/db/userRepository.js';
import { createGame } from '../../src/db/gameRepository.js';
import { globalRoomManager } from '../../src/rooms/roomManager.js';
import { globalGameManager } from '../../src/games/gameManager.js';
import { routeWsMessage } from '../../src/websocket/router.js';
import { WS_EVENTS, ERROR_CODES } from '@chess/protocol';

test('Rematch WebSocket Router Integration Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();

  function createMockSocket() {
    return {
      id: `sock_${Math.random()}`,
      readyState: 1,
      sentMessages: [],
      send(data) {
        this.sentMessages.push(JSON.parse(data));
      }
    };
  }

  const p1 = await createUser({ id: 'u_router_1', username: 'RouterPlayer1', email: 'rp1@test.com' });
  const p2 = await createUser({ id: 'u_router_2', username: 'RouterPlayer2', email: 'rp2@test.com' });

  // Create completed game
  const room = globalRoomManager.createRoom({ hostUser: p1, timeControl: '10+0', colorPreference: 'w' });
  globalRoomManager.joinRoom(room.roomCode, p2);
  room.status = 'FINISHED';
  const session = globalGameManager.getOrCreateSession(room);
  session.isEnded = true;

  await createGame({
    id: room.id,
    roomCode: room.roomCode,
    whitePlayerId: p1.id,
    blackPlayerId: p2.id,
    status: 'FINISHED',
    timeControl: '10+0'
  });

  await t.test('Router: Unauthenticated game:rematch is rejected with UNAUTHORIZED', async () => {
    const socket = createMockSocket();
    const unauthState = { isAuthenticated: false, user: null };

    await routeWsMessage(socket, JSON.stringify({
      event: WS_EVENTS.GAME_REMATCH,
      payload: { gameId: room.id }
    }), unauthState);

    const err = socket.sentMessages.find(m => m.event === WS_EVENTS.ERROR);
    assert.ok(err);
    assert.equal(err.payload.code, ERROR_CODES.UNAUTHORIZED);
  });

  await t.test('Router: Missing gameId is rejected with INVALID_INPUT', async () => {
    const socket = createMockSocket();
    const authState = { isAuthenticated: true, user: p1 };

    await routeWsMessage(socket, JSON.stringify({
      event: WS_EVENTS.GAME_REMATCH,
      payload: {}
    }), authState);

    const err = socket.sentMessages.find(m => m.event === WS_EVENTS.ERROR);
    assert.ok(err);
    assert.equal(err.payload.code, 'INVALID_INPUT');
  });

  await t.test('Router: Valid game:rematch succeeds and returns confirmation', async () => {
    const socket = createMockSocket();
    const authState = { isAuthenticated: true, user: p1 };

    await routeWsMessage(socket, JSON.stringify({
      event: WS_EVENTS.GAME_REMATCH,
      payload: { gameId: room.id }
    }), authState);

    const confirm = socket.sentMessages.find(m => m.event === 'game:rematch:confirm');
    assert.ok(confirm);
    assert.equal(confirm.payload.gameId, room.id);
  });

  await t.test('Router: game:rematch:cancel cancels offer', async () => {
    const socket = createMockSocket();
    const authState = { isAuthenticated: true, user: p1 };

    await routeWsMessage(socket, JSON.stringify({
      event: WS_EVENTS.REMATCH_CANCEL,
      payload: { gameId: room.id }
    }), authState);

    const confirm = socket.sentMessages.find(m => m.event === 'game:rematch:cancel:confirm');
    assert.ok(confirm);
    assert.equal(confirm.payload.gameId, room.id);
    assert.equal(confirm.payload.cancelled, true);
  });
});
