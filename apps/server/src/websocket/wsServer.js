import crypto from 'crypto';
import fastifyWebsocket from '@fastify/websocket';
import { routeWsMessage } from './router.js';
import { globalRoomManager } from '../rooms/roomManager.js';
import { globalGameManager } from '../games/gameManager.js';
import { WS_EVENTS } from '@chess/protocol';

export async function setupWebSocketServer(fastify) {
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 64 * 1024 // 64 KB maximum WebSocket frame size
    }
  });

  fastify.get('/ws', { websocket: true }, (connection, req) => {
    const socket = connection.socket;
    socket.id = crypto.randomUUID();
    const clientState = {
      isAuthenticated: false,
      user: null,
      currentRoomId: null,
      authTimeout: null
    };

    // Unauthenticated connection timeout: Disconnect if client does not authenticate within 60 seconds
    clientState.authTimeout = setTimeout(() => {
      if (!clientState.isAuthenticated) {
        socket.close(4401, 'Authentication timeout');
      }
    }, 60000);
    if (clientState.authTimeout.unref) clientState.authTimeout.unref();

    socket.on('message', (raw) => {
      routeWsMessage(socket, raw.toString(), clientState);
    });

    socket.on('close', (code, reason) => {
      if (clientState.authTimeout) clearTimeout(clientState.authTimeout);
      console.log('[WSServer] Socket closed for user:', clientState?.user?.id, 'code:', code, 'reason:', reason?.toString());
      import('./handlers/tournament.js').then(({ cleanupSocketTournamentSubs }) => {
        cleanupSocketTournamentSubs(socket);
      }).catch(() => {});
      if (clientState.user) {
        import('../presence/presenceService.js').then(({ globalPresenceService }) => {
          globalPresenceService.handleUserDisconnected(clientState.user.id, socket.id);
        }).catch(() => {});
      }

      if (clientState.currentRoomId && clientState.user) {
        const room = globalRoomManager.getRoomById(clientState.currentRoomId);
        if (room) {
          room.connectedSockets.delete(clientState.user.id);
          // Broadcast disconnect presence
          room.connectedSockets.forEach((s) => {
            s.send(JSON.stringify({
              event: WS_EVENTS.PLAYER_PRESENCE,
              payload: { playerId: clientState.user.id, status: 'disconnected' },
              timestamp: Date.now()
            }));
          });
        }
      }
    });
  });

  // Periodic clock broadcast & timeout checker every 1 second for active games
  const clockInterval = setInterval(() => {
    for (const [roomId, room] of globalRoomManager.roomsById.entries()) {
      if (room.status === 'ACTIVE' && room.connectedSockets.size > 0) {
        const session = globalGameManager.getSession(roomId);
        if (session && !session.isEnded && session.clock.isRunning) {
          const clockState = session.clock.getTimes();
          const tickPayload = JSON.stringify({
            event: WS_EVENTS.CLOCK_TICK,
            payload: {
              gameId: roomId,
              whiteTimeRemaining: clockState.whiteRemainingMs,
              blackTimeRemaining: clockState.blackRemainingMs,
              activeColor: clockState.activeColor,
              serverTime: Date.now()
            },
            timestamp: Date.now()
          });

          room.connectedSockets.forEach(s => s.send(tickPayload));

          if (clockState.isTimeout) {
            const result = clockState.timeoutColor === 'w' ? '0-1' : '1-0';
            session._endGame(result, 'TIMEOUT');

            const endPayload = JSON.stringify({
              event: WS_EVENTS.GAME_ENDED,
              payload: {
                gameId: roomId,
                result,
                termination: 'TIMEOUT',
                finalFen: session.game.getFen()
              },
              timestamp: Date.now()
            });

            room.connectedSockets.forEach(s => s.send(endPayload));
          }
        }
      }
    }
  }, 1000);
  if (clockInterval.unref) clockInterval.unref();
}
