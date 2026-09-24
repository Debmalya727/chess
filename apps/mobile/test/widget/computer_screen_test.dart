import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/engine/engine_service_provider.dart';
import 'package:chess_mobile/core/engine/mock_chess_engine.dart';
import 'package:chess_mobile/features/chess/presentation/chess_board_widget.dart';
import 'package:chess_mobile/features/computer/presentation/computer_screen.dart';

void main() {
  group('ComputerScreen Widget Tests', () {
    testWidgets('Renders difficulty selection, fair-play banner, and starts game',
        (tester) async {
      final mockEngine = MockChessEngine();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            chessEngineFactoryProvider.overrideWithValue(() => mockEngine),
          ],
          child: const MaterialApp(
            home: ComputerScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Verify title & fair-play banner
      expect(find.text('Play Computer'), findsOneWidget);
      expect(find.byKey(const Key('fairplay_banner')), findsOneWidget);
      expect(find.text('Strict Fair-Play Invariant'), findsOneWidget);

      // Verify difficulty levels are rendered
      expect(find.text('Beginner'), findsOneWidget);
      expect(find.text('Intermediate'), findsOneWidget);

      // Scroll to and tap start game
      final startButton = find.byKey(const Key('start_game_button'));
      await tester.scrollUntilVisible(startButton, 200);
      expect(startButton, findsOneWidget);
      await tester.tap(startButton);
      await tester.pumpAndSettle();

      // Verify game view is active with ChessBoardWidget
      expect(find.byType(ChessBoardWidget), findsOneWidget);
      expect(find.text('You'), findsOneWidget);
      expect(find.textContaining('Stockfish (Level'), findsOneWidget);

      // CRITICAL FAIR-PLAY INVARIANT:
      // Verify that NO EvalBar, centipawns, or evaluation metrics are rendered
      expect(find.textContaining('Depth:'), findsNothing);
      expect(find.textContaining('Eval:'), findsNothing);
      expect(find.textContaining('MultiPV:'), findsNothing);
    });
  });
}
