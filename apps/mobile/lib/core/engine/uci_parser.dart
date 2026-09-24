import 'models/engine_info.dart';
import 'models/engine_result.dart';

class UciParser {
  /// Parses a line of UCI output.
  /// Returns an [EngineInfo] if line starts with 'info',
  /// [EngineResult] if line starts with 'bestmove',
  /// or null for other control lines (e.g. 'uciok', 'readyok').
  static EngineInfo? parseInfo(String line) {
    final trimmed = line.trim();
    if (!trimmed.startsWith('info ')) return null;

    final tokens = trimmed.split(RegExp(r'\s+'));
    int? depth;
    int? selDepth;
    int multiPv = 1;
    int? scoreCp;
    int? mate;
    int? nodes;
    int? nps;
    int? timeMs;
    List<String> pv = [];

    for (int i = 1; i < tokens.length; i++) {
      final token = tokens[i];
      if (token == 'depth' && i + 1 < tokens.length) {
        depth = int.tryParse(tokens[++i]);
      } else if (token == 'seldepth' && i + 1 < tokens.length) {
        selDepth = int.tryParse(tokens[++i]);
      } else if (token == 'multipv' && i + 1 < tokens.length) {
        multiPv = int.tryParse(tokens[++i]) ?? 1;
      } else if (token == 'score' && i + 2 < tokens.length) {
        final scoreType = tokens[++i];
        final scoreVal = int.tryParse(tokens[++i]);
        if (scoreType == 'cp') {
          scoreCp = scoreVal;
        } else if (scoreType == 'mate') {
          mate = scoreVal;
        }
      } else if (token == 'nodes' && i + 1 < tokens.length) {
        nodes = int.tryParse(tokens[++i]);
      } else if (token == 'nps' && i + 1 < tokens.length) {
        nps = int.tryParse(tokens[++i]);
      } else if (token == 'time' && i + 1 < tokens.length) {
        timeMs = int.tryParse(tokens[++i]);
      } else if (token == 'pv') {
        // All remaining tokens belong to PV
        pv = tokens.sublist(i + 1);
        break;
      }
    }

    // Only return if at least depth, score, or pv was parsed
    if (depth == null && scoreCp == null && mate == null && pv.isEmpty) {
      return null;
    }

    return EngineInfo(
      depth: depth,
      selDepth: selDepth,
      multiPv: multiPv,
      scoreCp: scoreCp,
      mate: mate,
      nodes: nodes,
      nps: nps,
      timeMs: timeMs,
      pv: pv,
      bestMove: pv.isNotEmpty ? pv.first : null,
    );
  }

  /// Parses a 'bestmove' line from UCI engine.
  /// Example: "bestmove e2e4 ponder e7e5" or "bestmove e7e8q"
  static EngineResult? parseBestMove(String line, {EngineInfo? latestInfo}) {
    final trimmed = line.trim();
    if (!trimmed.startsWith('bestmove')) return null;

    final tokens = trimmed.split(RegExp(r'\s+'));
    if (tokens.length < 2) return null;

    final bestMove = tokens[1];
    String? ponder;
    if (tokens.length >= 4 && tokens[2] == 'ponder') {
      ponder = tokens[3];
    }

    return EngineResult(
      bestMove: bestMove,
      ponder: ponder,
      info: latestInfo,
    );
  }

  /// Checks if line is readyok
  static bool isReadyOk(String line) => line.trim() == 'readyok';

  /// Checks if line is uciok
  static bool isUciOk(String line) => line.trim() == 'uciok';
}
