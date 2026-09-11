import { WS_EVENTS, validateQueueJoinPayload } from '@chess/protocol';
import { globalMatchmakingService } from '../../matchmaking/matchmakingService.js';

export async function handleQueueJoin(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) {
    return sendError('UNAUTHORIZED', 'Authentication required to join matchmaking.');
  }

  const v = validateQueueJoinPayload(payload);
  if (!v.isValid) {
    return sendError(v.error, v.message);
  }

  const result = await globalMatchmakingService.joinQueue({
    user: clientState.user,
    socket,
    timeControl: v.sanitized.timeControl
  });

  if (result.error) {
    return sendError(result.error, result.message);
  }

  if (result.queued) {
    sendResponse(WS_EVENTS.QUEUE_STATUS, {
      inQueue: true,
      timeControl: v.sanitized.timeControl,
      rating: result.rating,
      ratingType: result.ratingType
    });
  }
}

export async function handleQueueLeave(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) {
    return sendError('UNAUTHORIZED', 'Authentication required.');
  }

  const result = await globalMatchmakingService.leaveQueue(clientState.user.id);
  if (result.error) {
    return sendError(result.error, result.message);
  }

  sendResponse(WS_EVENTS.QUEUE_STATUS, { inQueue: false });
}

export async function handleQueueStatus(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) {
    return sendError('UNAUTHORIZED', 'Authentication required.');
  }

  const status = await globalMatchmakingService.getQueueStatus(clientState.user.id);
  sendResponse(WS_EVENTS.QUEUE_STATUS, status);
}
