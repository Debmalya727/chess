import {
  WS_EVENTS,
  validateMoveSubmitPayload,
  validateRoomCreatePayload,
  validateRoomJoinPayload,
  validateDrawRespondPayload,
  validateRematchPayload,
  validateRematchRespondPayload,
  validateRematchCancelPayload
} from '@chess/protocol';
import { globalWsRateLimiter } from './rateLimiter.js';
import { handleAuthToken } from './handlers/auth.js';
import { handleRoomCreate, handleRoomJoin } from './handlers/room.js';
import { handleMoveSubmit } from './handlers/move.js';
import { handleDrawOffer, handleDrawRespond } from './handlers/draw.js';
import { handleGameResign } from './handlers/game.js';
import { handleQueueJoin, handleQueueLeave, handleQueueStatus } from './handlers/matchmaking.js';
import { handleTournamentJoin, handleTournamentLeave } from './handlers/tournament.js';
import { handleGameRematch, handleRematchRespond, handleRematchCancel } from './handlers/rematch.js';

const MAX_WS_PAYLOAD_BYTES = 64 * 1024; // 64 KB

export async function routeWsMessage(socket, rawMessage, clientState) {
  // 1. Payload Size Check
  if (typeof rawMessage === 'string' && rawMessage.length > MAX_WS_PAYLOAD_BYTES) {
    socket.send(JSON.stringify({
      event: WS_EVENTS.ERROR,
      payload: { code: 'PAYLOAD_TOO_LARGE', message: 'WebSocket message exceeds maximum size of 64KB.' }
    }));
    return;
  }

  // 2. Rate Limiter Check
  const allowed = await globalWsRateLimiter.isAllowed(socket, clientState);
  if (!allowed) {
    socket.send(JSON.stringify({
      event: WS_EVENTS.ERROR,
      payload: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please slow down.' }
    }));
    return;
  }

  let envelope;
  try {
    envelope = JSON.parse(rawMessage);
  } catch (err) {
    socket.send(JSON.stringify({
      event: WS_EVENTS.ERROR,
      payload: { code: 'INVALID_JSON', message: 'Payload must be valid JSON.' }
    }));
    return;
  }

  const event = envelope.event || envelope.type;
  const { payload = {}, requestId } = envelope;

  const sendResponse = (resEvent, resPayload) => {
    socket.send(JSON.stringify({
      event: resEvent,
      payload: resPayload,
      requestId,
      timestamp: Date.now()
    }));
  };

  const sendError = (code, message) => {
    sendResponse(WS_EVENTS.ERROR, { code, message });
  };

  console.log('[Router] Incoming WS event:', event);

  switch (event) {
    case 'ping':
      sendResponse('pong', {});
      break;

    case WS_EVENTS.AUTH_TOKEN:
      handleAuthToken(socket, payload, clientState, sendResponse, sendError);
      break;

    case WS_EVENTS.ROOM_CREATE: {
      const v = validateRoomCreatePayload(payload);
      if (!v.isValid) return sendError(v.error, v.message);
      handleRoomCreate(socket, v.sanitized, clientState, sendResponse, sendError);
      break;
    }

    case WS_EVENTS.ROOM_JOIN: {
      const v = validateRoomJoinPayload(payload);
      if (!v.isValid) return sendError(v.error, v.message);
      handleRoomJoin(socket, v.sanitized, clientState, sendResponse, sendError);
      break;
    }

    case WS_EVENTS.QUEUE_JOIN:
      handleQueueJoin(socket, payload, clientState, sendResponse, sendError);
      break;

    case WS_EVENTS.QUEUE_LEAVE:
      handleQueueLeave(socket, payload, clientState, sendResponse, sendError);
      break;

    case WS_EVENTS.QUEUE_STATUS:
      handleQueueStatus(socket, payload, clientState, sendResponse, sendError);
      break;

    case WS_EVENTS.MOVE_SUBMIT: {
      const v = validateMoveSubmitPayload(payload);
      if (!v.isValid) return sendError(v.error, v.message);
      Promise.resolve(handleMoveSubmit(socket, v.sanitized, clientState, sendResponse, sendError))
        .catch(err => sendError('INTERNAL_ERROR', err.message));
      break;
    }

    case WS_EVENTS.DRAW_OFFER:
      handleDrawOffer(socket, payload, clientState, sendResponse, sendError);
      break;

    case WS_EVENTS.DRAW_RESPOND: {
      const v = validateDrawRespondPayload(payload);
      if (!v.isValid) return sendError(v.error, v.message);
      handleDrawRespond(socket, v.sanitized, clientState, sendResponse, sendError);
      break;
    }

    case WS_EVENTS.GAME_RESIGN:
      handleGameResign(socket, payload, clientState, sendResponse, sendError);
      break;

    case WS_EVENTS.GAME_REMATCH: {
      const v = validateRematchPayload(payload);
      if (!v.isValid) return sendError(v.error, v.message);
      await handleGameRematch(socket, v.sanitized, clientState, sendResponse, sendError);
      break;
    }

    case WS_EVENTS.REMATCH_RESPOND: {
      const v = validateRematchRespondPayload(payload);
      if (!v.isValid) return sendError(v.error, v.message);
      await handleRematchRespond(socket, v.sanitized, clientState, sendResponse, sendError);
      break;
    }

    case WS_EVENTS.REMATCH_CANCEL: {
      const v = validateRematchCancelPayload(payload);
      if (!v.isValid) return sendError(v.error, v.message);
      await handleRematchCancel(socket, v.sanitized, clientState, sendResponse, sendError);
      break;
    }

    case WS_EVENTS.TOURNAMENT_JOIN:
      handleTournamentJoin(socket, payload, clientState, sendResponse, sendError);
      break;

    case WS_EVENTS.TOURNAMENT_LEAVE:
      handleTournamentLeave(socket, payload, clientState, sendResponse, sendError);
      break;

    default:
      sendError('UNKNOWN_EVENT', `Event '${event}' is not supported.`);
      break;
  }
}

