import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/protocol/ws_events.dart';
import 'package:chess_mobile/core/websocket/ws_client.dart';
import 'package:chess_mobile/features/online/models/matchmaking_pool.dart';
import 'package:chess_mobile/features/online/state/matchmaking_notifier.dart';

class FakeWsClient extends WsClient {
  final List<Map<String, dynamic>> sentMessages = [];
  final Map<String, List<Function(Map<String, dynamic>)>> callbacks = {};

  FakeWsClient() : super(config: AppConfig.development);

  @override
  void Function() on(String event, Function(Map<String, dynamic>) callback) {
    callbacks.putIfAbsent(event, () => []).add(callback);
    return () {
      callbacks[event]?.remove(callback);
    };
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
  group('MatchmakingNotifier State Machine Tests', () {
    late FakeWsClient fakeWs;
    late MatchmakingNotifier notifier;

    setUp(() {
      fakeWs = FakeWsClient();
      notifier = MatchmakingNotifier(wsClient: fakeWs);
    });

    tearDown(() {
      if (notifier.mounted) {
        notifier.dispose();
      }
      fakeWs.dispose();
    });

    test('initial state is idle with no active pool or error', () {
      expect(notifier.state.status, equals(MatchmakingStatus.idle));
      expect(notifier.state.activePool, isNull);
      expect(notifier.state.errorMessage, isNull);
      expect(notifier.state.isSearching, isFalse);
      expect(notifier.state.isMatched, isFalse);
      expect(notifier.state.isWaitingInRoom, isFalse);
    });

    test('joinQueue transitions to searching and sends queue:join event', () {
      final pool = MatchmakingPool.fromTimeControl('3+0');
      notifier.joinQueue(pool);

      expect(notifier.state.status, equals(MatchmakingStatus.searching));
      expect(notifier.state.isSearching, isTrue);
      expect(notifier.state.activePool, equals(pool));
      expect(notifier.state.timeControl, equals('3+0'));
      expect(notifier.state.joinedAt, isNotNull);

      expect(fakeWs.sentMessages.length, equals(1));
      expect(fakeWs.sentMessages.first['event'], equals(WsEvents.queueJoin));
      expect(fakeWs.sentMessages.first['payload'], equals({'timeControl': '3+0'}));
    });

    test('leaveQueue sends queue:leave and transitions back to idle', () {
      final pool = MatchmakingPool.fromTimeControl('5+0');
      notifier.joinQueue(pool);
      expect(notifier.state.status, equals(MatchmakingStatus.searching));

      notifier.leaveQueue();

      expect(notifier.state.status, equals(MatchmakingStatus.idle));
      expect(notifier.state.activePool, isNull);

      final leaveMsg = fakeWs.sentMessages.firstWhere((m) => m['event'] == WsEvents.queueLeave);
      expect(leaveMsg, isNotNull);
    });

    test('queue:status event with inQueue=true updates range and keeps searching status', () {
      final pool = MatchmakingPool.fromTimeControl('10+0');
      notifier.joinQueue(pool);

      fakeWs.dispatch(WsEvents.queueStatus, {
        'inQueue': true,
        'timeControl': '10+0',
        'rating': 1500,
        'ratingType': 'rapid',
        'minRating': 1400,
        'maxRating': 1600,
        'joinedAt': 1700000000000,
      });

      expect(notifier.state.status, equals(MatchmakingStatus.searching));
      expect(notifier.state.rating, equals(1500));
      expect(notifier.state.ratingType, equals('rapid'));
      expect(notifier.state.minRating, equals(1400));
      expect(notifier.state.maxRating, equals(1600));
      expect(notifier.state.joinedAt, equals(1700000000000));
    });

    test('queue:status event with inQueue=false while searching resets to idle', () {
      final pool = MatchmakingPool.fromTimeControl('10+0');
      notifier.joinQueue(pool);
      expect(notifier.state.status, equals(MatchmakingStatus.searching));

      fakeWs.dispatch(WsEvents.queueStatus, {
        'inQueue': false,
      });

      expect(notifier.state.status, equals(MatchmakingStatus.idle));
    });

    test('queue:matched event transitions state to matched with payload', () {
      final pool = MatchmakingPool.fromTimeControl('3+2');
      notifier.joinQueue(pool);

      final matchData = {
        'gameId': 'game-999',
        'opponent': {'id': 'opp-1', 'username': 'Magnus', 'rating': 2800},
        'color': 'white',
      };
      fakeWs.dispatch(WsEvents.queueMatched, matchData);

      expect(notifier.state.status, equals(MatchmakingStatus.matched));
      expect(notifier.state.isMatched, isTrue);
      expect(notifier.state.matchedPayload, equals(matchData));
    });

    test('game:init event with WAITING transitions state to waitingInRoom', () {
      notifier.createRoom(timeControl: '10+0');
      expect(notifier.state.status, equals(MatchmakingStatus.searching));

      fakeWs.dispatch(WsEvents.gameInit, {
        'status': 'WAITING',
        'roomCode': 'ROOM42',
      });

      expect(notifier.state.status, equals(MatchmakingStatus.waitingInRoom));
      expect(notifier.state.isWaitingInRoom, isTrue);
      expect(notifier.state.roomCode, equals('ROOM42'));
    });

    test('game:init event with ACTIVE transitions state to matched', () {
      notifier.joinRoom('ROOM42');
      expect(notifier.state.status, equals(MatchmakingStatus.searching));

      fakeWs.dispatch(WsEvents.gameInit, {
        'status': 'ACTIVE',
        'roomCode': 'ROOM42',
        'gameId': 'g-live-1',
      });

      expect(notifier.state.status, equals(MatchmakingStatus.matched));
      expect(notifier.state.isMatched, isTrue);
      expect(notifier.state.roomCode, equals('ROOM42'));
    });

    test('createRoom sends room:create and sets status to searching', () {
      notifier.createRoom(timeControl: '5+3', colorPreference: 'black');

      expect(notifier.state.status, equals(MatchmakingStatus.searching));
      expect(notifier.state.timeControl, equals('5+3'));

      expect(fakeWs.sentMessages.length, equals(1));
      expect(fakeWs.sentMessages.first['event'], equals(WsEvents.roomCreate));
      expect(
        fakeWs.sentMessages.first['payload'],
        equals({'timeControl': '5+3', 'colorPreference': 'black'}),
      );
    });

    test('joinRoom trims, uppercases code, sends room:join and sets searching', () {
      notifier.joinRoom('  xy99z  ');

      expect(notifier.state.status, equals(MatchmakingStatus.searching));
      expect(fakeWs.sentMessages.length, equals(1));
      expect(fakeWs.sentMessages.first['event'], equals(WsEvents.roomJoin));
      expect(fakeWs.sentMessages.first['payload'], equals({'roomCode': 'XY99Z'}));
    });

    test('leaveRoom resets state to idle', () {
      notifier.createRoom(timeControl: '10+0');
      expect(notifier.state.status, equals(MatchmakingStatus.searching));

      notifier.leaveRoom();
      expect(notifier.state.status, equals(MatchmakingStatus.idle));
    });

    test('error event while searching transitions to error state with code and message', () {
      notifier.joinQueue(MatchmakingPool.fromTimeControl('1+0'));

      fakeWs.dispatch(WsEvents.error, {
        'code': 'QUEUE_FULL',
        'message': 'Queue is currently full',
      });

      expect(notifier.state.status, equals(MatchmakingStatus.error));
      expect(notifier.state.errorMessage, equals('QUEUE_FULL: Queue is currently full'));
    });

    test('error event while waitingInRoom transitions to error state', () {
      notifier.createRoom(timeControl: '5+0');
      fakeWs.dispatch(WsEvents.gameInit, {
        'status': 'WAITING',
        'roomCode': 'ROOM42',
      });
      expect(notifier.state.status, equals(MatchmakingStatus.waitingInRoom));

      fakeWs.dispatch(WsEvents.error, {
        'code': 'ROOM_EXPIRED',
        'message': 'Custom room invitation timed out',
      });

      expect(notifier.state.status, equals(MatchmakingStatus.error));
      expect(notifier.state.errorMessage, equals('ROOM_EXPIRED: Custom room invitation timed out'));
    });

    test('error event while idle is ignored and does not transition state', () {
      expect(notifier.state.status, equals(MatchmakingStatus.idle));

      fakeWs.dispatch(WsEvents.error, {
        'code': 'SPURIOUS_ERROR',
        'message': 'Should not affect idle notifier',
      });

      expect(notifier.state.status, equals(MatchmakingStatus.idle));
      expect(notifier.state.errorMessage, isNull);
    });

    test('clearError and reset clean state properly', () {
      notifier.joinQueue(MatchmakingPool.fromTimeControl('1+0'));
      fakeWs.dispatch(WsEvents.error, {
        'code': 'TEST_ERR',
        'message': 'Failed',
      });
      expect(notifier.state.errorMessage, isNotNull);

      notifier.clearError();
      expect(notifier.state.errorMessage, isNull);

      notifier.reset();
      expect(notifier.state.status, equals(MatchmakingStatus.idle));
    });

    test('dispose unregisters all WS event listeners so subsequent events are ignored', () {
      notifier.joinQueue(MatchmakingPool.fromTimeControl('3+0'));
      expect(notifier.state.status, equals(MatchmakingStatus.searching));

      notifier.dispose();

      expect(notifier.mounted, isFalse);
      expect(fakeWs.callbacks[WsEvents.queueStatus]?.isEmpty ?? true, isTrue);
      expect(fakeWs.callbacks[WsEvents.queueMatched]?.isEmpty ?? true, isTrue);
      expect(fakeWs.callbacks[WsEvents.gameInit]?.isEmpty ?? true, isTrue);
      expect(fakeWs.callbacks[WsEvents.error]?.isEmpty ?? true, isTrue);
    });
  });
}
