class EngineInfo {
  final int? depth;
  final int? selDepth;
  final int multiPv;
  final int? scoreCp;
  final int? mate;
  final int? nodes;
  final int? nps;
  final int? timeMs;
  final List<String> pv;
  final String? bestMove;

  const EngineInfo({
    this.depth,
    this.selDepth,
    this.multiPv = 1,
    this.scoreCp,
    this.mate,
    this.nodes,
    this.nps,
    this.timeMs,
    this.pv = const [],
    this.bestMove,
  });

  bool get isMate => mate != null;

  /// Formatted score string (e.g. "+0.35", "-1.20", "M3", "-M2")
  String get formattedScore {
    if (mate != null) {
      return mate! > 0 ? 'M${mate!}' : '-M${mate!.abs()}';
    }
    if (scoreCp != null) {
      final pawns = scoreCp! / 100.0;
      final sign = pawns > 0 ? '+' : '';
      return '$sign${pawns.toStringAsFixed(2)}';
    }
    return '0.00';
  }

  /// Normalized score from White's perspective in range [-1.0, 1.0] for EvalBar.
  /// Sigmoid-like scaling where +/- 5 pawns is ~80% bar advantage.
  double getNormalizedEval({required String turn}) {
    // If perspective is from Black to move, flip score to represent White's perspective
    final isWhiteTurn = turn == 'w';
    final signMultiplier = isWhiteTurn ? 1.0 : -1.0;

    if (mate != null) {
      return (mate! > 0 ? 1.0 : -1.0) * signMultiplier;
    }
    if (scoreCp != null) {
      final cp = scoreCp! * signMultiplier;
      // Map [-1000, 1000] centipawns to [-1.0, 1.0] using hyperbolic tangent or smooth curve
      final clamped = cp.clamp(-1000, 1000);
      return clamped / 1000.0;
    }
    return 0.0;
  }

  EngineInfo copyWith({
    int? depth,
    int? selDepth,
    int? multiPv,
    int? scoreCp,
    int? mate,
    int? nodes,
    int? nps,
    int? timeMs,
    List<String>? pv,
    String? bestMove,
  }) {
    return EngineInfo(
      depth: depth ?? this.depth,
      selDepth: selDepth ?? this.selDepth,
      multiPv: multiPv ?? this.multiPv,
      scoreCp: scoreCp ?? this.scoreCp,
      mate: mate ?? this.mate,
      nodes: nodes ?? this.nodes,
      nps: nps ?? this.nps,
      timeMs: timeMs ?? this.timeMs,
      pv: pv ?? this.pv,
      bestMove: bestMove ?? this.bestMove,
    );
  }
}
