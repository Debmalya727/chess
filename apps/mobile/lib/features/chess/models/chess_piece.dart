enum PieceColor { white, black }

enum PieceType { pawn, knight, bishop, rook, queen, king }

class ChessPiece {
  final PieceColor color;
  final PieceType type;

  const ChessPiece({required this.color, required this.type});

  bool get isWhite => color == PieceColor.white;
  bool get isBlack => color == PieceColor.black;

  String get charCode {
    final c = switch (type) {
      PieceType.pawn => 'p',
      PieceType.knight => 'n',
      PieceType.bishop => 'b',
      PieceType.rook => 'r',
      PieceType.queen => 'q',
      PieceType.king => 'k',
    };
    return isWhite ? c.toUpperCase() : c;
  }

  static ChessPiece? fromChar(String char) {
    if (char.isEmpty) return null;
    final isWhite = char == char.toUpperCase();
    final lower = char.toLowerCase();
    final type = switch (lower) {
      'p' => PieceType.pawn,
      'n' => PieceType.knight,
      'b' => PieceType.bishop,
      'r' => PieceType.rook,
      'q' => PieceType.queen,
      'k' => PieceType.king,
      _ => null,
    };
    if (type == null) return null;
    return ChessPiece(color: isWhite ? PieceColor.white : PieceColor.black, type: type);
  }

  String get unicodeSymbol {
    if (isWhite) {
      return switch (type) {
        PieceType.king => '♔',
        PieceType.queen => '♕',
        PieceType.rook => '♖',
        PieceType.bishop => '♗',
        PieceType.knight => '♘',
        PieceType.pawn => '♙',
      };
    } else {
      return switch (type) {
        PieceType.king => '♚',
        PieceType.queen => '♛',
        PieceType.rook => '♜',
        PieceType.bishop => '♝',
        PieceType.knight => '♞',
        PieceType.pawn => '♟',
      };
    }
  }
}
