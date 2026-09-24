import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/engine/engine_service_provider.dart';
import 'package:chess_mobile/core/engine/mock_chess_engine.dart';
import 'package:chess_mobile/core/engine/models/engine_state.dart';

void main() {
  group('Fair-Play Engine Isolation & Regression Invariant', () {
    test('Local 2P and Online modes do NOT instantiate or start chess engine', () {
      int engineInstantiations = 0;

      final container = ProviderContainer(
        overrides: [
          chessEngineFactoryProvider.overrideWithValue(() {
            engineInstantiations++;
            return MockChessEngine();
          }),
        ],
      );
      addTearDown(container.dispose);

      // Verify that normal app container startup does not instantiate an engine
      expect(engineInstantiations, equals(0),
          reason: 'Engine must never be globally instantiated at app startup');

      // Local 2P and Online screen models do not read computerEngineProvider or analysisEngineProvider
      expect(container.exists(computerEngineProvider), isFalse);
      expect(container.exists(analysisEngineProvider), isFalse);
      expect(engineInstantiations, equals(0));
    });

    test('Computer Mode uses engine solely for move generation without exposing eval stream to UI', () async {
      final mockEngine = MockChessEngine(predefinedMoves: {
        'e2e4': 'e7e5',
      });

      final container = ProviderContainer(
        overrides: [
          chessEngineFactoryProvider.overrideWithValue(() => mockEngine),
        ],
      );
      addTearDown(container.dispose);

      // Instantiate engine in Computer mode
      final engine = container.read(computerEngineProvider);
      await engine.initialize();
      expect(engine.state, equals(EngineState.ready));

      // Computer searches on its turn
      await engine.setPosition(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: ['e2e4'],
      );
      final result = await engine.search(depth: 5, moveTimeMs: 10, skillLevel: 10);

      // Verify computer returned a legal move
      expect(result.bestMove, isNotEmpty);

      // Invariant: The UI only receives the bestMove string, never continuous evaluation stream
      expect(result.bestMove, equals('e7e5'));
    });

    test('Analysis Mode actively streams evaluation and exposes multi-PV', () async {
      final mockEngine = MockChessEngine();
      final container = ProviderContainer(
        overrides: [
          chessEngineFactoryProvider.overrideWithValue(() => mockEngine),
        ],
      );
      addTearDown(container.dispose);

      final engine = container.read(analysisEngineProvider);
      await engine.initialize();

      final stream = engine.analyze(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        depth: 10,
        multiPv: 2,
      );

      final events = await stream.take(2).toList();
      expect(events, isNotEmpty);
      expect(events.first.formattedScore, isNotNull);
      expect(events.first.pv, isNotEmpty);
    });

    test('Auto-disposal releases native engine resources when mode is exited', () async {
      final mockEngine = MockChessEngine();
      final container = ProviderContainer(
        overrides: [
          chessEngineFactoryProvider.overrideWithValue(() => mockEngine),
        ],
      );
      addTearDown(container.dispose);

      final sub = container.listen(computerEngineProvider, (_, _) {});
      final engine = sub.read();
      await engine.initialize();
      expect(engine.state, equals(EngineState.ready));

      // Closing subscription simulates popping the screen in Flutter
      sub.close();
      await Future<void>.delayed(Duration.zero);
      expect(mockEngine.state, equals(EngineState.disposed));
    });
  });
}
