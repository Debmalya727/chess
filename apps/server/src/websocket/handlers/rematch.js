import { WS_EVENTS, ERROR_CODES } from '@chess/protocol';
import { globalRematchService } from '../../games/rematchService.js';

export async function handleGameRematch(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) {
    return sendError(ERROR_CODES.UNAUTHORIZED, 'Authentication required.');
  }

  const { gameId } = payload;
  if (!gameId || typeof gameId !== 'string') {
    return sendError('INVALID_INPUT', 'Valid gameId string is required.');
  }

  const res = await globalRematchService.requestRematch(clientState.user, gameId, socket);
  if (res.error) {
    return sendError(res.error, res.message);
  }

  sendResponse('game:rematch:confirm', {
    gameId,
    alreadyPending: res.alreadyPending || false,
    accepted: Boolean(res.newGameId),
    newGameId: res.newGameId || null
  });
}

export async function handleRematchRespond(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) {
    return sendError(ERROR_CODES.UNAUTHORIZED, 'Authentication required.');
  }

  const { gameId, accept } = payload;
  if (!gameId || typeof gameId !== 'string') {
    return sendError('INVALID_INPUT', 'Valid gameId string is required.');
  }
  if (typeof accept !== 'boolean') {
    return sendError('INVALID_INPUT', 'Accept must be a boolean.');
  }

  const res = await globalRematchService.respondRematch(clientState.user, gameId, accept, socket);
  if (res.error) {
    return sendError(res.error, res.message);
  }

  sendResponse('game:rematch:respond:confirm', {
    gameId,
    accept,
    newGameId: res.newGameId || null
  });
}

export async function handleRematchCancel(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) {
    return sendError(ERROR_CODES.UNAUTHORIZED, 'Authentication required.');
  }

  const { gameId } = payload;
  if (!gameId || typeof gameId !== 'string') {
    return sendError('INVALID_INPUT', 'Valid gameId string is required.');
  }

  const res = await globalRematchService.cancelRematch(clientState.user, gameId);
  if (res.error) {
    return sendError(res.error, res.message);
  }

  sendResponse('game:rematch:cancel:confirm', {
    gameId,
    cancelled: true
  });
}
