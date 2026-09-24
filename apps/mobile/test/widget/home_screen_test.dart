import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/storage/secure_storage_service.dart';
import 'package:chess_mobile/features/auth/state/auth_notifier.dart';
import 'package:chess_mobile/features/home/presentation/home_screen.dart';

void main() {
  group('HomeScreen & App Shell', () {
    testWidgets('Renders app title, play modes, and connection badge', (tester) async {
      tester.view.physicalSize = const Size(1080, 1920);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);

      final inMemoryStorage = InMemoryStorageService();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            storageServiceProvider.overrideWithValue(inMemoryStorage),
          ],
          child: const MaterialApp(
            home: HomeScreen(),
          ),
        ),
      );
      await tester.pump();

      // App header
      expect(find.text('Stockfish Chess'), findsOneWidget);

      // Play mode options
      expect(find.text('Play Online'), findsOneWidget);
      expect(find.text('Local 2-Player'), findsOneWidget);
      expect(find.text('Play Computer'), findsOneWidget);
      expect(find.text('Analysis Board'), findsOneWidget);
      expect(find.text('Tournaments'), findsOneWidget);

      // Connection badge (defaults to Offline when not connected to live WS in test)
      expect(find.text('Offline'), findsOneWidget);
    });
  });
}
