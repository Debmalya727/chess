import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/protocol/ws_events.dart';
import 'package:chess_mobile/core/websocket/ws_client.dart';
import 'package:chess_mobile/features/online/state/online_game_notifier.dart';

/// FakeWsClient that mirrors the one in online_game_notifier_test.dart —
/// kept local to this file so Phase B tests are self-contained.
class _FakeWsClient extends WsClient {
  final List<Map<String, dynamic>> sentMessages = [];
  final Map<String, List<Function(Map<String, dynamic>)>> callbacks = {};

  _FakeWsClient() : super(config: AppConfig.development);

  @override
  void Function() on(String event, Function(Map<String, dynamic>) callback) {
    callbacks.putIfAbsent(event, () => []).add(callback);
    return () => callbacks[event]?.remove(callback);
  }

  @override
  void send(String event, Map<String, dynamic> payload, {String? requestId}) {
    sentMessages.add({'event': event, 'payload': payload});
  }

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

Map<String, dynamic> _initPayload({
  String gameId = 'g_abc',
  String color = 'w',
  String userId = 'me_001',
  int stateVersion = 1,
}) => {
      'gameId': gameId,
      'roomCode': 'ROOM01',
      'status': 'ACTIVE',
      'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'turn': 'w',
      'color': color,
      'whitePlayerId': color == 'w' ? userId : 'opp_999',
      'blackPlayerId': color == 'b' ? userId : 'opp_999',
      'whiteUsername': 'White',
      'blackUsername': 'Black',
      'whiteRating': 1500,
      'blackRating': 1500,
      'timeControl': '5+0',
      'stateVersion': stateVersion,
      'moves': <String>[],
      'clocks': {'white': 300000, 'black': 300000},
    };

void main() {
  group('M6 Phase B — WebSocket Resilience Tests', () {
    // ─────────────────────────────────────────────────────────────────────
    // B1. WsClient multi-game stateVersion isolation
    // ─────────────────────────────────────────────────────────────────────
    group('B1: WsClient multi-game stateVersion isolation', () {
      late WsClient wsClient;

      setUp(() {
        wsClient = WsClient(config: AppConfig.development);
      });

      tearDown(() {
        wsClient.dispose();
      });

      test('Two concurrent game IDs maintain independent stateVersions', () {
        wsClient.updateStateVersion('game_A', 5);
        wsClient.updateStateVersion('game_B', 3);

        expect(wsClient.getLatestStateVersion('game_A'), 5);
        expect(wsClient.getLatestStateVersion('game_B'), 3);

        // Updating game_A does not affect game_B
        wsClient.updateStateVersion('game_A', 8);
        expect(wsClient.getLatestStateVersion('game_A'), 8);
        expect(wsClient.getLatestStateVersion('game_B'), 3);
      });

      test('Stale check is game-scoped (event for game_A never rejects game_B event)', () {
        wsClient.updateStateVersion('game_A', 10);
        wsClient.updateStateVersion('game_B', 2);

        // game_B version 3 is NOT stale even though 3 < game_A's version 10
        expect(wsClient.isStaleEvent('game_B', 3), isFalse);
        // game_A version 9 IS stale
        expect(wsClient.isStaleEvent('game_A', 9), isTrue);
      });

      test('Reset clears only the targeted game ID', () {
        wsClient.updateStateVersion('game_A', 7);
        wsClient.updateStateVersion('game_B', 4);

        wsClient.resetStateVersion('game_A');

        expect(wsClient.getLatestStateVersion('game_A'), 0);
        expect(wsClient.getLatestStateVersion('game_B'), 4);
      });

      test('Unknown game ID returns version 0 (not stale for any positive version)', () {
        expect(wsClient.getLatestStateVersion('unknown_game'), 0);
        expect(wsClient.isStaleEvent('unknown_game', 1), isFalse);
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // B2. draw:declined uses WsEvents constant (M6-F001 regression guard)
    // ─────────────────────────────────────────────────────────────────────
    group('B2: draw:declined constant regression guard', () {
      test('WsEvents.drawDeclined equals the server-protocol string draw:declined', () {
        expect(WsEvents.drawDeclined, equals('draw:declined'));
      });

      test('draw:declined handler clears drawOfferedByMe via WsEvents.drawDeclined', () {
        final fakeWs = _FakeWsClient();
        final notifier = OnlineGameNotifier(
          wsClient: fakeWs,
          currentUserId: 'me_001',
          initialPayload: _initPayload(),
        );

        // Offer a draw first
        notifier.offerDraw();
        expect(notifier.state!.drawOfferedByMe, isTrue);

        // Server dispatches draw:declined using the constant's value
        fakeWs.dispatch(WsEvents.drawDeclined, {});
        expect(notifier.state!.drawOfferedByMe, isFalse);

        notifier.dispose();
      });

      test('draw:declined hardcoded string and WsEvents.drawDeclined are identical', () {
        // Guards against accidental rename of the constant value
        const hardcoded = 'draw:declined';
        expect(WsEvents.drawDeclined, equals(hardcoded));
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // B3. Reconnect scenario: game:init replaces stale game state
    // ─────────────────────────────────────────────────────────────────────
    group('B3: Reconnect — game:init replaces stale state', () {
      late _FakeWsClient fakeWs;

      setUp(() {
        fakeWs = _FakeWsClient();
      });

      test('game:init re-dispatched during reconnect resets game state to server version', () {
        final notifier = OnlineGameNotifier(
          wsClient: fakeWs,
          currentUserId: 'me_001',
          initialPayload: _initPayload(stateVersion: 1),
        );

        // Simulate some moves (advance state locally)
        fakeWs.dispatch(WsEvents.moveAccepted, {
          'gameId': 'g_abc',
          'fen': 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          'turn': 'b',
          'stateVersion': 2,
          'moves': ['e4'],
        });
        expect(notifier.state!.stateVersion, 2);

        // Reconnect — server re-sends game:init with authoritative state
        fakeWs.dispatch(WsEvents.gameInit, {
          ..._initPayload(stateVersion: 5),
          'fen': 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
          'turn': 'w',
          'moves': ['e4', 'e5'],
          'clocks': {'white': 295000, 'black': 295000},
        });

        // Notifier must accept the server's authoritative state
        expect(notifier.state!.stateVersion, 5);
        expect(notifier.state!.moves, ['e4', 'e5']);
        expect(notifier.state!.clock.whiteRemainingMs, 295000);

        notifier.dispose();
      });

      test('game:init for a different gameId does not overwrite active game', () {
        final notifier = OnlineGameNotifier(
          wsClient: fakeWs,
          currentUserId: 'me_001',
          initialPayload: _initPayload(gameId: 'g_abc', stateVersion: 3),
        );

        // Stray game:init for a different game ID
        fakeWs.dispatch(WsEvents.gameInit, {
          ..._initPayload(gameId: 'g_xyz', stateVersion: 1),
          'fen': 'different_fen',
        });

        // Active game state must be unchanged
        expect(notifier.state!.gameId, 'g_abc');
        expect(notifier.state!.stateVersion, 3);

        notifier.dispose();
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // B4. move:rejected must NOT advance stateVersion
    // ─────────────────────────────────────────────────────────────────────
    group('B4: move:rejected does not alter stateVersion', () {
      test('stateVersion is unchanged after move:rejected', () {
        final fakeWs = _FakeWsClient();
        final notifier = OnlineGameNotifier(
          wsClient: fakeWs,
          currentUserId: 'me_001',
          initialPayload: _initPayload(stateVersion: 1),
        );

        notifier.submitMove('e2', 'e9'); // invalid move

        fakeWs.dispatch(WsEvents.moveRejected, {
          'gameId': 'g_abc',
          'code': 'OUT_OF_BOUNDS',
          'reason': 'Destination square e9 is not on the board.',
        });

        // stateVersion must remain 1
        expect(notifier.state!.stateVersion, 1);
        // errorMessage must be set
        expect(notifier.state!.errorMessage, contains('OUT_OF_BOUNDS'));
        // FEN must remain unchanged
        expect(
          notifier.state!.fen,
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        );

        notifier.dispose();
      });

      test('A subsequent valid move:accepted after rejection still advances stateVersion', () {
        final fakeWs = _FakeWsClient();
        final notifier = OnlineGameNotifier(
          wsClient: fakeWs,
          currentUserId: 'me_001',
          initialPayload: _initPayload(stateVersion: 1),
        );

        // First: a rejected move
        fakeWs.dispatch(WsEvents.moveRejected, {
          'gameId': 'g_abc',
          'code': 'ILLEGAL_MOVE',
          'reason': 'King would be in check.',
        });
        expect(notifier.state!.stateVersion, 1);

        // Then: a valid move is accepted
        fakeWs.dispatch(WsEvents.moveAccepted, {
          'gameId': 'g_abc',
          'fen': 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          'turn': 'b',
          'stateVersion': 2,
          'moves': ['e4'],
        });
        expect(notifier.state!.stateVersion, 2);
        expect(notifier.state!.errorMessage, isNull);

        notifier.dispose();
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // B5. Listener cleanup on dispose prevents callbacks after teardown
    // ─────────────────────────────────────────────────────────────────────
    group('B5: Listener cleanup on dispose', () {
      test('No callbacks fire for disposed notifier', () {
        final fakeWs = _FakeWsClient();
        final notifier = OnlineGameNotifier(
          wsClient: fakeWs,
          currentUserId: 'me_001',
          initialPayload: _initPayload(),
        );

        // Confirm the notifier registered listeners
        expect(fakeWs.callbacks.isNotEmpty, isTrue);

        notifier.dispose();

        // After dispose, all listener lists should be empty for handled events
        // (callbacks remove themselves via the returned unsub function)
        expect(fakeWs.listenerCount(WsEvents.gameInit), 0);
        expect(fakeWs.listenerCount(WsEvents.moveAccepted), 0);
        expect(fakeWs.listenerCount(WsEvents.moveRejected), 0);
        expect(fakeWs.listenerCount(WsEvents.clockTick), 0);
        expect(fakeWs.listenerCount(WsEvents.drawOffered), 0);
        expect(fakeWs.listenerCount(WsEvents.drawDeclined), 0);
        expect(fakeWs.listenerCount(WsEvents.gameEnded), 0);
        expect(fakeWs.listenerCount(WsEvents.playerPresence), 0);
      });

      test('Dispatching events after dispose does not throw or mutate state', () {
        final fakeWs = _FakeWsClient();
        final notifier = OnlineGameNotifier(
          wsClient: fakeWs,
          currentUserId: 'me_001',
          initialPayload: _initPayload(),
        );

        notifier.dispose();

        // Dispatching after dispose must be a no-op (callbacks removed)
        expect(
          () => fakeWs.dispatch(WsEvents.moveAccepted, {
            'gameId': 'g_abc',
            'stateVersion': 99,
            'fen': 'injected_fen',
            'turn': 'b',
            'moves': ['injected'],
          }),
          returnsNormally,
        );
      });
    });
  });
}
