import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/engine/mock_chess_engine.dart';
import 'package:chess_mobile/features/chess/logic/chess_board_state.dart';

void main() {
  group('Chess Correctness & Legal Move Verification', () {
    test('Starting position produces legal move for White', () async {
      final engine = MockChessEngine(predefinedMoves: {
        ChessBoardState.initialFen: 'e2e4',
      });
      await engine.initialize();
      await engine.setPosition(ChessBoardState.initialFen);

      final result = await engine.search();
      expect(result.bestMove, equals('e2e4'));

      final board = ChessBoardState.initial();
      final fromPiece = board.pieceAt('e2');
      expect(fromPiece, isNotNull);
      expect(fromPiece!.isWhite, isTrue);

      final nextBoard = board.applyMove('e2', 'e4');
      expect(nextBoard.turn, equals('b'));
      expect(nextBoard.pieceAt('e4'), isNotNull);
      expect(nextBoard.pieceAt('e2'), isNull);

      await engine.dispose();
    });

    test('Mate-in-one tactical position executes winning move', () async {
      // White to move, mate in 1: Qh5#
      const fen = 'rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
      final engine = MockChessEngine(predefinedMoves: {
        fen: 'd1h5',
      });
      await engine.initialize();
      await engine.setPosition(fen);

      final result = await engine.search();
      expect(result.bestMove, equals('d1h5'));

      final board = ChessBoardState(fen: fen, turn: 'w');
      final queen = board.pieceAt('d1');
      expect(queen, isNotNull);
      expect(queen!.charCode, equals('Q'));

      final applied = board.applyMove('d1', 'h5');
      expect(applied.pieceAt('h5')?.charCode, equals('Q'));

      await engine.dispose();
    });

    test('Promotion position executes pawn promotion to Queen', () async {
      // White pawn on e7, only one square from 8th rank
      const promoFen = '8/4P3/8/8/8/8/k6K/8 w - - 0 1';
      final engine = MockChessEngine(predefinedMoves: {
        promoFen: 'e7e8q',
      });
      await engine.initialize();
      await engine.setPosition(promoFen);

      final result = await engine.search();
      expect(result.bestMove, equals('e7e8q'));

      final board = ChessBoardState(fen: promoFen, turn: 'w');
      final pawn = board.pieceAt('e7');
      expect(pawn, isNotNull);
      expect(pawn!.charCode, equals('P'));

      final applied = board.applyMove('e7', 'e8', promotion: 'q');
      final promoted = applied.pieceAt('e8');
      expect(promoted, isNotNull);
      expect(promoted!.charCode, equals('Q'));

      await engine.dispose();
    });

    test('Endgame position executes legal rook move', () async {
      const endgameFen = '8/8/8/8/4k3/8/4K3/4R3 w - - 0 1';
      final engine = MockChessEngine(predefinedMoves: {
        endgameFen: 'e1d1',
      });
      await engine.initialize();
      await engine.setPosition(endgameFen);

      final result = await engine.search();
      expect(result.bestMove, equals('e1d1'));

      final board = ChessBoardState(fen: endgameFen, turn: 'w');
      expect(board.pieceAt('e1')?.charCode, equals('R'));

      final applied = board.applyMove('e1', 'd1');
      expect(applied.pieceAt('d1')?.charCode, equals('R'));
      expect(applied.turn, equals('b'));

      await engine.dispose();
    });
  });
}
