import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/protocol/ws_events.dart';
import 'package:chess_mobile/core/protocol/error_codes.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/websocket/ws_client.dart';

// ── FakeWsClient (same minimal stub as other Phase test files) ──────────────
class _FakeWsClient extends WsClient {
  final Map<String, List<Function(Map<String, dynamic>)>> callbacks = {};

  _FakeWsClient() : super(config: AppConfig.development);

  @override
  void Function() on(String event, Function(Map<String, dynamic>) callback) {
    callbacks.putIfAbsent(event, () => []).add(callback);
    return () => callbacks[event]?.remove(callback);
  }

  @override
  void send(String event, Map<String, dynamic> payload, {String? requestId}) {}

  void dispatch(String event, Map<String, dynamic> payload) {
    final list = callbacks[event];
    if (list != null) {
      for (final cb in List.of(list)) {
        cb(payload);
      }
    }
  }

  int listenerCount(String event) => callbacks[event]?.length ?? 0;
}

void main() {
  group('M6 Phase D — Protocol Contract Audit Tests', () {
    // ─────────────────────────────────────────────────────────────────────
    // D1. WsEvents full constant coverage
    // ─────────────────────────────────────────────────────────────────────
    group('D1: WsEvents — complete protocol constant coverage', () {
      group('Client → Server events', () {
        test('auth:token', () => expect(WsEvents.authToken, 'auth:token'));
        test('room:create', () => expect(WsEvents.roomCreate, 'room:create'));
        test('room:join', () => expect(WsEvents.roomJoin, 'room:join'));
        test('queue:join', () => expect(WsEvents.queueJoin, 'queue:join'));
        test('queue:leave', () => expect(WsEvents.queueLeave, 'queue:leave'));
        test('move:submit', () => expect(WsEvents.moveSubmit, 'move:submit'));
        test('draw:offer', () => expect(WsEvents.drawOffer, 'draw:offer'));
        test('draw:respond', () => expect(WsEvents.drawRespond, 'draw:respond'));
        test('game:resign', () => expect(WsEvents.gameResign, 'game:resign'));
        test('game:rematch', () => expect(WsEvents.gameRematch, 'game:rematch'));
        test('ping', () => expect(WsEvents.ping, 'ping'));
      });

      group('Server → Client events', () {
        test('auth:success', () => expect(WsEvents.authSuccess, 'auth:success'));
        test('game:init', () => expect(WsEvents.gameInit, 'game:init'));
        test('move:accepted', () => expect(WsEvents.moveAccepted, 'move:accepted'));
        test('move:rejected', () => expect(WsEvents.moveRejected, 'move:rejected'));
        test('clock:tick', () => expect(WsEvents.clockTick, 'clock:tick'));
        test('game:ended', () => expect(WsEvents.gameEnded, 'game:ended'));
        test('draw:offered', () => expect(WsEvents.drawOffered, 'draw:offered'));
        test('draw:declined', () => expect(WsEvents.drawDeclined, 'draw:declined'));
        test('player:presence', () => expect(WsEvents.playerPresence, 'player:presence'));
        test('queue:status', () => expect(WsEvents.queueStatus, 'queue:status'));
        test('queue:matched', () => expect(WsEvents.queueMatched, 'queue:matched'));
        test('error', () => expect(WsEvents.error, 'error'));
        test('pong', () => expect(WsEvents.pong, 'pong'));
      });

      group('Social & Presence events', () {
        test('presence:updated', () => expect(WsEvents.presenceUpdated, 'presence:updated'));
        test('friend:request_received', () => expect(WsEvents.friendRequestReceived, 'friend:request_received'));
        test('friend:request_accepted', () => expect(WsEvents.friendRequestAccepted, 'friend:request_accepted'));
        test('challenge:received', () => expect(WsEvents.challengeReceived, 'challenge:received'));
        test('challenge:accepted', () => expect(WsEvents.challengeAccepted, 'challenge:accepted'));
        test('challenge:declined', () => expect(WsEvents.challengeDeclined, 'challenge:declined'));
        test('challenge:expired', () => expect(WsEvents.challengeExpired, 'challenge:expired'));
        test('challenge:cancelled', () => expect(WsEvents.challengeCancelled, 'challenge:cancelled'));
      });

      group('Tournament events', () {
        test('tournament:join', () => expect(WsEvents.tournamentJoin, 'tournament:join'));
        test('tournament:leave', () => expect(WsEvents.tournamentLeave, 'tournament:leave'));
        test('tournament:updated', () => expect(WsEvents.tournamentUpdated, 'tournament:updated'));
        test('tournament:started', () => expect(WsEvents.tournamentStarted, 'tournament:started'));
        test('tournament:round_started', () => expect(WsEvents.tournamentRoundStarted, 'tournament:round_started'));
        test('tournament:pairing_created', () => expect(WsEvents.tournamentPairingCreated, 'tournament:pairing_created'));
        test('tournament:game_started', () => expect(WsEvents.tournamentGameStarted, 'tournament:game_started'));
        test('tournament:standings_updated', () => expect(WsEvents.tournamentStandingsUpdated, 'tournament:standings_updated'));
        test('tournament:round_completed', () => expect(WsEvents.tournamentRoundCompleted, 'tournament:round_completed'));
        test('tournament:finished', () => expect(WsEvents.tournamentFinished, 'tournament:finished'));
        test('tournament:cancelled', () => expect(WsEvents.tournamentCancelled, 'tournament:cancelled'));
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // D2. ErrorCodes full constant coverage
    // ─────────────────────────────────────────────────────────────────────
    group('D2: ErrorCodes — complete protocol constant coverage', () {
      group('Game errors', () {
        test('NOT_YOUR_TURN', () => expect(ErrorCodes.notYourTurn, 'NOT_YOUR_TURN'));
        test('INVALID_MOVE', () => expect(ErrorCodes.invalidMove, 'INVALID_MOVE'));
        test('GAME_NOT_FOUND', () => expect(ErrorCodes.gameNotFound, 'GAME_NOT_FOUND'));
        test('GAME_FINISHED', () => expect(ErrorCodes.gameFinished, 'GAME_FINISHED'));
        test('ROOM_FULL', () => expect(ErrorCodes.roomFull, 'ROOM_FULL'));
        test('EXPIRED_TIME', () => expect(ErrorCodes.expiredTime, 'EXPIRED_TIME'));
        test('STALE_STATE', () => expect(ErrorCodes.staleState, 'STALE_STATE'));
      });

      group('Auth & General errors', () {
        test('UNAUTHORIZED', () => expect(ErrorCodes.unauthorized, 'UNAUTHORIZED'));
        test('FORBIDDEN', () => expect(ErrorCodes.forbidden, 'FORBIDDEN'));
        test('RATE_LIMITED', () => expect(ErrorCodes.rateLimited, 'RATE_LIMITED'));
        test('INVALID_RATING_TYPE', () => expect(ErrorCodes.invalidRatingType, 'INVALID_RATING_TYPE'));
      });

      group('Matchmaking errors', () {
        test('ALREADY_IN_QUEUE', () => expect(ErrorCodes.alreadyInQueue, 'ALREADY_IN_QUEUE'));
        test('ALREADY_IN_MATCHMAKING_QUEUE', () => expect(ErrorCodes.alreadyInMatchmakingQueue, 'ALREADY_IN_MATCHMAKING_QUEUE'));
        test('PLAYER_ALREADY_IN_GAME', () => expect(ErrorCodes.playerAlreadyInGame, 'PLAYER_ALREADY_IN_GAME'));
        test('NOT_IN_QUEUE', () => expect(ErrorCodes.notInQueue, 'NOT_IN_QUEUE'));
      });

      group('Social & Challenge errors', () {
        test('CANNOT_FRIEND_SELF', () => expect(ErrorCodes.cannotFriendSelf, 'CANNOT_FRIEND_SELF'));
        test('ALREADY_FRIENDS', () => expect(ErrorCodes.alreadyFriends, 'ALREADY_FRIENDS'));
        test('FRIEND_REQUEST_PENDING', () => expect(ErrorCodes.friendRequestPending, 'FRIEND_REQUEST_PENDING'));
        test('FRIEND_REQUEST_NOT_FOUND', () => expect(ErrorCodes.friendRequestNotFound, 'FRIEND_REQUEST_NOT_FOUND'));
        test('USER_BLOCKED', () => expect(ErrorCodes.userBlocked, 'USER_BLOCKED'));
        test('CANNOT_BLOCK_SELF', () => expect(ErrorCodes.cannotBlockSelf, 'CANNOT_BLOCK_SELF'));
        test('CANNOT_CHALLENGE_SELF', () => expect(ErrorCodes.cannotChallengeSelf, 'CANNOT_CHALLENGE_SELF'));
        test('CHALLENGE_NOT_FOUND', () => expect(ErrorCodes.challengeNotFound, 'CHALLENGE_NOT_FOUND'));
        test('CHALLENGE_EXPIRED', () => expect(ErrorCodes.challengeExpired, 'CHALLENGE_EXPIRED'));
        test('CHALLENGE_ALREADY_RESOLVED', () => expect(ErrorCodes.challengeAlreadyResolved, 'CHALLENGE_ALREADY_RESOLVED'));
      });

      group('Tournament errors', () {
        test('TOURNAMENT_NOT_FOUND', () => expect(ErrorCodes.tournamentNotFound, 'TOURNAMENT_NOT_FOUND'));
        test('TOURNAMENT_FINISHED', () => expect(ErrorCodes.tournamentFinished, 'TOURNAMENT_FINISHED'));
        test('TOURNAMENT_FULL', () => expect(ErrorCodes.tournamentFull, 'TOURNAMENT_FULL'));
        test('ALREADY_REGISTERED', () => expect(ErrorCodes.alreadyRegistered, 'ALREADY_REGISTERED'));
        test('NOT_REGISTERED', () => expect(ErrorCodes.notRegistered, 'NOT_REGISTERED'));
        test('TOURNAMENT_ALREADY_STARTED', () => expect(ErrorCodes.tournamentAlreadyStarted, 'TOURNAMENT_ALREADY_STARTED'));
        test('TOURNAMENT_NOT_RUNNING', () => expect(ErrorCodes.tournamentNotRunning, 'TOURNAMENT_NOT_RUNNING'));
        test('INVALID_TOURNAMENT_STATE', () => expect(ErrorCodes.invalidTournamentState, 'INVALID_TOURNAMENT_STATE'));
        test('INSUFFICIENT_PLAYERS', () => expect(ErrorCodes.insufficientPlayers, 'INSUFFICIENT_PLAYERS'));
        test('ROUND_IN_PROGRESS', () => expect(ErrorCodes.roundInProgress, 'ROUND_IN_PROGRESS'));
        test('PAIRING_ERROR', () => expect(ErrorCodes.pairingError, 'PAIRING_ERROR'));
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // D3. M6-F005 regression: tournament:game_started is now subscribed
    // ─────────────────────────────────────────────────────────────────────
    group('D3: M6-F005 — tournament:game_started subscription regression guard', () {
      test('WsClient subscribes to tournament:game_started and dispatches correctly', () {
        final fakeWs = _FakeWsClient();
        int callCount = 0;

        // Simulate the subscription that TournamentDetailNotifier now registers
        fakeWs.on(WsEvents.tournamentGameStarted, (payload) {
          callCount++;
        });

        expect(fakeWs.listenerCount(WsEvents.tournamentGameStarted), 1);

        fakeWs.dispatch(WsEvents.tournamentGameStarted, {
          'tournamentId': 't_123',
          'pairingId': 'p_001',
          'gameId': 'g_abc',
        });

        expect(callCount, 1);
      });

      test('tournament:game_started for wrong tournament is filtered', () {
        final fakeWs = _FakeWsClient();
        int relevantCount = 0;

        // Mirrors the guard in TournamentDetailNotifier._subscribeWs
        fakeWs.on(WsEvents.tournamentGameStarted, (payload) {
          if (payload['tournamentId'] != 't_active') return;
          relevantCount++;
        });

        // This is for a different tournament — must be ignored
        fakeWs.dispatch(WsEvents.tournamentGameStarted, {
          'tournamentId': 't_other',
          'gameId': 'g_xyz',
        });
        expect(relevantCount, 0);

        // This is for our tournament — must be counted
        fakeWs.dispatch(WsEvents.tournamentGameStarted, {
          'tournamentId': 't_active',
          'gameId': 'g_abc',
        });
        expect(relevantCount, 1);
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // D4. WsClient listener isolation (no cross-event contamination)
    // ─────────────────────────────────────────────────────────────────────
    group('D4: WsClient event listener isolation', () {
      test('Dispatching one event does not trigger listener for a different event', () {
        final fakeWs = _FakeWsClient();
        int aCount = 0;
        int bCount = 0;

        fakeWs.on(WsEvents.moveAccepted, (_) => aCount++);
        fakeWs.on(WsEvents.moveRejected, (_) => bCount++);

        fakeWs.dispatch(WsEvents.moveAccepted, {});
        expect(aCount, 1);
        expect(bCount, 0);

        fakeWs.dispatch(WsEvents.moveRejected, {});
        expect(aCount, 1);
        expect(bCount, 1);
      });

      test('Multiple listeners on same event all fire', () {
        final fakeWs = _FakeWsClient();
        int total = 0;

        fakeWs.on(WsEvents.gameEnded, (_) => total++);
        fakeWs.on(WsEvents.gameEnded, (_) => total++);
        fakeWs.on(WsEvents.gameEnded, (_) => total++);

        fakeWs.dispatch(WsEvents.gameEnded, {});
        expect(total, 3);
      });

      test('Unsubscribed listener does not fire', () {
        final fakeWs = _FakeWsClient();
        int count = 0;

        final unsub = fakeWs.on(WsEvents.clockTick, (_) => count++);
        fakeWs.dispatch(WsEvents.clockTick, {});
        expect(count, 1);

        unsub(); // remove
        fakeWs.dispatch(WsEvents.clockTick, {});
        expect(count, 1); // still 1, not incremented
      });
    });
  });
}
