import 'package:flutter/material.dart';
import '../models/chess_piece.dart';
import '../../../app/theme/app_colors.dart';

/// Touch-friendly modal dialog for pawn promotion.
/// Returns 'q', 'r', 'b', or 'n'.
class PromotionDialog extends StatelessWidget {
  final PieceColor color;

  const PromotionDialog({super.key, required this.color});

  static Future<String?> show(BuildContext context, PieceColor color) {
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PromotionDialog(color: color),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isWhite = color == PieceColor.white;
    final options = [
      (PieceType.queen, 'q', 'Queen', isWhite ? '♕' : '♛'),
      (PieceType.rook, 'r', 'Rook', isWhite ? '♖' : '♜'),
      (PieceType.bishop, 'b', 'Bishop', isWhite ? '♗' : '♝'),
      (PieceType.knight, 'n', 'Knight', isWhite ? '♘' : '♞'),
    ];

    return Dialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Promote Pawn',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: options.map((opt) {
                return InkWell(
                  onTap: () => Navigator.of(context).pop(opt.$2),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: AppColors.cardBackground,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.accent.withValues(alpha: 0.3),
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      opt.$4,
                      style: TextStyle(
                        fontSize: 36,
                        color: isWhite ? Colors.white : Colors.amber.shade200,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}
