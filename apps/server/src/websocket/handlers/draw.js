import { WS_EVENTS } from '@chess/protocol';
import { globalRoomManager } from '../../rooms/roomManager.js';
import { globalGameManager } from '../../games/gameManager.js';

export function handleDrawOffer(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) return sendError('UNAUTHORIZED', 'Authentication required.');

  const { gameId } = payload;
  const room = globalRoomManager.getRoomById(gameId);
  const session = globalGameManager.getSession(gameId);
  if (!room || !session) return sendError('GAME_NOT_FOUND', 'Game not found.');

  const res = session.offerDraw(clientState.user);
  if (res.error) return sendError(res.error, res.message);

  // Broadcast draw offer to opponent
  room.connectedSockets.forEach((s, userId) => {
    if (userId !== clientState.user.id) {
      s.send(JSON.stringify({
        event: WS_EVENTS.DRAW_OFFERED,
        payload: { gameId, offeredBy: clientState.user.id },
        timestamp: Date.now()
      }));
    }
  });

  sendResponse('draw:offered:confirm', { gameId });
}

export function handleDrawRespond(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) return sendError('UNAUTHORIZED', 'Authentication required.');

  const { gameId, accept } = payload;
  const room = globalRoomManager.getRoomById(gameId);
  const session = globalGameManager.getSession(gameId);
  if (!room || !session) return sendError('GAME_NOT_FOUND', 'Game not found.');

  const res = session.respondDraw(clientState.user, accept);
  if (res.error) return sendError(res.error, res.message);

  if (res.accepted) {
    room.connectedSockets.forEach((s) => {
      s.send(JSON.stringify({
        event: WS_EVENTS.GAME_ENDED,
        payload: { gameId, result: '1/2-1/2', termination: 'DRAW_AGREEMENT', finalFen: session.game.getFen() },
        timestamp: Date.now()
      }));
    });
  } else {
    room.connectedSockets.forEach((s) => {
      s.send(JSON.stringify({
        event: 'draw:declined',
        payload: { gameId },
        timestamp: Date.now()
      }));
    });
  }
}
