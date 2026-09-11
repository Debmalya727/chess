/**
 * Centralized Redis Key Namespaces for Chess Platform Phase 7.
 * Prevents key collision and scatters across codebase.
 */
export const redisKeys = {
  // Matchmaking
  matchmakingQueue(ratingType, timeControl) {
    return `chess:matchmaking:queue:${ratingType}:${timeControl}`;
  },
  matchmakingPlayer(userId) {
    return `chess:matchmaking:player:${userId}`;
  },
  matchmakingClaim(playerId) {
    return `chess:matchmaking:claim:${playerId}`;
  },
  matchmakingAllPlayers() {
    return `chess:matchmaking:all_players`;
  },

  // Presence
  presenceUser(userId) {
    return `chess:presence:user:${userId}`;
  },
  presenceSocket(socketId) {
    return `chess:presence:socket:${socketId}`;
  },
  presencePlaying(userId) {
    return `chess:presence:playing:${userId}`;
  },
  presenceAllUsers() {
    return `chess:presence:users`;
  },

  // Rate Limiting
  rateLimit(scope, identifier) {
    return `chess:rate:${scope}:${identifier}`;
  },

  // Distributed Locks
  gameLock(gameId) {
    return `chess:game:lock:${gameId}`;
  },
  gameMeta(id) {
    return `chess:game:meta:${id}`;
  },
  gameMoves(gameId) {
    return `chess:game:moves:${gameId}`;
  },
  challengeLock(challengeId) {
    return `chess:challenge:lock:${challengeId}`;
  },
  tournamentLock(tournamentId) {
    return `chess:tournament:lock:${tournamentId}`;
  },
  gameClientMove(gameId, clientMoveId) {
    return `chess:game:client_move:${gameId}:${clientMoveId}`;
  },

  // Pub/Sub Channels
  pubsubGame(gameId) {
    return `chess:pubsub:game:${gameId}`;
  },
  pubsubUser(userId) {
    return `chess:pubsub:user:${userId}`;
  },
  pubsubTournament(tournamentId) {
    return `chess:pubsub:tournament:${tournamentId}`;
  },
  pubsubPresence() {
    return `chess:pubsub:presence`;
  }
};
