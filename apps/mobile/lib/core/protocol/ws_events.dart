/// Authoritative WebSocket event definitions.
/// Directly mirrors packages/protocol/src/events.js
abstract class WsEvents {
  // Client -> Server
  static const String authToken = 'auth:token';
  static const String roomCreate = 'room:create';
  static const String roomJoin = 'room:join';
  static const String queueJoin = 'queue:join';
  static const String queueLeave = 'queue:leave';
  static const String moveSubmit = 'move:submit';
  static const String drawOffer = 'draw:offer';
  static const String drawRespond = 'draw:respond';
  static const String gameResign = 'game:resign';
  static const String gameRematch = 'game:rematch';
  static const String ping = 'ping';

  // Server -> Client
  static const String authSuccess = 'auth:success';
  static const String gameInit = 'game:init';
  static const String moveAccepted = 'move:accepted';
  static const String moveRejected = 'move:rejected';
  static const String clockTick = 'clock:tick';
  static const String gameEnded = 'game:ended';
  static const String drawOffered = 'draw:offered';
  static const String playerPresence = 'player:presence';
  static const String queueStatus = 'queue:status';
  static const String queueMatched = 'queue:matched';
  static const String error = 'error';
  static const String pong = 'pong';

  // Social & Presence
  static const String presenceUpdated = 'presence:updated';
  static const String friendRequestReceived = 'friend:request_received';
  static const String friendRequestAccepted = 'friend:request_accepted';
  static const String challengeReceived = 'challenge:received';
  static const String challengeAccepted = 'challenge:accepted';
  static const String challengeDeclined = 'challenge:declined';
  static const String challengeExpired = 'challenge:expired';
  static const String challengeCancelled = 'challenge:cancelled';

  // Tournaments
  static const String tournamentJoin = 'tournament:join';
  static const String tournamentLeave = 'tournament:leave';
  static const String tournamentUpdated = 'tournament:updated';
  static const String tournamentStarted = 'tournament:started';
  static const String tournamentRoundStarted = 'tournament:round_started';
  static const String tournamentPairingCreated = 'tournament:pairing_created';
  static const String tournamentGameStarted = 'tournament:game_started';
  static const String tournamentStandingsUpdated = 'tournament:standings_updated';
  static const String tournamentRoundCompleted = 'tournament:round_completed';
  static const String tournamentFinished = 'tournament:finished';
  static const String tournamentCancelled = 'tournament:cancelled';
}
