import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../../../core/engine/chess_engine.dart';
import '../../../core/engine/engine_service_provider.dart';
import '../../../core/engine/models/engine_info.dart';
import '../../chess/logic/chess_board_state.dart';
import '../../chess/presentation/chess_board_widget.dart';
import 'widgets/eval_bar_widget.dart';

class AnalysisScreen extends ConsumerStatefulWidget {
  const AnalysisScreen({super.key});

  @override
  ConsumerState<AnalysisScreen> createState() => _AnalysisScreenState();
}

class _AnalysisScreenState extends ConsumerState<AnalysisScreen> with WidgetsBindingObserver {
  late ChessBoardState _boardState;
  final List<ChessBoardState> _historyStates = [];
  int _historyIndex = 0;

  late ChessEngine _engine;
  StreamSubscription<EngineInfo>? _analysisSubscription;
  final Map<int, EngineInfo> _multiPvInfos = {};
  EngineInfo? _primaryInfo;

  int _multiPv = 1;
  int _targetDepth = 18;
  bool _isAnalyzing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _boardState = ChessBoardState.initial();
    _historyStates.add(_boardState);
    _historyIndex = 0;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initEngineAndAnalyze();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _analysisSubscription?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      _stopAnalysis();
    } else if (state == AppLifecycleState.resumed) {
      _startAnalysis();
    }
  }

  Future<void> _initEngineAndAnalyze() async {
    _engine = ref.read(analysisEngineProvider);
    await _engine.initialize();
    _startAnalysis();
  }

  void _startAnalysis() {
    _analysisSubscription?.cancel();
    _multiPvInfos.clear();
    setState(() {
      _isAnalyzing = true;
      _primaryInfo = null;
    });

    final stream = _engine.analyze(
      _boardState.fen,
      depth: _targetDepth,
      multiPv: _multiPv,
    );

    _analysisSubscription = stream.listen((info) {
      if (!mounted) return;
      setState(() {
        _multiPvInfos[info.multiPv] = info;
        if (info.multiPv == 1) {
          _primaryInfo = info;
        }
      });
    }, onError: (_) {
      if (mounted) {
        setState(() {
          _isAnalyzing = false;
        });
      }
    });
  }

  Future<void> _stopAnalysis() async {
    await _analysisSubscription?.cancel();
    await _engine.stopSearch();
    if (mounted) {
      setState(() {
        _isAnalyzing = false;
      });
    }
  }

  void _toggleAnalysis() {
    if (_isAnalyzing) {
      _stopAnalysis();
    } else {
      _startAnalysis();
    }
  }

  void _handleSquareTap(String square) {
    final selected = _boardState.selectedSquare;
    if (selected == null) {
      if (_boardState.pieceAt(square) != null) {
        setState(() {
          _boardState = _boardState.copyWith(selectedSquare: square);
        });
      }
    } else {
      if (selected == square) {
        setState(() {
          _boardState = _boardState.copyWith(clearSelection: true);
        });
      } else {
        final piece = _boardState.pieceAt(square);
        final fromPiece = _boardState.pieceAt(selected);
        if (piece != null && fromPiece != null && piece.color == fromPiece.color) {
          setState(() {
            _boardState = _boardState.copyWith(selectedSquare: square);
          });
        }
      }
    }
  }

  void _handleMove(String from, String to, String? promotion) {
    final newState = _boardState.applyMove(from, to, promotion: promotion);

    // Truncate future history if move played from a previous position
    if (_historyIndex < _historyStates.length - 1) {
      _historyStates.removeRange(_historyIndex + 1, _historyStates.length);
    }
    _historyStates.add(newState);
    _historyIndex = _historyStates.length - 1;

    setState(() {
      _boardState = newState;
    });

    _startAnalysis();
  }

  void _goToHistory(int index) {
    if (index < 0 || index >= _historyStates.length || index == _historyIndex) return;

    setState(() {
      _historyIndex = index;
      _boardState = _historyStates[_historyIndex];
    });

    _startAnalysis();
  }

  void _flipBoard() {
    setState(() {
      _boardState = _boardState.copyWith(isFlipped: !_boardState.isFlipped);
    });
  }

  void _resetBoard() {
    final initial = ChessBoardState.initial(isFlipped: _boardState.isFlipped);
    _historyStates.clear();
    _historyStates.add(initial);
    _historyIndex = 0;

    setState(() {
      _boardState = initial;
    });

    _startAnalysis();
  }

  void _showFenDialog() {
    final controller = TextEditingController(text: _boardState.fen);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Load FEN', style: TextStyle(color: AppColors.textMain)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Paste a valid FEN string below:',
              style: TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: controller,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.textMain),
              decoration: const InputDecoration(
                hintText: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: () {
              final newFen = controller.text.trim();
              if (newFen.split(' ').length >= 2) {
                Navigator.of(ctx).pop();
                _loadCustomFen(newFen);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Invalid FEN format: requires at least piece placement and turn')),
                );
              }
            },
            child: const Text('Load'),
          ),
        ],
      ),
    );
  }

  void _loadCustomFen(String fen) {
    final turn = fen.split(' ')[1];
    final customState = ChessBoardState(
      fen: fen,
      turn: turn,
      isFlipped: _boardState.isFlipped,
    );

    _historyStates.clear();
    _historyStates.add(customState);
    _historyIndex = 0;

    setState(() {
      _boardState = customState;
    });

    _startAnalysis();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Stockfish 18 Analysis'),
        actions: [
          IconButton(
            icon: Icon(_isAnalyzing ? Icons.pause_circle_outline : Icons.play_circle_outline),
            tooltip: _isAnalyzing ? 'Pause Analysis' : 'Start Analysis',
            onPressed: _toggleAnalysis,
          ),
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: 'Settings (Multi-PV)',
            onPressed: _showSettingsDialog,
          ),
          IconButton(
            icon: const Icon(Icons.flip_camera_android),
            tooltip: 'Flip Board',
            onPressed: _flipBoard,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Reset Board',
            onPressed: _resetBoard,
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Column(
            children: [
              // Engine Status Banner
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Icon(
                      _isAnalyzing ? Icons.insights : Icons.pause_circle_filled,
                      color: _isAnalyzing ? const Color(0xFF38BDF8) : AppColors.textMuted,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _isAnalyzing
                            ? 'Depth: ${_primaryInfo?.depth ?? 0}/$_targetDepth • Eval: ${_primaryInfo?.formattedScore ?? "0.00"} • MultiPV: $_multiPv'
                            : 'Analysis Paused • MultiPV: $_multiPv',
                        style: const TextStyle(fontSize: 12, color: AppColors.textMain, fontWeight: FontWeight.bold),
                      ),
                    ),
                    if (_isAnalyzing)
                      const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF38BDF8)),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),

              // Board & EvalBar Layout
              Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Visual EvalBar
                    EvalBarWidget(
                      info: _primaryInfo,
                      turn: _boardState.turn,
                      isFlipped: _boardState.isFlipped,
                    ),
                    const SizedBox(width: 8),

                    // Chess Board Widget
                    Expanded(
                      child: Center(
                        child: ChessBoardWidget(
                          boardState: _boardState,
                          onSquareTapped: _handleSquareTap,
                          onMove: _handleMove,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),

              // Navigation & Move Controls
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  IconButton(
                    icon: const Icon(Icons.first_page),
                    color: _historyIndex > 0 ? AppColors.textMain : AppColors.textDisabled,
                    onPressed: _historyIndex > 0 ? () => _goToHistory(0) : null,
                  ),
                  IconButton(
                    icon: const Icon(Icons.chevron_left),
                    color: _historyIndex > 0 ? AppColors.textMain : AppColors.textDisabled,
                    onPressed: _historyIndex > 0 ? () => _goToHistory(_historyIndex - 1) : null,
                  ),
                  Text(
                    '${_historyIndex + 1} / ${_historyStates.length}',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13, fontWeight: FontWeight.bold),
                  ),
                  IconButton(
                    icon: const Icon(Icons.chevron_right),
                    color: _historyIndex < _historyStates.length - 1 ? AppColors.textMain : AppColors.textDisabled,
                    onPressed: _historyIndex < _historyStates.length - 1
                        ? () => _goToHistory(_historyIndex + 1)
                        : null,
                  ),
                  IconButton(
                    icon: const Icon(Icons.last_page),
                    color: _historyIndex < _historyStates.length - 1 ? AppColors.textMain : AppColors.textDisabled,
                    onPressed: _historyIndex < _historyStates.length - 1
                        ? () => _goToHistory(_historyStates.length - 1)
                        : null,
                  ),
                ],
              ),
              const SizedBox(height: 4),

              // Multi-PV Lines Display
              Container(
                height: 72,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.border),
                ),
                child: ListView(
                  children: List.generate(_multiPv, (idx) {
                    final pvNumber = idx + 1;
                    final info = _multiPvInfos[pvNumber];
                    final score = info?.formattedScore ?? '--';
                    final moves = info?.pv.take(5).join(' ') ?? 'Calculating...';

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceElevated,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              score,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF38BDF8),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              moves,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 11,
                                color: AppColors.textMuted,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ),
              ),
              const SizedBox(height: 6),

              // FEN Display & Actions
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _boardState.fen,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 10,
                          color: AppColors.textMuted,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    InkWell(
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: _boardState.fen));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('FEN copied to clipboard')),
                        );
                      },
                      child: const Icon(Icons.copy, size: 16, color: AppColors.textMuted),
                    ),
                    const SizedBox(width: 10),
                    InkWell(
                      onTap: _showFenDialog,
                      child: const Icon(Icons.edit_note, size: 18, color: AppColors.primary),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSettingsDialog() {
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: const Text('Engine Analysis Settings', style: TextStyle(color: AppColors.textMain)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Multi-PV (Lines)', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.textMain)),
              const SizedBox(height: 8),
              SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 1, label: Text('1 Line')),
                  ButtonSegment(value: 2, label: Text('2 Lines')),
                  ButtonSegment(value: 3, label: Text('3 Lines')),
                ],
                selected: {_multiPv},
                onSelectionChanged: (val) {
                  setDialogState(() => _multiPv = val.first);
                  setState(() => _multiPv = val.first);
                },
              ),
              const SizedBox(height: 16),
              Text('Target Depth: $_targetDepth', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textMain)),
              Slider(
                value: _targetDepth.toDouble(),
                min: 10,
                max: 25,
                divisions: 15,
                label: '$_targetDepth',
                onChanged: (val) {
                  setDialogState(() => _targetDepth = val.round());
                  setState(() => _targetDepth = val.round());
                },
              ),
            ],
          ),
          actions: [
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
              onPressed: () {
                Navigator.of(ctx).pop();
                _startAnalysis();
              },
              child: const Text('Apply'),
            ),
          ],
        ),
      ),
    );
  }
}
