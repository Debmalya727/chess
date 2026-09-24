import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../../../core/engine/chess_engine.dart';
import '../../../core/engine/engine_service_provider.dart';
import '../../../core/engine/models/engine_difficulty.dart';
import '../../chess/logic/chess_board_state.dart';
import '../../chess/models/chess_move.dart';
import '../../chess/presentation/chess_board_widget.dart';

class ComputerScreen extends ConsumerStatefulWidget {
  const ComputerScreen({super.key});

  @override
  ConsumerState<ComputerScreen> createState() => _ComputerScreenState();
}

class _ComputerScreenState extends ConsumerState<ComputerScreen> with WidgetsBindingObserver {
  int _selectedLevel = 3;
  String _selectedColor = 'white';

  bool _gameStarted = false;
  late ChessEngine _engine;
  late ChessBoardState _boardState;
  final List<ChessMove> _moveHistory = [];
  bool _isComputerThinking = false;
  String? _computerColor; // 'w' or 'b'
  String? _humanColor; // 'w' or 'b'

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _boardState = ChessBoardState.initial();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      if (_gameStarted && _isComputerThinking) {
        _engine.stopSearch();
      }
    }
  }

  Future<void> _startGame() async {
    _engine = ref.read(computerEngineProvider);
    await _engine.initialize();
    await _engine.newGame();

    // Determine colors
    String human;
    if (_selectedColor == 'random') {
      human = Random().nextBool() ? 'w' : 'b';
    } else {
      human = _selectedColor == 'white' ? 'w' : 'b';
    }
    final computer = human == 'w' ? 'b' : 'w';
    final isFlipped = human == 'b';

    setState(() {
      _humanColor = human;
      _computerColor = computer;
      _gameStarted = true;
      _moveHistory.clear();
      _boardState = ChessBoardState.initial(isFlipped: isFlipped);
      _isComputerThinking = false;
    });

    // If computer plays white, it makes the first move
    if (_computerColor == 'w') {
      _triggerComputerMove();
    }
  }

  Future<void> _triggerComputerMove() async {
    if (!_gameStarted || !mounted) return;

    setState(() {
      _isComputerThinking = true;
    });

    try {
      final difficulty = EngineDifficulty.fromLevel(_selectedLevel);
      await _engine.setOption('Skill Level', '${difficulty.skillLevel}');

      final uciMoves = _moveHistory.map((m) => m.uci).toList();
      await _engine.setPosition(ChessBoardState.initialFen, moves: uciMoves);

      final result = await _engine.search(
        depth: difficulty.depth,
        moveTimeMs: difficulty.moveTimeMs,
        skillLevel: difficulty.skillLevel,
      );

      if (!mounted || !_gameStarted) return;

      final best = result.bestMove;
      if (best.length >= 4) {
        final from = best.substring(0, 2);
        final to = best.substring(2, 4);
        final promo = best.length > 4 ? best[4] : null;

        setState(() {
          _boardState = _boardState.applyMove(from, to, promotion: promo);
          _moveHistory.add(ChessMove(from: from, to: to, promotion: promo));
          _isComputerThinking = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isComputerThinking = false;
        });
      }
    }
  }

  void _handleSquareTap(String square) {
    if (_isComputerThinking) return;
    if (_boardState.turn != _humanColor) return;

    final selected = _boardState.selectedSquare;
    if (selected == null) {
      final piece = _boardState.pieceAt(square);
      if (piece != null && (piece.isWhite ? 'w' : 'b') == _humanColor) {
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

  void _handleHumanMove(String from, String to, String? promotion) {
    if (_isComputerThinking) return;
    if (_boardState.turn != _humanColor) return;

    setState(() {
      _boardState = _boardState.applyMove(from, to, promotion: promotion);
      _moveHistory.add(ChessMove(from: from, to: to, promotion: promotion));
    });

    if (!_boardState.isGameOver && _boardState.turn == _computerColor) {
      _triggerComputerMove();
    }
  }

  void _resign() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Resign Game?', style: TextStyle(color: AppColors.textMain)),
        content: const Text(
          'Are you sure you want to resign against the computer?',
          style: TextStyle(color: AppColors.textMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.rose),
            onPressed: () {
              Navigator.of(ctx).pop();
              setState(() {
                _gameStarted = false;
              });
            },
            child: const Text('Resign'),
          ),
        ],
      ),
    );
  }

  void _restart() {
    _engine.stopSearch();
    _startGame();
  }

  @override
  Widget build(BuildContext context) {
    if (!_gameStarted) {
      return _buildSetupView();
    }
    return _buildGameView();
  }

  Widget _buildSetupView() {
    final difficulty = EngineDifficulty.fromLevel(_selectedLevel);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Play Computer'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Strict Fair-Play Banner
            Container(
              key: const Key('fairplay_banner'),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.verified_user_outlined, color: AppColors.amber, size: 22),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'Strict Fair-Play Invariant',
                          style: TextStyle(
                            color: AppColors.textMain,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'No engine evaluations, best-move arrows, or evaluation bars are exposed during games. Stockfish operates solely on the computer’s turn.',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            const Text(
              'Select Difficulty',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.textMain,
              ),
            ),
            const SizedBox(height: 12),

            ...EngineDifficulty.all.map((diff) {
              final isSelected = _selectedLevel == diff.level;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  key: Key('difficulty_level_${diff.level}'),
                  onTap: () => setState(() => _selectedLevel = diff.level),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppColors.primary.withValues(alpha: 0.15)
                          : AppColors.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? AppColors.primary : AppColors.border,
                        width: isSelected ? 1.5 : 1.0,
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: isSelected ? AppColors.primary : AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                '${diff.level}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  diff.label,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: isSelected ? AppColors.textMain : AppColors.textMuted,
                                  ),
                                ),
                                Text(
                                  '~${diff.estimatedElo} Elo • Depth ${diff.depth}',
                                  style: const TextStyle(fontSize: 12, color: AppColors.textDisabled),
                                ),
                              ],
                            ),
                          ],
                        ),
                        if (isSelected)
                          const Icon(Icons.check_circle, color: AppColors.primary, size: 20),
                      ],
                    ),
                  ),
                ),
              );
            }),

            const SizedBox(height: 16),
            const Text(
              'Play As',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.textMain,
              ),
            ),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'white', label: Text('White')),
                ButtonSegment(value: 'random', label: Text('Random')),
                ButtonSegment(value: 'black', label: Text('Black')),
              ],
              selected: {_selectedColor},
              onSelectionChanged: (val) => setState(() => _selectedColor = val.first),
            ),

            const SizedBox(height: 24),
            ElevatedButton(
              key: const Key('start_game_button'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size(double.infinity, 50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: _startGame,
              child: Text(
                'Play vs ${difficulty.label} (~${difficulty.estimatedElo} Elo)',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGameView() {
    final diff = EngineDifficulty.fromLevel(_selectedLevel);
    final isComputerTurn = _boardState.turn == _computerColor;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('vs Stockfish ${diff.label}'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            _engine.stopSearch();
            setState(() {
              _gameStarted = false;
            });
          },
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Restart',
            onPressed: _restart,
          ),
          IconButton(
            icon: const Icon(Icons.flag_outlined),
            tooltip: 'Resign',
            onPressed: _resign,
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Column(
            children: [
              // Top Player Card (Computer)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isComputerTurn ? AppColors.primary : AppColors.border,
                    width: isComputerTurn ? 1.5 : 1.0,
                  ),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: AppColors.surfaceElevated,
                      child: const Icon(Icons.smart_toy, size: 18, color: AppColors.primary),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Stockfish (Level ${diff.level})',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: AppColors.textMain,
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            '~${diff.estimatedElo} Elo',
                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                    if (_isComputerThinking)
                      Row(
                        key: const Key('computer_thinking_indicator'),
                        children: const [
                          SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.primary,
                            ),
                          ),
                          SizedBox(width: 8),
                          Text(
                            'Thinking...',
                            style: TextStyle(
                              color: AppColors.primary,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),

              // Interactive Chess Board
              Expanded(
                child: Center(
                  child: ChessBoardWidget(
                    boardState: _boardState,
                    isInteractive: !_isComputerThinking && _boardState.turn == _humanColor,
                    onSquareTapped: _handleSquareTap,
                    onMove: _handleHumanMove,
                  ),
                ),
              ),
              const SizedBox(height: 8),

              // Bottom Player Card (Human)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: !isComputerTurn ? AppColors.emerald : AppColors.border,
                    width: !isComputerTurn ? 1.5 : 1.0,
                  ),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: AppColors.surfaceElevated,
                      child: const Icon(Icons.person, size: 18, color: AppColors.emerald),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'You',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: AppColors.textMain,
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            _humanColor == 'w' ? 'White' : 'Black',
                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                    if (!isComputerTurn && !_boardState.isGameOver)
                      const Text(
                        'Your turn',
                        style: TextStyle(
                          color: AppColors.emerald,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
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
}
