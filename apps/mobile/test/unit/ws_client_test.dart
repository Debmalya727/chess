import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/websocket/ws_client.dart';
import 'package:chess_mobile/core/websocket/ws_connection_state.dart';

void main() {
  group('WebSocket Client & StateVersion Reconciliation', () {
    late WsClient wsClient;

    setUp(() {
      wsClient = WsClient(config: AppConfig.development);
    });

    tearDown(() {
      wsClient.dispose();
    });

    test('Initial connection state is disconnected', () {
      expect(wsClient.currentState.status, equals(WsConnectionStatus.disconnected));
      expect(wsClient.currentState.isConnected, isFalse);
    });

    test('StateVersion tracking ignores stale incoming events', () {
      wsClient.updateStateVersion('game1', 5);
      expect(wsClient.getLatestStateVersion('game1'), equals(5));

      // Older event (version 4 < 5) must be classified as stale
      expect(wsClient.isStaleEvent('game1', 4), isTrue);

      // Same event (version 5) is also stale
      expect(wsClient.isStaleEvent('game1', 5), isTrue);

      // Newer event (version 6 > 5) is valid
      expect(wsClient.isStaleEvent('game1', 6), isFalse);

      // Updating state version applies newer version
      wsClient.updateStateVersion('game1', 6);
      expect(wsClient.getLatestStateVersion('game1'), equals(6));
    });

    test('Reset stateVersion clears tracked version', () {
      wsClient.updateStateVersion('game1', 10);
      expect(wsClient.getLatestStateVersion('game1'), equals(10));

      wsClient.resetStateVersion('game1');
      expect(wsClient.getLatestStateVersion('game1'), equals(0));
    });

    test('Exponential backoff calculates increasing delays with cap', () {
      final delay0 = wsClient.calculateBackoffDelay(0);
      final delay1 = wsClient.calculateBackoffDelay(1);
      final delay2 = wsClient.calculateBackoffDelay(2);
      final delay5 = wsClient.calculateBackoffDelay(5);
      final delay20 = wsClient.calculateBackoffDelay(20);

      expect(delay0.inMilliseconds, equals(1000));
      expect(delay1.inMilliseconds, equals(2000));
      expect(delay2.inMilliseconds, equals(4000));
      expect(delay5.inMilliseconds, equals(30000)); // Capped at max 30s
      expect(delay20.inMilliseconds, equals(30000)); // Capped at max 30s
    });
  });
}
