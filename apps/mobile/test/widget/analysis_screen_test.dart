import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/engine/engine_service_provider.dart';
import 'package:chess_mobile/core/engine/mock_chess_engine.dart';
import 'package:chess_mobile/features/analysis/presentation/analysis_screen.dart';
import 'package:chess_mobile/features/analysis/presentation/widgets/eval_bar_widget.dart';
import 'package:chess_mobile/features/chess/presentation/chess_board_widget.dart';

void main() {
  group('AnalysisScreen Widget Tests', () {
    testWidgets('Renders board, EvalBar, depth indicators, and FEN display',
        (tester) async {
      final mockEngine = MockChessEngine();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            chessEngineFactoryProvider.overrideWithValue(() => mockEngine),
          ],
          child: const MaterialApp(
            home: AnalysisScreen(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Verify app bar title
      expect(find.text('Stockfish 18 Analysis'), findsOneWidget);

      // Verify EvalBar and ChessBoardWidget are rendered
      expect(find.byType(EvalBarWidget), findsOneWidget);
      expect(find.byType(ChessBoardWidget), findsOneWidget);

      // Verify evaluation indicators are present
      expect(find.textContaining('MultiPV: 1'), findsOneWidget);

      // Verify FEN display exists
      expect(find.textContaining('rnbqkbnr/pppppppp'), findsOneWidget);
    });
  });
}
