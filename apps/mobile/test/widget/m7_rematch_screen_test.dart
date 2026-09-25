import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/protocol/ws_events.dart';
import 'package:chess_mobile/core/websocket/ws_client.dart';
import 'package:chess_mobile/core/websocket/ws_connection_state.dart';
import 'package:chess_mobile/features/auth/state/auth_notifier.dart';
import 'package:chess_mobile/features/online/presentation/online_game_screen.dart';
import 'package:chess_mobile/features/online/state/online_game_notifier.dart';

class MockRematchWsClient extends WsClient {
  final List<String> sentEvents = [];
  final List<Map<String, dynamic>> sentPayloads = [];
  final Map<String, List<Function(Map<String, dynamic>)>> listeners = {};

  MockRematchWsClient() : super(config: AppConfig.development);

  @override
  void Function() on(String event, Function(Map<String, dynamic>) callback) {
    listeners.putIfAbsent(event, () => []).add(callback);
    return () => listeners[event]?.remove(callback);
  }

  @override
  void send(String event, Map<String, dynamic> payload, {String? requestId}) {
    sentEvents.add(event);
    sentPayloads.add(payload);
  }

  void dispatch(String event, Map<String, dynamic> payload) {
    listeners[event]?.forEach((cb) => cb(payload));
  }

  @override
  Stream<WsConnectionState> get connectionStateStream =>
      Stream.value(const WsConnectionState(status: WsConnectionStatus.connected));
}

void main() {
  group('OnlineGameScreen Rematch UI Widget Tests', () {
    late MockRematchWsClient wsClient;

    setUp(() {
      wsClient = MockRematchWsClient();
    });

    Widget createTestApp(ProviderContainer container) {
      return UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          home: OnlineGameScreen(),
        ),
      );
    }

    testWidgets('Completed standard game renders Rematch and Lobby buttons', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final container = ProviderContainer(
        overrides: [
          wsClientProvider.overrideWithValue(wsClient),
          wsConnectionStreamProvider.overrideWith(
            (ref) => Stream.value(const WsConnectionState(status: WsConnectionStatus.connected)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final gameNotifier = container.read(onlineGameProvider.notifier);
      gameNotifier.initializeGame({
        'gameId': 'game_widget_rematch_1',
        'roomCode': 'ROOM11',
        'status': 'ACTIVE',
        'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'turn': 'w',
        'color': 'w',
        'whiteUsername': 'PlayerWhite',
        'blackUsername': 'PlayerBlack',
        'whiteRating': 1600,
        'blackRating': 1600,
        'timeControl': '10+0',
        'stateVersion': 1,
      });

      // End the game
      wsClient.dispatch(WsEvents.gameEnded, {
        'gameId': 'game_widget_rematch_1',
        'result': '1-0',
        'termination': 'Resignation',
      });

      await tester.pumpWidget(createTestApp(container));
      await tester.pumpAndSettle();

      // Invariant: Rematch and Lobby buttons are visible after game over
      expect(find.byKey(const Key('rematch_button')), findsOneWidget);
      expect(find.text('Rematch'), findsOneWidget);
      expect(find.byKey(const Key('lobby_button')), findsOneWidget);
      expect(find.text('Lobby'), findsOneWidget);

      // Tap Rematch button
      await tester.tap(find.byKey(const Key('rematch_button')));
      await tester.pump();

      // Verifies offerRematch was dispatched
      expect(wsClient.sentEvents, contains(WsEvents.gameRematch));
      expect(wsClient.sentPayloads.any((p) => p['gameId'] == 'game_widget_rematch_1'), isTrue);
    });

    testWidgets('When user offers rematch, waiting state and Cancel button are displayed', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final container = ProviderContainer(
        overrides: [
          wsClientProvider.overrideWithValue(wsClient),
          wsConnectionStreamProvider.overrideWith(
            (ref) => Stream.value(const WsConnectionState(status: WsConnectionStatus.connected)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final gameNotifier = container.read(onlineGameProvider.notifier);
      gameNotifier.initializeGame({
        'gameId': 'game_widget_rematch_2',
        'roomCode': 'ROOM22',
        'status': 'ACTIVE',
        'fen': '8/8/8/8/8/8/8/8 w - - 0 1',
        'turn': 'w',
        'color': 'w',
        'whiteUsername': 'PlayerWhite',
        'blackUsername': 'PlayerBlack',
        'stateVersion': 1,
      });

      wsClient.dispatch(WsEvents.gameEnded, {
        'gameId': 'game_widget_rematch_2',
        'result': '0-1',
      });

      // User offers rematch
      gameNotifier.offerRematch();

      await tester.pumpWidget(createTestApp(container));
      await tester.pump();

      expect(find.text('Rematch offered... Waiting for opponent'), findsOneWidget);
      expect(find.byKey(const Key('rematch_cancel_button')), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);

      // Tap cancel button
      await tester.tap(find.byKey(const Key('rematch_cancel_button')));
      await tester.pump();

      expect(wsClient.sentEvents, contains(WsEvents.rematchCancel));
    });

    testWidgets('Incoming rematch offer displays Accept and Decline buttons', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final container = ProviderContainer(
        overrides: [
          wsClientProvider.overrideWithValue(wsClient),
          wsConnectionStreamProvider.overrideWith(
            (ref) => Stream.value(const WsConnectionState(status: WsConnectionStatus.connected)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final gameNotifier = container.read(onlineGameProvider.notifier);
      gameNotifier.initializeGame({
        'gameId': 'game_widget_rematch_3',
        'roomCode': 'ROOM33',
        'status': 'ACTIVE',
        'fen': '8/8/8/8/8/8/8/8 w - - 0 1',
        'turn': 'w',
        'color': 'w',
        'whiteUsername': 'PlayerWhite',
        'blackUsername': 'ChallengerX',
        'stateVersion': 1,
      });

      wsClient.dispatch(WsEvents.gameEnded, {
        'gameId': 'game_widget_rematch_3',
        'result': '1/2-1/2',
      });

      // Opponent sends rematch:offered
      wsClient.dispatch(WsEvents.rematchOffered, {
        'gameId': 'game_widget_rematch_3',
        'offeredBy': 'opp_id_999',
        'offeredByUsername': 'ChallengerX',
      });

      await tester.pumpWidget(createTestApp(container));
      await tester.pumpAndSettle();

      expect(find.text('ChallengerX offered a rematch!'), findsOneWidget);
      expect(find.byKey(const Key('rematch_accept_button')), findsOneWidget);
      expect(find.byKey(const Key('rematch_decline_button')), findsOneWidget);

      // Tap Accept
      await tester.tap(find.byKey(const Key('rematch_accept_button')));
      await tester.pump();

      expect(wsClient.sentEvents, contains(WsEvents.rematchRespond));
      expect(
        wsClient.sentPayloads.any((p) => p['gameId'] == 'game_widget_rematch_3' && p['accept'] == true),
        isTrue,
      );
    });

    testWidgets('Tournament games suppress rematch controls completely', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final container = ProviderContainer(
        overrides: [
          wsClientProvider.overrideWithValue(wsClient),
          wsConnectionStreamProvider.overrideWith(
            (ref) => Stream.value(const WsConnectionState(status: WsConnectionStatus.connected)),
          ),
        ],
      );
      addTearDown(container.dispose);

      final gameNotifier = container.read(onlineGameProvider.notifier);
      gameNotifier.initializeGame({
        'gameId': 'game_tourney_44',
        'roomCode': 'ROOM_T44',
        'status': 'ACTIVE',
        'fen': '8/8/8/8/8/8/8/8 w - - 0 1',
        'turn': 'w',
        'color': 'w',
        'whiteUsername': 'PlayerWhite',
        'blackUsername': 'TourneyOpponent',
        'tournamentId': 'tourney_active_001',
        'stateVersion': 1,
      });

      wsClient.dispatch(WsEvents.gameEnded, {
        'gameId': 'game_tourney_44',
        'result': '1-0',
        'termination': 'Checkmate',
      });

      await tester.pumpWidget(createTestApp(container));
      await tester.pumpAndSettle();

      // Invariant: Tournament games display Game Over and Lobby button, but NEVER rematch controls
      expect(find.textContaining('Game Over'), findsOneWidget);
      expect(find.byKey(const Key('lobby_button')), findsOneWidget);
      expect(find.byKey(const Key('rematch_button')), findsNothing);
      expect(find.byKey(const Key('rematch_accept_button')), findsNothing);
      expect(find.byKey(const Key('rematch_decline_button')), findsNothing);
      expect(find.byKey(const Key('rematch_cancel_button')), findsNothing);
    });
  });
}
