import { WS_EVENTS } from '@chess/protocol';
import { globalRoomManager } from '../../rooms/roomManager.js';
import { globalGameManager } from '../../games/gameManager.js';
import { createGame } from '../../db/gameRepository.js';

export async function handleRoomCreate(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) {
    return sendError('UNAUTHORIZED', 'Authentication required.');
  }

  const { timeControl = '10+0', colorPreference = 'random' } = payload;
  const user = clientState.user;

  const room = globalRoomManager.createRoom({ hostUser: user, timeControl, colorPreference });
  room.connectedSockets.set(user.id, socket);
  clientState.currentRoomId = room.id;

  await createGame({
    id: room.id,
    roomCode: room.roomCode,
    whitePlayerId: room.whitePlayerId,
    blackPlayerId: room.blackPlayerId,
    timeControl: room.timeControl,
    status: room.status,
    initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  });

  sendResponse(WS_EVENTS.GAME_INIT, {
    gameId: room.id,
    roomCode: room.roomCode,
    status: room.status,
    whitePlayerId: room.whitePlayerId,
    blackPlayerId: room.blackPlayerId,
    timeControl: room.timeControl,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w'
  });
}

export async function handleRoomJoin(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) {
    return sendError('UNAUTHORIZED', 'Authentication required.');
  }

  const { roomCode, gameId } = payload;
  const identifier = roomCode || gameId;

  if (!identifier) {
    return sendError('INVALID_INPUT', 'Room code or Game ID is required.');
  }

  const user = clientState.user;
  let room = globalRoomManager.getRoomByCode(identifier) || globalRoomManager.getRoomById(identifier);

  if (!room) {
    const { findGameByRoomCode, findGameById } = await import('../../db/gameRepository.js');
    const dbGame = (await findGameByRoomCode(identifier)) || (await findGameById(identifier));
    if (dbGame) {
      room = globalRoomManager.rehydrateRoomFromDb(dbGame);
    }
  }

  if (!room) {
    const { isRedisConnected, getRedisClient } = await import('../../redis/redisClient.js');
    if (isRedisConnected()) {
      try {
        const client = getRedisClient();
        const raw = await client.get(`chess:game:meta:${identifier}`);
        if (raw) {
          const meta = JSON.parse(raw);
          room = globalRoomManager.rehydrateRoomFromDb(meta);
        }
      } catch {}
    }
  }

  if (!room) {
    return sendError('GAME_NOT_FOUND', 'Room not found.');
  }

  const result = globalRoomManager.joinRoom(room.roomCode, user);
  if (result.error) {
    return sendError(result.error, result.message);
  }

  // Update game status and player assignment authoritatively in TiDB
  import('../../db/gameRepository.js').then(({ updateGameStatus }) => {
    updateGameStatus(room.id, {
      whitePlayerId: room.whitePlayerId,
      blackPlayerId: room.blackPlayerId,
      status: room.status,
      startedAt: new Date()
    }).catch(err => console.warn('[RoomJoin] Error updating game status in DB:', err.message));
  }).catch(() => {});

  room.connectedSockets.set(user.id, socket);
  clientState.currentRoomId = room.id;

  // Subscribe to cross-instance game events via Pub/Sub
  Promise.all([
    import('../../pubsub/pubSubService.js'),
    import('../../redis/redisKeys.js')
  ]).then(([{ globalPubSubService }, { redisKeys }]) => {
    const gameChannel = redisKeys.pubsubGame(room.id);
    globalPubSubService.subscribe(gameChannel, (envelope) => {
      if (envelope) {
        const eventType = envelope.eventType || envelope.event;
        if (eventType === WS_EVENTS.MOVE_ACCEPTED && envelope.payload?.move) {
          const s = globalGameManager.getSession(room.id);
          if (s) {
            const moveColor = envelope.payload.move.color || (envelope.payload.turn === 'b' ? 'w' : 'b');
            if (s.game.getTurn() === moveColor) {
              s.game.move(envelope.payload.move.from, envelope.payload.move.to, envelope.payload.move.promotion || 'q');
              s.stateVersion = envelope.payload.stateVersion || (s.stateVersion + 1);
            }
          }
        }

        if (room.connectedSockets.has(user.id)) {
          try {
            socket.send(JSON.stringify({
              event: eventType,
              payload: envelope.payload,
              timestamp: envelope.timestamp || Date.now()
            }));
          } catch {}
        }
      }
    });
  }).catch(() => {});

  let session = null;
  if (room.status === 'ACTIVE' || room.status === 'READY') {
    session = globalGameManager.getSession(room.id);
    if (!session) {
      session = await globalGameManager.restoreSessionFromDb(room.id);
    }
    if (!session && room.status === 'ACTIVE') {
      session = globalGameManager.getOrCreateSession(room);
    }
    if (session && !session.clock.isRunning && room.status === 'ACTIVE') {
      session.start();
    }
  }

  const broadcastInit = (targetSocket) => {
    targetSocket.send(JSON.stringify({
      event: WS_EVENTS.GAME_INIT,
      payload: {
        gameId: room.id,
        roomCode: room.roomCode,
        status: room.status,
        whitePlayerId: room.whitePlayerId,
        blackPlayerId: room.blackPlayerId,
        timeControl: room.timeControl,
        fen: session ? session.game.getFen() : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: session ? session.game.getTurn() : 'w',
        moves: session ? session.game.getHistory() : [],
        clocks: session ? session.clock.getTimes() : null,
        stateVersion: session ? session.stateVersion : 1
      },
      timestamp: Date.now()
    }));
  };

  // Broadcast to all connected sockets in room
  room.connectedSockets.forEach((s) => {
    broadcastInit(s);
  });
}
