import { WS_EVENTS } from '@chess/protocol';
import { globalRoomManager } from '../../rooms/roomManager.js';
import { globalGameManager } from '../../games/gameManager.js';
import { withLock } from '../../redis/redisLock.js';
import { redisKeys } from '../../redis/redisKeys.js';
import { globalPubSubService } from '../../pubsub/pubSubService.js';

export async function handleMoveSubmit(socket, payload, clientState, sendResponse, sendError) {
  console.log('[MoveHandler] Received move submit:', payload?.from, '->', payload?.to, 'for game:', payload?.gameId, 'auth:', clientState?.isAuthenticated);
  if (!clientState.isAuthenticated || !clientState.user) {
    return sendError('UNAUTHORIZED', 'Authentication required.');
  }

  const gameId = payload.gameId || payload.roomCode;
  const from = payload.from || payload.orig;
  const to = payload.to || payload.dest;
  const { promotion, clientMoveId, expectedStateVersion } = payload;

  if (!gameId || !from || !to) {
    return sendError('INVALID_INPUT', 'Game ID, from, and to squares are required.');
  }

  let room = globalRoomManager.getRoomById(gameId);
  if (!room) {
    room = globalRoomManager.getRoomByCode(gameId);
  }
  if (!room) {
    return sendError('GAME_NOT_FOUND', 'Game room not found.');
  }

  const session = globalGameManager.getSession(room.id);
  if (!session) {
    return sendError('GAME_NOT_FOUND', 'Active game session not found.');
  }

  const user = clientState.user;

  // 0. Distributed Idempotency Check (Cross-instance Fastify A & Fastify B)
  if (clientMoveId) {
    if (session.processedClientMoveIds.has(clientMoveId)) {
      const cached = session.processedClientMoveIds.get(clientMoveId);
      return sendResponse(WS_EVENTS.MOVE_ACCEPTED, {
        gameId: room.id,
        roomCode: room.roomCode,
        clientMoveId,
        san: cached.moveResult ? cached.moveResult.san : undefined,
        stateVersion: cached.stateVersion,
        move: cached.moveResult,
        fen: cached.fen,
        turn: cached.status ? cached.status.turn : undefined,
        moves: cached.history,
        clocks: cached.clockState,
        isEnded: cached.isEnded,
        gameResult: cached.result,
        termination: cached.termination,
        isDuplicate: true
      });
    }

    const { isRedisConnected, getRedisClient } = await import('../../redis/redisClient.js');
    if (isRedisConnected()) {
      try {
        const client = getRedisClient();
        const raw = await client.get(redisKeys.gameClientMove(room.id, clientMoveId));
        if (raw) {
          const cached = JSON.parse(raw);
          return sendResponse(WS_EVENTS.MOVE_ACCEPTED, { ...cached, isDuplicate: true });
        }
      } catch {}
    }
  }

  const lockKey = redisKeys.gameLock(room.id);
  console.log('[MoveHandler] 1. Acquiring lock for', lockKey);
  let result;
  try {
    // 1. Distributed Concurrency Protection
    result = await withLock(lockKey, 3000, async () => {
      console.log('[MoveHandler] 2. Lock acquired, calling processMove');
      // 2. Validate chess move & persist to TiDB transaction
      return await session.processMove({
        user,
        from,
        to,
        promotion,
        clientMoveId,
        expectedStateVersion
      });
    });
    console.log('[MoveHandler] 3. Lock released, result:', result?.error || 'SUCCESS');
  } catch (err) {
    if (err.code === 'LOCK_TIMEOUT') {
      return sendResponse(WS_EVENTS.MOVE_REJECTED, {
        gameId: room.id,
        clientMoveId,
        code: 'CONCURRENT_CONFLICT',
        reason: 'A concurrent move is currently being processed. Please retry.'
      });
    }
    console.error('[MoveHandler] Database or engine error during move:', err);
    return sendResponse(WS_EVENTS.MOVE_REJECTED, {
      gameId: room.id,
      clientMoveId,
      code: 'DATABASE_ERROR',
      reason: 'Failed to persist move authoritatively: ' + err.message
    });
  }

  // If rejected by chess logic / turn check / status check
  if (result.error) {
    sendResponse(WS_EVENTS.MOVE_REJECTED, {
      gameId: room.id,
      clientMoveId,
      code: result.error,
      reason: result.message
    });
    return;
  }

  const broadcastPayload = {
    gameId: room.id,
    roomCode: room.roomCode,
    clientMoveId,
    san: result.moveResult ? result.moveResult.san : undefined,
    stateVersion: session.stateVersion,
    move: result.moveResult,
    fen: result.fen,
    turn: result.status.turn,
    moves: result.history,
    clocks: result.clockState,
    isEnded: result.isEnded,
    gameResult: result.result,
    termination: result.termination
  };

  // Cache clientMoveId in Redis for distributed cross-instance idempotency
  if (clientMoveId) {
    import('../../redis/redisClient.js').then(({ isRedisConnected, getRedisClient }) => {
      if (isRedisConnected()) {
        const client = getRedisClient();
        client.set(redisKeys.gameClientMove(room.id, clientMoveId), JSON.stringify(broadcastPayload), 'EX', 7200).catch(() => {});
      }
    }).catch(() => {});
  }

  // 3. Publish over Redis Pub/Sub AFTER successful persistence
  try {
    await globalPubSubService.publishGameEvent(room.id, WS_EVENTS.MOVE_ACCEPTED, broadcastPayload);
    if (result.isEnded) {
      await globalPubSubService.publishGameEvent(room.id, WS_EVENTS.GAME_ENDED, {
        gameId: room.id,
        roomCode: room.roomCode,
        result: result.result,
        termination: result.termination,
        finalFen: result.fen
      });
    }
  } catch (pubErr) {
    // Non-fatal for persistence: move is already committed in TiDB
    console.warn('[MoveHandler] Warning: Pub/Sub broadcast failed after successful DB persistence:', pubErr.message);
  }

  // 4. Broadcast authoritative state to all players connected to room locally
  console.log('[MoveHandler] 4. Broadcasting to sockets, count:', room.connectedSockets.size, 'keys:', Array.from(room.connectedSockets.keys()));
  room.connectedSockets.forEach((s, uid) => {
    try {
      console.log('[MoveHandler] Sending move:accepted to user:', uid);
      s.send(JSON.stringify({
        event: WS_EVENTS.MOVE_ACCEPTED,
        payload: broadcastPayload,
        timestamp: Date.now()
      }));

      if (result.isEnded) {
        s.send(JSON.stringify({
          event: WS_EVENTS.GAME_ENDED,
          payload: {
            gameId: room.id,
            roomCode: room.roomCode,
            result: result.result,
            termination: result.termination,
            finalFen: result.fen
          },
          timestamp: Date.now()
        }));
      }
    } catch {}
  });
}
