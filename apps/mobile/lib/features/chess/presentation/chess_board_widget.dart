import 'package:flutter/material.dart';
import '../../../app/theme/app_colors.dart';
import '../logic/chess_board_state.dart';
import '../models/chess_piece.dart';
import 'promotion_dialog.dart';

class ChessBoardWidget extends StatelessWidget {
  final ChessBoardState boardState;
  final void Function(String from, String to, String? promotion)? onMove;
  final void Function(String square)? onSquareTapped;
  final bool isInteractive;
  final bool showCoordinates;

  const ChessBoardWidget({
    super.key,
    required this.boardState,
    this.onMove,
    this.onSquareTapped,
    this.isInteractive = true,
    this.showCoordinates = true,
  });

  String _coordsToSquare(int row, int col) {
    final rank = boardState.isFlipped ? (row + 1) : (8 - row);
    final fileCode = boardState.isFlipped ? (104 - col) : (97 + col);
    final file = String.fromCharCode(fileCode);
    return '$file$rank';
  }

  bool _isLightSquare(int row, int col) {
    return (row + col) % 2 == 0;
  }

  Future<void> _handleSquareTap(BuildContext context, String square) async {
    if (!isInteractive) return;

    if (onSquareTapped != null) {
      onSquareTapped!(square);
    }

    final selected = boardState.selectedSquare;
    final piece = boardState.pieceAt(square);

    if (selected == null) {
      // Nothing selected yet, select if it has a piece
      return;
    }

    if (selected == square) {
      // Deselect
      return;
    }

    // A piece is already selected, user tapped a target square
    final fromPiece = boardState.pieceAt(selected);
    if (fromPiece != null && piece != null && fromPiece.color == piece.color) {
      // Switched selection to another friendly piece
      return;
    }

    // Check if move is a pawn promotion
    String? promotion;
    if (fromPiece != null && fromPiece.type == PieceType.pawn) {
      final targetRank = int.tryParse(square[1]);
      if ((fromPiece.isWhite && targetRank == 8) || (fromPiece.isBlack && targetRank == 1)) {
        promotion = await PromotionDialog.show(context, fromPiece.color);
        if (promotion == null) return; // User cancelled promotion
      }
    }

    if (onMove != null) {
      onMove!(selected, square, promotion);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Enforce 1:1 square geometry fitting within available constraints
        final size = constraints.maxWidth < constraints.maxHeight
            ? constraints.maxWidth
            : constraints.maxHeight;
        final squareSize = size / 8;

        return Center(
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.4),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              padding: EdgeInsets.zero,
              itemCount: 64,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 8,
              ),
              itemBuilder: (context, index) {
                final row = index ~/ 8;
                final col = index % 8;
                final square = _coordsToSquare(row, col);
                final piece = boardState.pieceAt(square);
                final isLight = _isLightSquare(row, col);

                final isSelected = boardState.selectedSquare == square;
                final isLastMoveFrom = boardState.lastMove?.from == square;
                final isLastMoveTo = boardState.lastMove?.to == square;
                final isInCheck = boardState.inCheckKingSquare == square;
                final isLegalTarget = boardState.legalTargetSquares.contains(square);

                // Determine background color
                Color squareColor = isLight ? AppColors.sqLight : AppColors.sqDark;
                if (isSelected) {
                  squareColor = AppColors.sqHighlight;
                } else if (isLastMoveFrom || isLastMoveTo) {
                  squareColor = AppColors.sqLastMove;
                } else if (isInCheck) {
                  squareColor = AppColors.sqCheck;
                }

                // Coordinates indicators
                final showRank = showCoordinates && col == 0;
                final showFile = showCoordinates && row == 7;
                final rankLabel = square[1];
                final fileLabel = square[0];
                final coordColor = isLight ? AppColors.sqDark : AppColors.sqLight;

                final semanticPiece = piece != null
                    ? '${piece.isWhite ? "White" : "Black"} ${piece.type.name}'
                    : 'empty';

                return Semantics(
                  label: '$square, $semanticPiece',
                  button: isInteractive,
                  child: InkWell(
                    onTap: () => _handleSquareTap(context, square),
                    child: Container(
                      color: squareColor,
                      child: Stack(
                        children: [
                          // Rank coordinate on left-most column
                          if (showRank)
                            Positioned(
                              top: 2,
                              left: 3,
                              child: Text(
                                rankLabel,
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: coordColor.withValues(alpha: 0.8),
                                ),
                              ),
                            ),

                          // File coordinate on bottom-most row
                          if (showFile)
                            Positioned(
                              bottom: 2,
                              right: 3,
                              child: Text(
                                fileLabel,
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: coordColor.withValues(alpha: 0.8),
                                ),
                              ),
                            ),

                          // Legal Move Indicator (Dot for move, Ring for capture)
                          if (isLegalTarget)
                            Center(
                              child: Container(
                                width: piece == null ? squareSize * 0.28 : squareSize * 0.72,
                                height: piece == null ? squareSize * 0.28 : squareSize * 0.72,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: piece == null
                                      ? Colors.black.withValues(alpha: 0.2)
                                      : null,
                                  border: piece != null
                                      ? Border.all(
                                          color: Colors.black.withValues(alpha: 0.25),
                                          width: 3.5,
                                        )
                                      : null,
                                ),
                              ),
                            ),

                          // Piece Glyph
                          if (piece != null)
                            Center(
                              child: Text(
                                piece.unicodeSymbol,
                                style: TextStyle(
                                  fontSize: squareSize * 0.72,
                                  height: 1.0,
                                  color: piece.isWhite
                                      ? Colors.white
                                      : const Color(0xFF1E1E1E),
                                  shadows: [
                                    Shadow(
                                      color: piece.isWhite
                                          ? Colors.black45
                                          : Colors.white24,
                                      blurRadius: 2,
                                      offset: const Offset(0, 1),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        );
      },
    );
  }
}
