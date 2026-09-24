import 'package:flutter/material.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../core/engine/models/engine_info.dart';

class EvalBarWidget extends StatelessWidget {
  final EngineInfo? info;
  final String turn;
  final bool isFlipped;

  const EvalBarWidget({
    super.key,
    required this.info,
    this.turn = 'w',
    this.isFlipped = false,
  });

  @override
  Widget build(BuildContext context) {
    // Normalization returns [-1.0, 1.0] from White's perspective
    final normalized = info?.getNormalizedEval(turn: turn) ?? 0.0;

    // Convert [-1.0, 1.0] to White percentage [0.0, 1.0]
    // 0.0 -> 0.5 (even)
    // +1.0 -> 1.0 (White winning)
    // -1.0 -> 0.0 (Black winning)
    final whiteFraction = ((normalized + 1.0) / 2.0).clamp(0.05, 0.95);

    return LayoutBuilder(
      builder: (context, constraints) {
        final totalHeight = constraints.maxHeight;
        final whiteHeight = totalHeight * whiteFraction;

        return Container(
          width: 24,
          decoration: BoxDecoration(
            color: const Color(0xFF262421), // Dark side
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: AppColors.border, width: 1),
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              // White side fraction
              Positioned(
                left: 0,
                right: 0,
                bottom: isFlipped ? null : 0,
                top: isFlipped ? 0 : null,
                height: whiteHeight,
                child: Container(
                  color: const Color(0xFFF0F0F0), // Light side
                ),
              ),

              // Evaluation label badge in the center
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.75),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    info?.formattedScore ?? '0.00',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 9,
                      fontWeight: FontWeight.bold,
                      fontFamily: 'monospace',
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
