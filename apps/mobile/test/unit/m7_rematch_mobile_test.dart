import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/protocol/error_codes.dart';
import 'package:chess_mobile/core/protocol/ws_events.dart';
import 'package:chess_mobile/core/websocket/ws_client.dart';
import 'package:chess_mobile/features/online/state/online_game_notifier.dart';

class FakeWsClient extends WsClient {
  final List<Map<String, dynamic>> sentMessages = [];
  final Map<String, List<Function(Map<String, dynamic>)>> callbacks = {};

  FakeWsClient() : super(config: AppConfig.development);

  @override
  void Function() on(String event, Function(Map<String, dynamic>) callback) {
    callbacks.putIfAbsent(event, () => []).add(callback);
    return () => callbacks[event]?.remove(callback);
  }

  @override
  void send(String event, Map<String, dynamic> payload, {String? requestId}) {
    sentMessages.add({'event': event, 'payload': payload, 'requestId': requestId});
  }

  void dispatch(String event, Map<String, dynamic> payload) {
    final list = callbacks[event];
    if (list != null) {
      for (final cb in List.of(list)) {
        cb(payload);
      }
    }
  }
}

void main() {
  group('A. Protocol Constants Verification', () {
    test('WsEvents rematch constants match server protocol specification', () {
      expect(WsEvents.gameRematch, 'game:rematch');
      expect(WsEvents.rematchRespond, 'game:rematch:respond');
      expect(WsEvents.rematchCancel, 'game:rematch:cancel');
      expect(WsEvents.rematchOffered, 'rematch:offered');
      expect(WsEvents.rematchDeclined, 'rematch:declined');
      expect(WsEvents.rematchCancelled, 'rematch:cancelled');
    });

    test('ErrorCodes rematch constants match server error specification', () {
      expect(ErrorCodes.gameNotFinished, 'GAME_NOT_FINISHED');
      expect(ErrorCodes.tournamentRematchNotAllowed, 'TOURNAMENT_REMATCH_NOT_ALLOWED');
      expect(ErrorCodes.rematchAlreadyPending, 'REMATCH_ALREADY_PENDING');
      expect(ErrorCodes.rematchAlreadyResolved, 'REMATCH_ALREADY_RESOLVED');
      expect(ErrorCodes.rematchNotFound, 'REMATCH_NOT_FOUND');
      expect(ErrorCodes.rematchExpired, 'REMATCH_EXPIRED');
    });
  });

  group('B. Notifier Actions & Minimal Payloads', () {
    late FakeWsClient fakeWs;
    late OnlineGameNotifier notifier;

    final endedGamePayload = {
      'gameId': 'game_end_001',
      'roomCode': 'ROOM_END_1',
      'status': 'ACTIVE',
      'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'turn': 'w',
      'whitePlayerId': 'user_me',
      'blackPlayerId': 'user_opp',
      'whiteUsername': 'Hero',
      'blackUsername': 'Rival',
      'whiteRating': 1500,
      'blackRating': 1500,
      'timeControl': '10+0',
      'stateVersion': 5,
      'moves': ['e2e4', 'e7e5'],
      'whiteTimeRemainingMs': 500000,
      'blackTimeRemainingMs': 500000,
    };

    setUp(() {
      fakeWs = FakeWsClient();
      notifier = OnlineGameNotifier(
        wsClient: fakeWs,
        currentUserId: 'user_me',
        initialPayload: endedGamePayload,
      );
      // Conclude the game
      fakeWs.dispatch(WsEvents.gameEnded, {
        'gameId': 'game_end_001',
        'result': '1-0',
        'termination': 'Resignation',
        'stateVersion': 6,
      });
    });

    tearDown(() {
      notifier.dispose();
    });

    test('offerRematch sends exact payload containing only gameId', () {
      expect(notifier.state!.isEnded, isTrue);

      notifier.offerRematch();

      expect(notifier.state!.rematchOfferedByMe, isTrue);
      expect(notifier.state!.isRematchLoading, isTrue);

      expect(fakeWs.sentMessages.length, 1);
      final msg = fakeWs.sentMessages.first;
      expect(msg['event'], WsEvents.gameRematch);
      expect(msg['payload'], {'gameId': 'game_end_001'});

      // Invariant: no client-authored fields
      final payload = msg['payload'] as Map<String, dynamic>;
      expect(payload.containsKey('color'), isFalse);
      expect(payload.containsKey('fen'), isFalse);
      expect(payload.containsKey('clocks'), isFalse);
      expect(payload.containsKey('roomCode'), isFalse);
      expect(payload.containsKey('rating'), isFalse);
    });

    test('respondRematch(true) sends exact payload with gameId and accept=true', () {
      notifier.respondRematch(true);

      expect(notifier.state!.isRematchLoading, isTrue);
      expect(fakeWs.sentMessages.length, 1);
      final msg = fakeWs.sentMessages.first;
      expect(msg['event'], WsEvents.rematchRespond);
      expect(msg['payload'], {
        'gameId': 'game_end_001',
        'accept': true,
      });
    });

    test('respondRematch(false) sends exact payload with gameId and accept=false', () {
      // Simulate received offer first
      fakeWs.dispatch(WsEvents.rematchOffered, {
        'gameId': 'game_end_001',
        'offeredBy': 'user_opp',
        'offeredByUsername': 'Rival',
      });
      expect(notifier.state!.rematchOfferedToMe, isTrue);

      notifier.respondRematch(false);

      expect(notifier.state!.rematchOfferedToMe, isFalse);
      expect(notifier.state!.isRematchLoading, isFalse);
      expect(fakeWs.sentMessages.length, 1);
      final msg = fakeWs.sentMessages.first;
      expect(msg['event'], WsEvents.rematchRespond);
      expect(msg['payload'], {
        'gameId': 'game_end_001',
        'accept': false,
      });
    });

    test('cancelRematch sends exact payload with gameId', () {
      notifier.offerRematch();
      expect(notifier.state!.rematchOfferedByMe, isTrue);
      fakeWs.sentMessages.clear();

      notifier.cancelRematch();

      expect(notifier.state!.rematchOfferedByMe, isFalse);
      expect(notifier.state!.isRematchLoading, isFalse);
      expect(fakeWs.sentMessages.length, 1);
      final msg = fakeWs.sentMessages.first;
      expect(msg['event'], WsEvents.rematchCancel);
      expect(msg['payload'], {'gameId': 'game_end_001'});
    });
  });

  group('C. Incoming Server Rematch Events', () {
    late FakeWsClient fakeWs;
    late OnlineGameNotifier notifier;

    final initialInitPayload = {
      'gameId': 'game_events_test',
      'roomCode': 'ROOM_EVENTS',
      'status': 'ACTIVE',
      'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'turn': 'w',
      'whitePlayerId': 'user_me',
      'blackPlayerId': 'user_rival',
      'whiteUsername': 'MeUser',
      'blackUsername': 'RivalUser',
      'timeControl': '10+0',
      'stateVersion': 1,
    };

    setUp(() {
      fakeWs = FakeWsClient();
      notifier = OnlineGameNotifier(
        wsClient: fakeWs,
        currentUserId: 'user_me',
        initialPayload: initialInitPayload,
      );
      fakeWs.dispatch(WsEvents.gameEnded, {
        'gameId': 'game_events_test',
        'result': '0-1',
        'termination': 'Checkmate',
      });
    });

    tearDown(() {
      notifier.dispose();
    });

    test('rematch:offered from opponent updates rematchOfferedToMe and username', () {
      fakeWs.dispatch(WsEvents.rematchOffered, {
        'gameId': 'game_events_test',
        'offeredBy': 'user_rival',
        'offeredByUsername': 'RivalUser',
      });

      expect(notifier.state!.rematchOfferedToMe, isTrue);
      expect(notifier.state!.rematchOfferedByUsername, 'RivalUser');
      expect(notifier.state!.isRematchLoading, isFalse);
    });

    test('rematch:offered from current user updates rematchOfferedByMe', () {
      fakeWs.dispatch(WsEvents.rematchOffered, {
        'gameId': 'game_events_test',
        'offeredBy': 'user_me',
        'offeredByUsername': 'MeUser',
      });

      expect(notifier.state!.rematchOfferedByMe, isTrue);
      expect(notifier.state!.rematchOfferedToMe, isFalse);
      expect(notifier.state!.isRematchLoading, isFalse);
    });

    test('rematch:offered with wrong gameId is ignored', () {
      fakeWs.dispatch(WsEvents.rematchOffered, {
        'gameId': 'wrong_game_999',
        'offeredBy': 'user_rival',
        'offeredByUsername': 'RivalUser',
      });

      expect(notifier.state!.rematchOfferedToMe, isFalse);
      expect(notifier.state!.rematchOfferedByMe, isFalse);
    });

    test('rematch:declined clears pending and incoming offers', () {
      notifier.offerRematch();
      expect(notifier.state!.rematchOfferedByMe, isTrue);

      fakeWs.dispatch(WsEvents.rematchDeclined, {
        'gameId': 'game_events_test',
        'declinedBy': 'user_rival',
      });

      expect(notifier.state!.rematchOfferedByMe, isFalse);
      expect(notifier.state!.rematchOfferedToMe, isFalse);
      expect(notifier.state!.isRematchLoading, isFalse);
    });

    test('rematch:cancelled with timeout reason sets error and clears offers', () {
      notifier.offerRematch();
      expect(notifier.state!.rematchOfferedByMe, isTrue);

      fakeWs.dispatch(WsEvents.rematchCancelled, {
        'gameId': 'game_events_test',
        'reason': 'timeout',
      });

      expect(notifier.state!.rematchOfferedByMe, isFalse);
      expect(notifier.state!.rematchOfferedToMe, isFalse);
      expect(notifier.state!.isRematchLoading, isFalse);
      expect(notifier.state!.errorMessage, 'Rematch offer expired.');
    });

    test('rematch:cancelled with opponent_disconnected reason sets error', () {
      fakeWs.dispatch(WsEvents.rematchCancelled, {
        'gameId': 'game_events_test',
        'reason': 'opponent_disconnected',
      });

      expect(notifier.state!.errorMessage, 'Opponent disconnected.');
      expect(notifier.state!.rematchOfferedByMe, isFalse);
      expect(notifier.state!.rematchOfferedToMe, isFalse);
    });

    test('rematch:cancelled with cancelled_by_player sets error', () {
      fakeWs.dispatch(WsEvents.rematchCancelled, {
        'gameId': 'game_events_test',
        'reason': 'cancelled_by_player',
      });

      expect(notifier.state!.errorMessage, 'Rematch offer was cancelled.');
    });

    test('error event with REMATCH_ error code updates state errorMessage', () {
      notifier.offerRematch();
      expect(notifier.state!.isRematchLoading, isTrue);

      fakeWs.dispatch(WsEvents.error, {
        'code': 'REMATCH_ALREADY_PENDING',
        'message': 'A rematch offer is already pending.',
      });

      expect(notifier.state!.isRematchLoading, isFalse);
      expect(notifier.state!.rematchOfferedByMe, isFalse);
      expect(notifier.state!.errorMessage, 'A rematch offer is already pending.');
    });
  });

  group('D. Authoritative game:init Transition to Game 2', () {
    late FakeWsClient fakeWs;
    late OnlineGameNotifier notifier;

    final game1Payload = {
      'gameId': 'game_1_authoritative',
      'roomCode': 'ROOM_1',
      'status': 'ACTIVE',
      'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'turn': 'w',
      'whitePlayerId': 'user_me',
      'blackPlayerId': 'user_rival',
      'whiteUsername': 'Hero',
      'blackUsername': 'Rival',
      'whiteRating': 1500,
      'blackRating': 1510,
      'timeControl': '5+3',
      'stateVersion': 8,
      'moves': ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
    };

    final game2InitPayload = {
      'gameId': 'game_2_new_id',
      'roomCode': 'ROOM_2_NEW',
      'status': 'ACTIVE',
      'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'turn': 'w',
      'whitePlayerId': 'user_rival', // Swapped: Rival is White
      'blackPlayerId': 'user_me',    // Swapped: Me is Black
      'whiteUsername': 'Rival',
      'blackUsername': 'Hero',
      'whiteRating': 1518,
      'blackRating': 1492,
      'timeControl': '5+3',
      'stateVersion': 1,
      'moves': <String>[],
      'clocks': {
        'white': 300000,
        'black': 300000,
      },
    };

    setUp(() {
      fakeWs = FakeWsClient();
      notifier = OnlineGameNotifier(
        wsClient: fakeWs,
        currentUserId: 'user_me',
        initialPayload: game1Payload,
      );
      // Conclude Game 1
      fakeWs.dispatch(WsEvents.gameEnded, {
        'gameId': 'game_1_authoritative',
        'result': '0-1',
        'termination': 'Checkmate',
      });
      // User offered rematch
      notifier.offerRematch();
    });

    tearDown(() {
      notifier.dispose();
    });

    test('game:init after ended Game 1 cleanly transitions to Game 2 with swapped colors and fresh state', () {
      expect(notifier.state!.gameId, 'game_1_authoritative');
      expect(notifier.state!.isEnded, isTrue);
      expect(notifier.state!.rematchOfferedByMe, isTrue);

      // Server emits authoritative game:init for Game 2
      fakeWs.dispatch(WsEvents.gameInit, game2InitPayload);

      final state = notifier.state;
      expect(state, isNotNull);
      // New authoritative identity
      expect(state!.gameId, 'game_2_new_id');
      expect(state.roomCode, 'ROOM_2_NEW');
      expect(state.status, 'ACTIVE');
      expect(state.isEnded, isFalse);
      expect(state.result, isNull);
      expect(state.termination, isNull);

      // Swapped colors
      expect(state.myColor, 'b');
      expect(state.whitePlayerId, 'user_rival');
      expect(state.blackPlayerId, 'user_me');
      expect(state.whiteUsername, 'Rival');
      expect(state.blackUsername, 'Hero');
      expect(state.myUsername, 'Hero');
      expect(state.opponentUsername, 'Rival');
      expect(state.isFlipped, isTrue); // Black plays from bottom

      // Authoritative reset of moves, clocks, stateVersion
      expect(state.moves, isEmpty);
      expect(state.stateVersion, 1);
      expect(state.clock.whiteRemainingMs, 300000);
      expect(state.clock.blackRemainingMs, 300000);

      // Rematch state completely cleared
      expect(state.rematchOfferedByMe, isFalse);
      expect(state.rematchOfferedToMe, isFalse);
      expect(state.rematchOfferedByUsername, isNull);
      expect(state.isRematchLoading, isFalse);
      expect(state.errorMessage, isNull);
    });
  });

  group('E. Duplicate Action Prevention and Guards', () {
    late FakeWsClient fakeWs;
    late OnlineGameNotifier notifier;

    setUp(() {
      fakeWs = FakeWsClient();
      notifier = OnlineGameNotifier(
        wsClient: fakeWs,
        currentUserId: 'user_1',
        initialPayload: {
          'gameId': 'active_game',
          'roomCode': 'ROOM_ACTIVE',
          'status': 'ACTIVE',
          'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          'turn': 'w',
          'whitePlayerId': 'user_1',
          'blackPlayerId': 'user_2',
          'stateVersion': 1,
        },
      );
    });

    tearDown(() {
      notifier.dispose();
    });

    test('offerRematch is blocked while game is still ongoing', () {
      expect(notifier.state!.isEnded, isFalse);

      notifier.offerRematch();

      expect(fakeWs.sentMessages, isEmpty);
      expect(notifier.state!.rematchOfferedByMe, isFalse);
    });

    test('repeated offerRematch is blocked while rematch is already pending', () {
      fakeWs.dispatch(WsEvents.gameEnded, {
        'gameId': 'active_game',
        'result': '1/2-1/2',
      });
      expect(notifier.state!.isEnded, isTrue);

      notifier.offerRematch();
      expect(fakeWs.sentMessages.length, 1);

      // Second attempt
      notifier.offerRematch();
      expect(fakeWs.sentMessages.length, 1); // No new message sent
    });

    test('cancelRematch is blocked if user has not offered a rematch', () {
      fakeWs.dispatch(WsEvents.gameEnded, {
        'gameId': 'active_game',
        'result': '1/2-1/2',
      });

      notifier.cancelRematch();
      expect(fakeWs.sentMessages, isEmpty);
    });
  });

  group('F. Tournament Rematch Exclusion', () {
    late FakeWsClient fakeWs;
    late OnlineGameNotifier notifier;

    setUp(() {
      fakeWs = FakeWsClient();
      notifier = OnlineGameNotifier(
        wsClient: fakeWs,
        currentUserId: 'user_1',
        initialPayload: {
          'gameId': 'tourney_game_42',
          'roomCode': 'TOURNEY_ROOM',
          'status': 'ACTIVE',
          'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          'turn': 'w',
          'whitePlayerId': 'user_1',
          'blackPlayerId': 'user_2',
          'tournamentId': 'tournament_swiss_99',
          'stateVersion': 1,
        },
      );
      fakeWs.dispatch(WsEvents.gameEnded, {
        'gameId': 'tourney_game_42',
        'result': '1-0',
      });
    });

    tearDown(() {
      notifier.dispose();
    });

    test('isTournamentGame is true when tournamentId is present', () {
      expect(notifier.state!.isTournamentGame, isTrue);
      expect(notifier.state!.tournamentId, 'tournament_swiss_99');
    });

    test('offerRematch is suppressed for tournament games', () {
      notifier.offerRematch();

      expect(fakeWs.sentMessages, isEmpty);
      expect(notifier.state!.rematchOfferedByMe, isFalse);
    });

    test('server TOURNAMENT_REMATCH_NOT_ALLOWED error is handled gracefully', () {
      fakeWs.dispatch(WsEvents.error, {
        'code': ErrorCodes.tournamentRematchNotAllowed,
        'message': 'Rematch is not permitted in tournament games.',
      });

      expect(notifier.state!.errorMessage, 'Rematch is not permitted in tournament games.');
      expect(notifier.state!.isRematchLoading, isFalse);
    });
  });

  group('G. Lifecycle & Reconnect Safety', () {
    test('dispose unregisters all WebSocket listeners cleanly', () {
      final fakeWs = FakeWsClient();
      final notifier = OnlineGameNotifier(
        wsClient: fakeWs,
        currentUserId: 'user_1',
        initialPayload: {
          'gameId': 'lifecycle_game',
          'roomCode': 'R_LIFE',
          'status': 'ACTIVE',
          'fen': '8/8/8/8/8/8/8/8 w - - 0 1',
          'turn': 'w',
          'whitePlayerId': 'user_1',
          'blackPlayerId': 'user_2',
        },
      );

      // Verify listeners were added
      expect(fakeWs.callbacks[WsEvents.rematchOffered]?.isNotEmpty, isTrue);
      expect(fakeWs.callbacks[WsEvents.rematchDeclined]?.isNotEmpty, isTrue);
      expect(fakeWs.callbacks[WsEvents.rematchCancelled]?.isNotEmpty, isTrue);

      notifier.dispose();

      // Verify listeners were cleaned up
      expect(fakeWs.callbacks[WsEvents.rematchOffered]?.isEmpty, isTrue);
      expect(fakeWs.callbacks[WsEvents.rematchDeclined]?.isEmpty, isTrue);
      expect(fakeWs.callbacks[WsEvents.rematchCancelled]?.isEmpty, isTrue);
    });

    test('reconnect for completed game does not send room:join', () {
      final fakeWs = FakeWsClient();
      final notifier = OnlineGameNotifier(
        wsClient: fakeWs,
        currentUserId: 'user_1',
        initialPayload: {
          'gameId': 'ended_reconnect_game',
          'roomCode': 'R_RECONNECT',
          'status': 'ACTIVE',
          'fen': '8/8/8/8/8/8/8/8 w - - 0 1',
          'turn': 'w',
          'whitePlayerId': 'user_1',
          'blackPlayerId': 'user_2',
        },
      );
      fakeWs.dispatch(WsEvents.gameEnded, {
        'gameId': 'ended_reconnect_game',
        'result': '1-0',
      });
      fakeWs.sentMessages.clear();

      notifier.reconnect();

      // Does not send room:join because game is ended
      expect(fakeWs.sentMessages, isEmpty);

      notifier.dispose();
    });
  });
}
