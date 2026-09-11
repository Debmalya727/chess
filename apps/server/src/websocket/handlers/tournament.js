import { WS_EVENTS } from '@chess/protocol';
import { globalPubSubService } from '../../pubsub/pubSubService.js';
import { redisKeys } from '../../redis/redisKeys.js';

// Map of socket -> Map<tournamentId, handler>
const socketTournamentSubscriptions = new Map();

export async function handleTournamentJoin(socket, payload, clientState, sendResponse, sendError) {
  const tournamentId = payload?.tournamentId;
  if (!tournamentId) {
    return sendError('INVALID_PAYLOAD', 'tournamentId is required');
  }

  const channel = redisKeys.pubsubTournament(tournamentId);

  if (!socketTournamentSubscriptions.has(socket)) {
    socketTournamentSubscriptions.set(socket, new Map());
  }

  const subs = socketTournamentSubscriptions.get(socket);
  if (subs.has(tournamentId)) {
    return sendResponse('tournament:joined', { tournamentId });
  }

  const handler = (envelope) => {
    try {
      socket.send(JSON.stringify({
        event: envelope.eventType || envelope.event,
        payload: envelope.payload,
        timestamp: envelope.timestamp || Date.now()
      }));
    } catch (_) {}
  };

  subs.set(tournamentId, handler);
  await globalPubSubService.subscribe(channel, handler);

  sendResponse('tournament:joined', { tournamentId });
}

export async function handleTournamentLeave(socket, payload, clientState, sendResponse, sendError) {
  const tournamentId = payload?.tournamentId;
  if (!tournamentId) return;

  const subs = socketTournamentSubscriptions.get(socket);
  if (subs && subs.has(tournamentId)) {
    const handler = subs.get(tournamentId);
    const channel = redisKeys.pubsubTournament(tournamentId);
    await globalPubSubService.unsubscribe(channel, handler);
    subs.delete(tournamentId);
  }

  sendResponse('tournament:left', { tournamentId });
}

export function cleanupSocketTournamentSubs(socket) {
  const subs = socketTournamentSubscriptions.get(socket);
  if (subs) {
    for (const [tournamentId, handler] of subs.entries()) {
      const channel = redisKeys.pubsubTournament(tournamentId);
      globalPubSubService.unsubscribe(channel, handler).catch(() => {});
    }
    socketTournamentSubscriptions.delete(socket);
  }
}
