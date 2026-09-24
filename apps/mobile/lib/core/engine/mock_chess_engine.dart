import 'dart:async';

import 'chess_engine.dart';
import 'models/engine_info.dart';
import 'models/engine_result.dart';
import 'models/engine_state.dart';

/// Deterministic mock chess engine for unit and widget tests
class MockChessEngine implements ChessEngine {
  EngineState _state = EngineState.uninitialized;
  final _stateController = StreamController<EngineState>.broadcast();
  final _infoController = StreamController<EngineInfo>.broadcast();

  String _currentFen = '';
  List<String> _currentMoves = [];
  Timer? _searchTimer;
  StreamController<EngineInfo>? _analysisController;

  /// Custom move replier for specific test positions
  final Map<String, String> predefinedMoves;

  MockChessEngine({this.predefinedMoves = const {}});

  @override
  EngineState get state => _state;

  @override
  Stream<EngineState> get stateStream => _stateController.stream;

  @override
  Stream<EngineInfo> get infoStream => _infoController.stream;

  void _setState(EngineState newState) {
    _state = newState;
    if (!_stateController.isClosed) {
      _stateController.add(newState);
    }
  }

  @override
  Future<void> initialize() async {
    _setState(EngineState.initializing);
    await Future.delayed(const Duration(milliseconds: 10));
    _setState(EngineState.ready);
  }

  @override
  Future<void> newGame() async {
    _currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    _currentMoves = [];
  }

  @override
  Future<void> setOption(String name, String value) async {}

  @override
  Future<void> setPosition(String fen, {List<String>? moves}) async {
    _currentFen = fen;
    _currentMoves = moves ?? [];
  }

  @override
  Future<EngineResult> search({int? depth, int? moveTimeMs, int? skillLevel}) async {
    _setState(EngineState.searching);

    // Short simulated search duration
    final delay = Duration(milliseconds: moveTimeMs != null ? (moveTimeMs > 50 ? 50 : moveTimeMs) : 20);
    await Future.delayed(delay);

    if (_state != EngineState.searching) {
      return const EngineResult(bestMove: 'e7e5');
    }

    String bestMove = 'e7e5';
    // Check if predefined move exists for FEN or last move
    if (predefinedMoves.containsKey(_currentFen)) {
      bestMove = predefinedMoves[_currentFen]!;
    } else if (_currentMoves.isNotEmpty && predefinedMoves.containsKey(_currentMoves.last)) {
      bestMove = predefinedMoves[_currentMoves.last]!;
    } else {
      // Heuristic fallback moves based on turn
      if (_currentFen.contains(' w ')) {
        bestMove = 'e2e4';
      } else {
        bestMove = 'e7e5';
      }
    }

    final info = EngineInfo(
      depth: depth ?? 10,
      selDepth: (depth ?? 10) + 2,
      scoreCp: 25,
      nodes: 15000,
      nps: 300000,
      timeMs: delay.inMilliseconds,
      pv: [bestMove],
      bestMove: bestMove,
    );

    if (!_infoController.isClosed) {
      _infoController.add(info);
    }

    _setState(EngineState.ready);
    return EngineResult(bestMove: bestMove, info: info);
  }

  @override
  Stream<EngineInfo> analyze(String fen, {int? depth, int multiPv = 1}) {
    _searchTimer?.cancel();
    _analysisController?.close();

    _analysisController = StreamController<EngineInfo>.broadcast();
    _setState(EngineState.searching);

    int currentDepth = 1;
    final maxDepth = depth ?? 18;

    _searchTimer = Timer.periodic(const Duration(milliseconds: 30), (timer) {
      if (currentDepth > maxDepth || _state != EngineState.searching) {
        timer.cancel();
        return;
      }

      for (int pv = 1; pv <= multiPv; pv++) {
        final info = EngineInfo(
          depth: currentDepth,
          selDepth: currentDepth + 3,
          multiPv: pv,
          scoreCp: (pv == 1 ? 35 : (35 - pv * 20)),
          nodes: currentDepth * 10000,
          nps: 450000,
          timeMs: currentDepth * 30,
          pv: pv == 1 ? ['e2e4', 'e7e5', 'g1f3'] : ['d2d4', 'd7d5'],
          bestMove: 'e2e4',
        );

        if (_analysisController != null && !_analysisController!.isClosed) {
          _analysisController!.add(info);
        }
        if (!_infoController.isClosed) {
          _infoController.add(info);
        }
      }

      currentDepth++;
    });

    _analysisController!.onCancel = () {
      _searchTimer?.cancel();
    };

    return _analysisController!.stream;
  }

  @override
  Future<void> stopSearch() async {
    _searchTimer?.cancel();
    _setState(EngineState.stopping);
    await Future.delayed(const Duration(milliseconds: 10));
    _setState(EngineState.ready);
  }

  @override
  Future<void> dispose() async {
    _setState(EngineState.disposed);
    _searchTimer?.cancel();
    await _analysisController?.close();
    await _stateController.close();
    await _infoController.close();
  }
}
