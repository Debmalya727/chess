import 'models/engine_info.dart';
import 'models/engine_result.dart';
import 'models/engine_state.dart';

abstract class ChessEngine {
  EngineState get state;
  Stream<EngineState> get stateStream;
  Stream<EngineInfo> get infoStream;

  Future<void> initialize();
  Future<void> newGame();
  Future<void> setPosition(String fen, {List<String>? moves});
  Future<void> setOption(String name, String value);
  Future<EngineResult> search({int? depth, int? moveTimeMs, int? skillLevel});
  Stream<EngineInfo> analyze(String fen, {int? depth, int multiPv = 1});
  Future<void> stopSearch();
  Future<void> dispose();
}
