import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/engine/uci_parser.dart';

void main() {
  group('UciParser Unit Tests', () {
    test('isUciOk identifies uciok correctly', () {
      expect(UciParser.isUciOk('uciok'), isTrue);
      expect(UciParser.isUciOk('  uciok  \n'), isTrue);
      expect(UciParser.isUciOk('readyok'), isFalse);
    });

    test('isReadyOk identifies readyok correctly', () {
      expect(UciParser.isReadyOk('readyok'), isTrue);
      expect(UciParser.isReadyOk('readyok\r\n'), isTrue);
      expect(UciParser.isReadyOk('uciok'), isFalse);
    });

    test('parseInfo extracts standard centipawn evaluation with PV', () {
      const line =
          'info depth 18 seldepth 24 multipv 1 score cp 45 nodes 182300 nps 912000 time 200 pv e2e4 e7e5 g1f3 b8c6';
      final info = UciParser.parseInfo(line);

      expect(info, isNotNull);
      expect(info!.depth, equals(18));
      expect(info.selDepth, equals(24));
      expect(info.multiPv, equals(1));
      expect(info.scoreCp, equals(45));
      expect(info.mate, isNull);
      expect(info.isMate, isFalse);
      expect(info.formattedScore, equals('+0.45'));
      expect(info.nodes, equals(182300));
      expect(info.nps, equals(912000));
      expect(info.timeMs, equals(200));
      expect(info.pv, equals(['e2e4', 'e7e5', 'g1f3', 'b8c6']));
      expect(info.bestMove, equals('e2e4'));
    });

    test('parseInfo extracts negative centipawn evaluation', () {
      const line = 'info depth 12 score cp -120 pv d7d5 e4d5';
      final info = UciParser.parseInfo(line);

      expect(info, isNotNull);
      expect(info!.scoreCp, equals(-120));
      expect(info.formattedScore, equals('-1.20'));
      expect(info.bestMove, equals('d7d5'));
    });

    test('parseInfo extracts positive mate score', () {
      const line = 'info depth 7 seldepth 9 score mate 3 pv f7f8q g8h7 g2g4';
      final info = UciParser.parseInfo(line);

      expect(info, isNotNull);
      expect(info!.isMate, isTrue);
      expect(info.mate, equals(3));
      expect(info.scoreCp, isNull);
      expect(info.formattedScore, equals('M3'));
    });

    test('parseInfo extracts negative mate score', () {
      const line = 'info depth 4 score mate -2 pv d1h5 g7g6';
      final info = UciParser.parseInfo(line);

      expect(info, isNotNull);
      expect(info!.isMate, isTrue);
      expect(info.mate, equals(-2));
      expect(info.formattedScore, equals('-M2'));
    });

    test('parseInfo extracts MultiPV line index', () {
      const line = 'info depth 14 multipv 2 score cp -15 pv c2c4 c7c5';
      final info = UciParser.parseInfo(line);

      expect(info, isNotNull);
      expect(info!.multiPv, equals(2));
      expect(info.pv, equals(['c2c4', 'c7c5']));
    });

    test('parseInfo ignores non-info lines and malformed text', () {
      expect(UciParser.parseInfo('uciok'), isNull);
      expect(UciParser.parseInfo('readyok'), isNull);
      expect(UciParser.parseInfo('id name Stockfish 18'), isNull);
      expect(UciParser.parseInfo('info string NNUE evaluation enabled'), isNull);
      expect(UciParser.parseInfo(''), isNull);
    });

    test('parseBestMove parses move and optional ponder', () {
      final res1 = UciParser.parseBestMove('bestmove e2e4 ponder e7e5');
      expect(res1, isNotNull);
      expect(res1!.bestMove, equals('e2e4'));
      expect(res1.ponder, equals('e7e5'));

      final res2 = UciParser.parseBestMove('bestmove e7e8q');
      expect(res2, isNotNull);
      expect(res2!.bestMove, equals('e7e8q'));
      expect(res2.ponder, isNull);

      expect(UciParser.parseBestMove('invalid line'), isNull);
    });
  });
}
