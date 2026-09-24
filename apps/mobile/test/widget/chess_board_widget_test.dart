import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/features/chess/logic/chess_board_state.dart';
import 'package:chess_mobile/features/chess/presentation/chess_board_widget.dart';

void main() {
  group('ChessBoardWidget', () {
    testWidgets('Renders 64 squares in GridView with starting pieces', (tester) async {
      final boardState = ChessBoardState.initial();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 400,
              height: 400,
              child: ChessBoardWidget(boardState: boardState),
            ),
          ),
        ),
      );

      // Verify GridView is present
      expect(find.byType(GridView), findsOneWidget);

      // Verify piece glyphs are rendered (e.g. White King ♔ and Black King ♚)
      expect(find.text('♔'), findsOneWidget);
      expect(find.text('♚'), findsOneWidget);

      // Verify pawns are rendered (8 white pawns ♙, 8 black pawns ♟)
      expect(find.text('♙'), findsNWidgets(8));
      expect(find.text('♟'), findsNWidgets(8));
    });

    testWidgets('Tapping square invokes onSquareTapped callback', (tester) async {
      final boardState = ChessBoardState.initial();
      String? tappedSquare;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 400,
              height: 400,
              child: ChessBoardWidget(
                boardState: boardState,
                onSquareTapped: (sq) => tappedSquare = sq,
              ),
            ),
          ),
        ),
      );

      // Tap the white king on e1
      await tester.tap(find.text('♔'));
      await tester.pump();

      expect(tappedSquare, equals('e1'));
    });
  });
}
