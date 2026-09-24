import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'chess_engine.dart';
import 'mock_chess_engine.dart';
import 'native_stockfish_service.dart';

/// Factory provider allowing tests to inject [MockChessEngine]
final chessEngineFactoryProvider = Provider<ChessEngine Function()>((ref) {
  return () {
    // If running on Android or iOS, use real NativeStockfishService
    if (Platform.isAndroid || Platform.isIOS) {
      return NativeStockfishService();
    }
    // On desktop / test environments, fallback to MockChessEngine
    return MockChessEngine();
  };
});

/// Auto-disposed ChessEngine provider for Computer Mode.
/// Never instantiated during Online or Local 2P modes.
final computerEngineProvider = Provider.autoDispose<ChessEngine>((ref) {
  final factory = ref.watch(chessEngineFactoryProvider);
  final engine = factory();

  ref.onDispose(() {
    engine.dispose();
  });

  return engine;
});

/// Auto-disposed ChessEngine provider for Analysis Mode.
/// Never instantiated during Online or Local 2P modes.
final analysisEngineProvider = Provider.autoDispose<ChessEngine>((ref) {
  final factory = ref.watch(chessEngineFactoryProvider);
  final engine = factory();

  ref.onDispose(() {
    engine.dispose();
  });

  return engine;
});
