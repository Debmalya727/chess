import { WS_EVENTS } from '@chess/protocol';
import { globalRoomManager } from '../../rooms/roomManager.js';
import { globalGameManager } from '../../games/gameManager.js';

export function handleGameResign(socket, payload, clientState, sendResponse, sendError) {
  if (!clientState.isAuthenticated || !clientState.user) return sendError('UNAUTHORIZED', 'Authentication required.');

  const { gameId } = payload;
  const room = globalRoomManager.getRoomById(gameId);
  const session = globalGameManager.getSession(gameId);
  if (!room || !session) return sendError('GAME_NOT_FOUND', 'Game not found.');

  const res = session.resign(clientState.user);
  if (res.error) return sendError(res.error, res.message);

  room.connectedSockets.forEach((s) => {
    s.send(JSON.stringify({
      event: WS_EVENTS.GAME_ENDED,
      payload: {
        gameId,
        result: res.result,
        termination: res.termination,
        finalFen: session.game.getFen()
      },
      timestamp: Date.now()
    }));
  });
}
