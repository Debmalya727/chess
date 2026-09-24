import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/features/chess/logic/chess_board_state.dart';
import 'package:chess_mobile/features/chess/models/chess_piece.dart';

void main() {
  group('ChessBoardState & Movement Engine', () {
    test('Initial FEN parses into correct 8x8 grid', () {
      final state = ChessBoardState.initial();
      final grid = state.grid;

      expect(grid.length, equals(8));
      expect(grid[0].length, equals(8));

      // Rank 8 pieces (row 0)
      expect(grid[0][0]?.type, equals(PieceType.rook));
      expect(grid[0][0]?.isBlack, isTrue);
      expect(grid[0][4]?.type, equals(PieceType.king));
      expect(grid[0][4]?.isBlack, isTrue);

      // Rank 1 pieces (row 7)
      expect(grid[7][0]?.type, equals(PieceType.rook));
      expect(grid[7][0]?.isWhite, isTrue);
      expect(grid[7][4]?.type, equals(PieceType.king));
      expect(grid[7][4]?.isWhite, isTrue);

      // Rank 2 pawns (row 6)
      for (int c = 0; c < 8; c++) {
        expect(grid[6][c]?.type, equals(PieceType.pawn));
        expect(grid[6][c]?.isWhite, isTrue);
      }
    });

    test('pieceAt retrieves correct pieces by algebraic notation', () {
      final state = ChessBoardState.initial();

      expect(state.pieceAt('e1')?.type, equals(PieceType.king));
      expect(state.pieceAt('e1')?.isWhite, isTrue);

      expect(state.pieceAt('d8')?.type, equals(PieceType.queen));
      expect(state.pieceAt('d8')?.isBlack, isTrue);

      expect(state.pieceAt('e4'), isNull);
    });

    test('applyMove updates board position, switches turn, and sets lastMove', () {
      final state = ChessBoardState.initial();
      expect(state.turn, equals('w'));

      // Move 1. e2-e4
      final afterE4 = state.applyMove('e2', 'e4');
      expect(afterE4.turn, equals('b'));
      expect(afterE4.pieceAt('e2'), isNull);
      expect(afterE4.pieceAt('e4')?.type, equals(PieceType.pawn));
      expect(afterE4.pieceAt('e4')?.isWhite, isTrue);
      expect(afterE4.lastMove?.from, equals('e2'));
      expect(afterE4.lastMove?.to, equals('e4'));

      // Move 1... e7-e5
      final afterE5 = afterE4.applyMove('e7', 'e5');
      expect(afterE5.turn, equals('w'));
      expect(afterE5.pieceAt('e7'), isNull);
      expect(afterE5.pieceAt('e5')?.type, equals(PieceType.pawn));
      expect(afterE5.pieceAt('e5')?.isBlack, isTrue);
    });

    test('applyMove handles pawn promotion to queen', () {
      // Setup a board where white pawn is on e7
      const fenBeforePromotion = '8/4P3/8/8/8/8/8/k6K w - - 0 1';
      final state = ChessBoardState(fen: fenBeforePromotion, turn: 'w');

      expect(state.pieceAt('e7')?.type, equals(PieceType.pawn));

      final promotedState = state.applyMove('e7', 'e8', promotion: 'q');
      expect(promotedState.pieceAt('e7'), isNull);
      expect(promotedState.pieceAt('e8')?.type, equals(PieceType.queen));
      expect(promotedState.pieceAt('e8')?.isWhite, isTrue);
      expect(promotedState.turn, equals('b'));
    });

    test('Board flip toggles perspective', () {
      final state = ChessBoardState.initial(isFlipped: false);
      expect(state.isFlipped, isFalse);

      final flipped = state.copyWith(isFlipped: true);
      expect(flipped.isFlipped, isTrue);
    });
  });
}
