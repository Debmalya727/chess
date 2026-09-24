import 'dart:async';
import 'package:stockfish_flutter_plus/stockfish_flutter_plus.dart';

import 'chess_engine.dart';
import 'models/engine_info.dart';
import 'models/engine_result.dart';
import 'models/engine_state.dart';
import 'uci_parser.dart';

class NativeStockfishService implements ChessEngine {
  Stockfish? _stockfish;
  StreamSubscription<String>? _stdoutSub;

  EngineState _state = EngineState.uninitialized;
  final _stateController = StreamController<EngineState>.broadcast();
  final _infoController = StreamController<EngineInfo>.broadcast();

  // Active search / analysis handling
  Completer<EngineResult>? _activeSearchCompleter;
  StreamController<EngineInfo>? _activeAnalysisController;
  EngineInfo? _latestInfo;

  // Serialized execution queue
  Future<void> _lastQueueOperation = Future.value();

  @override
  EngineState get state => _state;

  @override
  Stream<EngineState> get stateStream => _stateController.stream;

  @override
  Stream<EngineInfo> get infoStream => _infoController.stream;

  void _setState(EngineState newState) {
    if (_state == newState) return;
    _state = newState;
    if (!_stateController.isClosed) {
      _stateController.add(newState);
    }
  }

  /// Queues an operation to run sequentially
  Future<T> _enqueue<T>(Future<T> Function() action) {
    final completer = Completer<T>();
    _lastQueueOperation = _lastQueueOperation.then((_) async {
      try {
        final result = await action();
        completer.complete(result);
      } catch (e, st) {
        completer.completeError(e, st);
      }
    });
    return completer.future;
  }

  @override
  Future<void> initialize() => _enqueue(() async {
        if (_state != EngineState.uninitialized && _state != EngineState.error) {
          return;
        }

        _setState(EngineState.initializing);

        try {
          _stockfish = await stockfishAsync();

          final readyCompleter = Completer<void>();
          final uciCompleter = Completer<void>();

          _stdoutSub = _stockfish!.stdout.listen((line) {
            _onStdoutLine(line, uciCompleter: uciCompleter, readyCompleter: readyCompleter);
          }, onError: (err) {
            _setState(EngineState.error);
          });

          // Send UCI handshake
          _stockfish!.stdin = 'uci';
          await uciCompleter.future.timeout(
            const Duration(seconds: 5),
            onTimeout: () => throw TimeoutException('UCI handshake timeout'),
          );

          // Verify ready
          _stockfish!.stdin = 'isready';
          await readyCompleter.future.timeout(
            const Duration(seconds: 5),
            onTimeout: () => throw TimeoutException('isready timeout'),
          );

          _setState(EngineState.ready);
        } catch (e) {
          _setState(EngineState.error);
          rethrow;
        }
      });

  void _onStdoutLine(
    String line, {
    Completer<void>? uciCompleter,
    Completer<void>? readyCompleter,
  }) {
    if (UciParser.isUciOk(line)) {
      if (uciCompleter != null && !uciCompleter.isCompleted) {
        uciCompleter.complete();
      }
    }

    if (UciParser.isReadyOk(line)) {
      if (readyCompleter != null && !readyCompleter.isCompleted) {
        readyCompleter.complete();
      }
    }

    final info = UciParser.parseInfo(line);
    if (info != null) {
      _latestInfo = info;
      if (!_infoController.isClosed) {
        _infoController.add(info);
      }
      if (_activeAnalysisController != null && !_activeAnalysisController!.isClosed) {
        _activeAnalysisController!.add(info);
      }
    }

    final result = UciParser.parseBestMove(line, latestInfo: _latestInfo);
    if (result != null) {
      if (_activeSearchCompleter != null && !_activeSearchCompleter!.isCompleted) {
        _activeSearchCompleter!.complete(result);
      }
      if (_state == EngineState.searching || _state == EngineState.stopping) {
        _setState(EngineState.ready);
      }
    }
  }

  @override
  Future<void> newGame() => _enqueue(() async {
        _ensureReady();
        _stockfish!.stdin = 'ucinewgame';
        _stockfish!.stdin = 'isready';
        await _waitForReady();
      });

  @override
  Future<void> setOption(String name, String value) => _enqueue(() async {
        _ensureReady();
        _stockfish!.stdin = 'setoption name $name value $value';
      });

  @override
  Future<void> setPosition(String fen, {List<String>? moves}) => _enqueue(() async {
        _ensureReady();
        if (moves != null && moves.isNotEmpty) {
          _stockfish!.stdin = 'position fen $fen moves ${moves.join(' ')}';
        } else {
          _stockfish!.stdin = 'position fen $fen';
        }
      });

  @override
  Future<EngineResult> search({int? depth, int? moveTimeMs, int? skillLevel}) =>
      _enqueue(() async {
        _ensureReady();

        if (skillLevel != null) {
          _stockfish!.stdin = 'setoption name Skill Level value $skillLevel';
        }

        final StringBuffer goCmd = StringBuffer('go');
        if (depth != null) goCmd.write(' depth $depth');
        if (moveTimeMs != null) goCmd.write(' movetime $moveTimeMs');

        _activeSearchCompleter = Completer<EngineResult>();
        _setState(EngineState.searching);

        _stockfish!.stdin = goCmd.toString();

        return _activeSearchCompleter!.future;
      });

  @override
  Stream<EngineInfo> analyze(String fen, {int? depth, int multiPv = 1}) {
    final streamController = StreamController<EngineInfo>.broadcast();

    _enqueue(() async {
      if (_state == EngineState.searching) {
        await _internalStopSearch();
      }
      _ensureReady();

      await setOption('MultiPV', '$multiPv');
      await setPosition(fen);

      _activeAnalysisController = streamController;
      _setState(EngineState.searching);

      final StringBuffer goCmd = StringBuffer('go');
      if (depth != null) {
        goCmd.write(' depth $depth');
      } else {
        goCmd.write(' infinite');
      }

      _stockfish!.stdin = goCmd.toString();
    }).catchError((err) {
      if (!streamController.isClosed) {
        streamController.addError(err);
      }
    });

    streamController.onCancel = () {
      stopSearch();
    };

    return streamController.stream;
  }

  @override
  Future<void> stopSearch() => _enqueue(() async {
        await _internalStopSearch();
      });

  Future<void> _internalStopSearch() async {
    if (_state != EngineState.searching) return;

    _setState(EngineState.stopping);
    _stockfish?.stdin = 'stop';

    // Await bestmove or readyok with timeout
    if (_activeSearchCompleter != null && !_activeSearchCompleter!.isCompleted) {
      try {
        await _activeSearchCompleter!.future.timeout(const Duration(seconds: 2));
      } catch (_) {}
    }

    _activeSearchCompleter = null;
    _activeAnalysisController = null;
    _setState(EngineState.ready);
  }

  Future<void> _waitForReady() async {
    final completer = Completer<void>();
    late StreamSubscription sub;
    sub = _stockfish!.stdout.listen((line) {
      if (UciParser.isReadyOk(line)) {
        sub.cancel();
        if (!completer.isCompleted) completer.complete();
      }
    });
    await completer.future.timeout(
      const Duration(seconds: 3),
      onTimeout: () {
        sub.cancel();
      },
    );
  }

  void _ensureReady() {
    if (_state == EngineState.uninitialized) {
      throw StateError('Stockfish engine is not initialized');
    }
    if (_state == EngineState.disposed) {
      throw StateError('Stockfish engine has been disposed');
    }
  }

  @override
  Future<void> dispose() async {
    if (_state == EngineState.disposed) return;
    _setState(EngineState.disposed);

    try {
      if (_state == EngineState.searching) {
        _stockfish?.stdin = 'stop';
      }
      _stockfish?.dispose();
    } catch (_) {}

    await _stdoutSub?.cancel();
    _activeSearchCompleter = null;
    _activeAnalysisController = null;

    await _stateController.close();
    await _infoController.close();
  }
}
