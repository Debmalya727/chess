import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/engine/mock_chess_engine.dart';
import 'package:chess_mobile/core/engine/models/engine_difficulty.dart';
import 'package:chess_mobile/core/engine/models/engine_info.dart';
import 'package:chess_mobile/core/engine/models/engine_state.dart';

void main() {
  group('EngineService & Lifecycle Tests', () {
    test('MockChessEngine lifecycle: initialize, newGame, search, dispose', () async {
      final engine = MockChessEngine();
      expect(engine.state, equals(EngineState.uninitialized));

      await engine.initialize();
      expect(engine.state, equals(EngineState.ready));

      await engine.newGame();
      await engine.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

      final result = await engine.search(depth: 5, moveTimeMs: 10, skillLevel: 10);
      expect(result.bestMove, isNotEmpty);
      expect(engine.state, equals(EngineState.ready));

      await engine.dispose();
      expect(engine.state, equals(EngineState.disposed));
    });

    test('Search returns predefined move for specific position', () async {
      final engine = MockChessEngine(predefinedMoves: {
        'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5': 'c4f7',
      });
      await engine.initialize();

      await engine.setPosition('r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5');
      final result = await engine.search(depth: 10, moveTimeMs: 10);

      expect(result.bestMove, equals('c4f7'));
      await engine.dispose();
    });

    test('Stop search safely interrupts ongoing search', () async {
      final engine = MockChessEngine();
      await engine.initialize();

      final searchFuture = engine.search(depth: 25, moveTimeMs: 2000);
      await Future.delayed(const Duration(milliseconds: 15));
      await engine.stopSearch();

      final result = await searchFuture;
      expect(result.bestMove, isNotEmpty);
      expect(engine.state, equals(EngineState.ready));

      await engine.dispose();
    });

    test('Analyze stream emits progressive EngineInfo lines', () async {
      final engine = MockChessEngine();
      await engine.initialize();

      final stream = engine.analyze(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        depth: 5,
        multiPv: 2,
      );

      final List<EngineInfo> emitted = [];
      final sub = stream.listen((info) {
        emitted.add(info);
      });

      await Future.delayed(const Duration(milliseconds: 120));
      await sub.cancel();
      await engine.stopSearch();

      expect(emitted, isNotEmpty);
      expect(emitted.any((i) => i.multiPv == 1), isTrue);
      expect(emitted.any((i) => i.multiPv == 2), isTrue);
      expect(emitted.first.bestMove, isNotNull);

      await engine.dispose();
    });

    test('EngineDifficulty correctly maps all 8 levels', () {
      expect(EngineDifficulty.all.length, equals(8));

      final lvl1 = EngineDifficulty.fromLevel(1);
      expect(lvl1.label, equals('Beginner'));
      expect(lvl1.skillLevel, equals(1));
      expect(lvl1.depth, equals(2));
      expect(lvl1.moveTimeMs, equals(250));

      final lvl8 = EngineDifficulty.fromLevel(8);
      expect(lvl8.label, equals('Maximum Stockfish'));
      expect(lvl8.skillLevel, equals(20));
      expect(lvl8.depth, equals(22));
      expect(lvl8.moveTimeMs, equals(2000));
    });
  });
}
