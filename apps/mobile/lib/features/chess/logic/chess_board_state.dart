import '../models/chess_piece.dart';
import '../models/chess_move.dart';

class ChessBoardState {
  final String fen;
  final String turn; // 'w' or 'b'
  final bool isFlipped; // true if Black perspective at bottom
  final String? selectedSquare; // e.g. "e2"
  final List<String> legalTargetSquares; // squares selected piece can move to
  final ChessMove? lastMove;
  final String? inCheckKingSquare; // square of King currently in check
  final bool isGameOver;
  final String? gameStatusMessage;

  const ChessBoardState({
    required this.fen,
    this.turn = 'w',
    this.isFlipped = false,
    this.selectedSquare,
    this.legalTargetSquares = const [],
    this.lastMove,
    this.inCheckKingSquare,
    this.isGameOver = false,
    this.gameStatusMessage,
  });

  static const String initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  static ChessBoardState initial({bool isFlipped = false}) {
    return ChessBoardState(
      fen: initialFen,
      turn: 'w',
      isFlipped: isFlipped,
    );
  }

  /// Parses FEN into an 8x8 grid: [row 0..7][col 0..7] (where row 0 is Rank 8, col 0 is File a)
  List<List<ChessPiece?>> get grid {
    final rows = List.generate(8, (_) => List<ChessPiece?>.filled(8, null));
    final parts = fen.split(' ');
    final piecePlacement = parts.isNotEmpty ? parts[0] : '';
    final ranks = piecePlacement.split('/');

    for (int r = 0; r < ranks.length && r < 8; r++) {
      int col = 0;
      for (int i = 0; i < ranks[r].length && col < 8; i++) {
        final ch = ranks[r][i];
        final digit = int.tryParse(ch);
        if (digit != null) {
          col += digit;
        } else {
          rows[r][col] = ChessPiece.fromChar(ch);
          col++;
        }
      }
    }
    return rows;
  }

  ChessPiece? pieceAt(String square) {
    if (square.length < 2) return null;
    final file = square.codeUnitAt(0) - 97; // a -> 0
    final rank = int.tryParse(square[1]);
    if (rank == null || file < 0 || file > 7 || rank < 1 || rank > 8) return null;
    final row = 8 - rank;
    return grid[row][file];
  }

  ChessBoardState copyWith({
    String? fen,
    String? turn,
    bool? isFlipped,
    String? selectedSquare,
    List<String>? legalTargetSquares,
    ChessMove? lastMove,
    String? inCheckKingSquare,
    bool? isGameOver,
    String? gameStatusMessage,
    bool clearSelection = false,
  }) {
    return ChessBoardState(
      fen: fen ?? this.fen,
      turn: turn ?? this.turn,
      isFlipped: isFlipped ?? this.isFlipped,
      selectedSquare: clearSelection ? null : (selectedSquare ?? this.selectedSquare),
      legalTargetSquares: clearSelection ? const [] : (legalTargetSquares ?? this.legalTargetSquares),
      lastMove: lastMove ?? this.lastMove,
      inCheckKingSquare: inCheckKingSquare ?? this.inCheckKingSquare,
      isGameOver: isGameOver ?? this.isGameOver,
      gameStatusMessage: gameStatusMessage ?? this.gameStatusMessage,
    );
  }

  ChessBoardState applyMove(String from, String to, {String? promotion}) {
    if (from.length < 2 || to.length < 2) return this;
    final fromFile = from.codeUnitAt(0) - 97;
    final fromRank = int.tryParse(from[1]) ?? 1;
    final fromRow = 8 - fromRank;

    final toFile = to.codeUnitAt(0) - 97;
    final toRank = int.tryParse(to[1]) ?? 1;
    final toRow = 8 - toRank;

    final currentGrid = grid.map((r) => List<ChessPiece?>.from(r)).toList();
    final piece = currentGrid[fromRow][fromFile];
    if (piece == null) return this;

    ChessPiece targetPiece = piece;
    if (promotion != null && piece.type == PieceType.pawn) {
      final promoType = switch (promotion.toLowerCase()) {
        'q' => PieceType.queen,
        'r' => PieceType.rook,
        'b' => PieceType.bishop,
        'n' => PieceType.knight,
        _ => PieceType.queen,
      };
      targetPiece = ChessPiece(color: piece.color, type: promoType);
    }

    currentGrid[toRow][toFile] = targetPiece;
    currentGrid[fromRow][fromFile] = null;

    // Handle Castling moves
    if (piece.type == PieceType.king) {
      if (from == 'e1' && to == 'g1') {
        currentGrid[7][5] = currentGrid[7][7];
        currentGrid[7][7] = null;
      } else if (from == 'e1' && to == 'c1') {
        currentGrid[7][3] = currentGrid[7][0];
        currentGrid[7][0] = null;
      } else if (from == 'e8' && to == 'g8') {
        currentGrid[0][5] = currentGrid[0][7];
        currentGrid[0][7] = null;
      } else if (from == 'e8' && to == 'c8') {
        currentGrid[0][3] = currentGrid[0][0];
        currentGrid[0][0] = null;
      }
    }

    // Convert grid back to FEN placement
    final StringBuffer sb = StringBuffer();
    for (int r = 0; r < 8; r++) {
      int emptyCount = 0;
      for (int c = 0; c < 8; c++) {
        final p = currentGrid[r][c];
        if (p == null) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            sb.write(emptyCount);
            emptyCount = 0;
          }
          sb.write(p.charCode);
        }
      }
      if (emptyCount > 0) sb.write(emptyCount);
      if (r < 7) sb.write('/');
    }

    final nextTurn = turn == 'w' ? 'b' : 'w';
    final newFen = '${sb.toString()} $nextTurn - - 0 1';

    return copyWith(
      fen: newFen,
      turn: nextTurn,
      lastMove: ChessMove(from: from, to: to, promotion: promotion),
      clearSelection: true,
    );
  }
}
