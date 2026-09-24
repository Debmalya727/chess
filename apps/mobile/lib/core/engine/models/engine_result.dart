import 'engine_info.dart';

class EngineResult {
  final String bestMove;
  final String? ponder;
  final EngineInfo? info;

  const EngineResult({
    required this.bestMove,
    this.ponder,
    this.info,
  });

  @override
  String toString() => 'EngineResult(bestMove: $bestMove, ponder: $ponder)';
}
