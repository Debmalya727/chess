import 'package:flutter/material.dart';
import '../../../app/theme/app_colors.dart';

class ChessClockWidget extends StatelessWidget {
  final String playerName;
  final int? rating;
  final int timeRemainingMs;
  final bool isActive;
  final bool isWhite;
  final VoidCallback? onTap;

  const ChessClockWidget({
    super.key,
    required this.playerName,
    this.rating,
    required this.timeRemainingMs,
    required this.isActive,
    required this.isWhite,
    this.onTap,
  });

  String _formatTime(int ms) {
    if (ms <= 0) return '0:00';
    final totalSeconds = (ms / 1000).ceil();
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    final secStr = seconds.toString().padLeft(2, '0');
    return '$minutes:$secStr';
  }

  @override
  Widget build(BuildContext context) {
    final isLowTime = timeRemainingMs < 30000 && timeRemainingMs > 0;
    final timeStr = _formatTime(timeRemainingMs);

    return Semantics(
      label: '$playerName, ${isWhite ? "White" : "Black"}, $timeStr remaining, ${isActive ? "active turn" : "waiting"}',
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: isActive
                ? AppColors.cardBackground
                : AppColors.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isActive ? AppColors.accent : AppColors.border,
              width: isActive ? 2.0 : 1.0,
            ),
            boxShadow: isActive
                ? [
                    BoxShadow(
                      color: AppColors.accent.withValues(alpha: 0.25),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Player info
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: isWhite ? Colors.white : Colors.black,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isWhite ? Colors.grey.shade400 : Colors.white24,
                        width: 1.5,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    playerName,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  if (rating != null) ...[
                    const SizedBox(width: 6),
                    Text(
                      '($rating)',
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),

              // Time badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isLowTime
                      ? AppColors.error.withValues(alpha: 0.2)
                      : (isActive ? AppColors.accent.withValues(alpha: 0.15) : AppColors.surface),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  timeStr,
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: isLowTime
                        ? AppColors.error
                        : (isActive ? AppColors.accent : AppColors.textPrimary),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
