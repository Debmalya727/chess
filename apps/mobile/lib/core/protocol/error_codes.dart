/// Standard server error codes.
/// Directly mirrors packages/protocol/src/events.js
abstract class ErrorCodes {
  static const String notYourTurn = 'NOT_YOUR_TURN';
  static const String invalidMove = 'INVALID_MOVE';
  static const String gameNotFound = 'GAME_NOT_FOUND';
  static const String gameFinished = 'GAME_FINISHED';
  static const String roomFull = 'ROOM_FULL';
  static const String unauthorized = 'UNAUTHORIZED';
  static const String forbidden = 'FORBIDDEN';
  static const String expiredTime = 'EXPIRED_TIME';
  static const String alreadyInQueue = 'ALREADY_IN_QUEUE';
  static const String alreadyInMatchmakingQueue = 'ALREADY_IN_MATCHMAKING_QUEUE';
  static const String playerAlreadyInGame = 'PLAYER_ALREADY_IN_GAME';
  static const String invalidRatingType = 'INVALID_RATING_TYPE';
  static const String tournamentNotFound = 'TOURNAMENT_NOT_FOUND';
  static const String tournamentFinished = 'TOURNAMENT_FINISHED';
  static const String tournamentFull = 'TOURNAMENT_FULL';
  static const String alreadyRegistered = 'ALREADY_REGISTERED';
  static const String notInQueue = 'NOT_IN_QUEUE';
  static const String staleState = 'STALE_STATE';
  static const String rateLimited = 'RATE_LIMITED';

  // Social & Challenges
  static const String cannotFriendSelf = 'CANNOT_FRIEND_SELF';
  static const String alreadyFriends = 'ALREADY_FRIENDS';
  static const String friendRequestPending = 'FRIEND_REQUEST_PENDING';
  static const String friendRequestNotFound = 'FRIEND_REQUEST_NOT_FOUND';
  static const String userBlocked = 'USER_BLOCKED';
  static const String cannotBlockSelf = 'CANNOT_BLOCK_SELF';
  static const String cannotChallengeSelf = 'CANNOT_CHALLENGE_SELF';
  static const String challengeNotFound = 'CHALLENGE_NOT_FOUND';
  static const String challengeExpired = 'CHALLENGE_EXPIRED';
  static const String challengeAlreadyResolved = 'CHALLENGE_ALREADY_RESOLVED';

  // Tournaments
  static const String notRegistered = 'NOT_REGISTERED';
  static const String tournamentAlreadyStarted = 'TOURNAMENT_ALREADY_STARTED';
  static const String tournamentNotRunning = 'TOURNAMENT_NOT_RUNNING';
  static const String invalidTournamentState = 'INVALID_TOURNAMENT_STATE';
  static const String insufficientPlayers = 'INSUFFICIENT_PLAYERS';
  static const String roundInProgress = 'ROUND_IN_PROGRESS';
  static const String pairingError = 'PAIRING_ERROR';

  // Rematch
  static const String gameNotFinished = 'GAME_NOT_FINISHED';
  static const String tournamentRematchNotAllowed = 'TOURNAMENT_REMATCH_NOT_ALLOWED';
  static const String rematchAlreadyPending = 'REMATCH_ALREADY_PENDING';
  static const String rematchAlreadyResolved = 'REMATCH_ALREADY_RESOLVED';
  static const String rematchNotFound = 'REMATCH_NOT_FOUND';
  static const String rematchExpired = 'REMATCH_EXPIRED';
}
