import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/theme/app_colors.dart';
import '../../chess/logic/chess_board_state.dart';
import '../../chess/models/chess_move.dart';
import '../../chess/presentation/chess_board_widget.dart';
import '../../chess/presentation/chess_clock_widget.dart';

class LocalGameScreen extends StatefulWidget {
  const LocalGameScreen({super.key});

  @override
  State<LocalGameScreen> createState() => _LocalGameScreenState();
}

class _LocalGameScreenState extends State<LocalGameScreen> {
  late ChessBoardState _boardState;
  final List<ChessMove> _moveHistory = [];
  Timer? _clockTimer;

  // 10 minutes default in ms
  static const int defaultTimeMs = 10 * 60 * 1000;
  int _whiteTimeMs = defaultTimeMs;
  int _blackTimeMs = defaultTimeMs;
  bool _isClockRunning = false;

  @override
  void initState() {
    super.initState();
    _boardState = ChessBoardState.initial();
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  void _startClockIfNeeded() {
    if (_isClockRunning || _boardState.isGameOver) return;
    _isClockRunning = true;
    _clockTimer = Timer.periodic(const Duration(milliseconds: 1000), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        if (_boardState.turn == 'w') {
          _whiteTimeMs = (_whiteTimeMs - 1000).clamp(0, defaultTimeMs * 10);
          if (_whiteTimeMs == 0) {
            _clockTimer?.cancel();
            _isClockRunning = false;
            _boardState = _boardState.copyWith(
              isGameOver: true,
              gameStatusMessage: 'Black wins on time!',
            );
          }
        } else {
          _blackTimeMs = (_blackTimeMs - 1000).clamp(0, defaultTimeMs * 10);
          if (_blackTimeMs == 0) {
            _clockTimer?.cancel();
            _isClockRunning = false;
            _boardState = _boardState.copyWith(
              isGameOver: true,
              gameStatusMessage: 'White wins on time!',
            );
          }
        }
      });
    });
  }

  void _handleSquareTap(String square) {
    if (_boardState.isGameOver) return;

    final selected = _boardState.selectedSquare;
    if (selected == null) {
      final piece = _boardState.pieceAt(square);
      if (piece != null) {
        // Can only select pieces of the current turn's color
        final isTurnPiece = (_boardState.turn == 'w' && piece.isWhite) ||
            (_boardState.turn == 'b' && piece.isBlack);
        if (isTurnPiece) {
          setState(() {
            _boardState = _boardState.copyWith(selectedSquare: square);
          });
        }
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
    if (_boardState.isGameOver) return;

    _startClockIfNeeded();

    final move = ChessMove(from: from, to: to, promotion: promotion);
    setState(() {
      _boardState = _boardState.applyMove(from, to, promotion: promotion);
      _moveHistory.add(move);
    });
  }

  void _flipBoard() {
    setState(() {
      _boardState = _boardState.copyWith(isFlipped: !_boardState.isFlipped);
    });
  }

  void _resetGame() {
    _clockTimer?.cancel();
    setState(() {
      _boardState = ChessBoardState.initial(isFlipped: _boardState.isFlipped);
      _moveHistory.clear();
      _whiteTimeMs = defaultTimeMs;
      _blackTimeMs = defaultTimeMs;
      _isClockRunning = false;
    });
  }

  void _showResetConfirmation() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('New Game?', style: TextStyle(color: AppColors.textMain)),
        content: const Text(
          'Are you sure you want to reset the current board and timers?',
          style: TextStyle(color: AppColors.textMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: () {
              Navigator.of(ctx).pop();
              _resetGame();
            },
            child: const Text('Reset Board'),
          ),
        ],
      ),
    );
  }

  void _handleResign() {
    if (_boardState.isGameOver) return;
    final winner = _boardState.turn == 'w' ? 'Black' : 'White';
    final resigned = _boardState.turn == 'w' ? 'White' : 'Black';

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Resign Game?', style: const TextStyle(color: AppColors.textMain)),
        content: Text(
          '$resigned will resign. $winner wins.',
          style: const TextStyle(color: AppColors.textMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.rose),
            onPressed: () {
              Navigator.of(ctx).pop();
              _clockTimer?.cancel();
              setState(() {
                _boardState = _boardState.copyWith(
                  isGameOver: true,
                  gameStatusMessage: '$resigned resigned. $winner wins!',
                );
              });
            },
            child: const Text('Resign'),
          ),
        ],
      ),
    );
  }

  void _handleDraw() {
    if (_boardState.isGameOver) return;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Declare Draw?', style: TextStyle(color: AppColors.textMain)),
        content: const Text(
          'Both players agree to end this game in a draw.',
          style: TextStyle(color: AppColors.textMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: () {
              Navigator.of(ctx).pop();
              _clockTimer?.cancel();
              setState(() {
                _boardState = _boardState.copyWith(
                  isGameOver: true,
                  gameStatusMessage: 'Game drawn by agreement.',
                );
              });
            },
            child: const Text('Agree Draw'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final topPlayerIsBlack = !_boardState.isFlipped;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Local 2-Player Chess'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flip_camera_android),
            tooltip: 'Flip Board',
            onPressed: _flipBoard,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'New Game',
            onPressed: _showResetConfirmation,
          ),
        ],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isLandscape = constraints.maxWidth > constraints.maxHeight && constraints.maxWidth > 600;

            if (isLandscape) {
              // Tablet / Landscape layout: Board on left, controls & move history on right
              return Row(
                children: [
                  Expanded(
                    flex: 6,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _buildClockRow(isTop: true, isBlack: topPlayerIsBlack),
                          const SizedBox(height: 8),
                          Expanded(
                            child: ChessBoardWidget(
                              boardState: _boardState,
                              onSquareTapped: _handleSquareTap,
                              onMove: _handleMove,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _buildClockRow(isTop: false, isBlack: !topPlayerIsBlack),
                        ],
                      ),
                    ),
                  ),
                  Container(width: 1, color: AppColors.border),
                  Expanded(
                    flex: 4,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: _buildSidePanel(),
                    ),
                  ),
                ],
              );
            }

            // Portrait layout: Top clock -> Board -> Bottom clock -> Action row & Moves
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Column(
                children: [
                  _buildClockRow(isTop: true, isBlack: topPlayerIsBlack),
                  const SizedBox(height: 8),
                  Expanded(
                    child: Center(
                      child: ChessBoardWidget(
                        boardState: _boardState,
                        onSquareTapped: _handleSquareTap,
                        onMove: _handleMove,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  _buildClockRow(isTop: false, isBlack: !topPlayerIsBlack),
                  const SizedBox(height: 10),
                  _buildActionBar(),
                  const SizedBox(height: 6),
                  _buildMoveHistoryBar(),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildClockRow({required bool isTop, required bool isBlack}) {
    final playerName = isBlack ? 'Black' : 'White';
    final isTurn = (_boardState.turn == 'b' && isBlack) || (_boardState.turn == 'w' && !isBlack);
    final timeMs = isBlack ? _blackTimeMs : _whiteTimeMs;

    return ChessClockWidget(
      playerName: playerName,
      timeRemainingMs: timeMs,
      isActive: isTurn && !_boardState.isGameOver,
      isWhite: !isBlack,
    );
  }

  Widget _buildActionBar() {
    if (_boardState.isGameOver) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
        ),
        child: Column(
          children: [
            Text(
              _boardState.gameStatusMessage ?? 'Game Over',
              style: const TextStyle(
                color: AppColors.textMain,
                fontWeight: FontWeight.bold,
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size(140, 36),
              ),
              onPressed: _resetGame,
              child: const Text('Play Again'),
            ),
          ],
        ),
      );
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.textMuted,
            side: const BorderSide(color: AppColors.border),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          ),
          onPressed: _handleDraw,
          icon: const Icon(Icons.handshake_outlined, size: 18),
          label: const Text('Draw'),
        ),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.rose,
            side: BorderSide(color: AppColors.rose.withValues(alpha: 0.3)),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          ),
          onPressed: _handleResign,
          icon: const Icon(Icons.flag_outlined, size: 18),
          label: const Text('Resign'),
        ),
      ],
    );
  }

  Widget _buildMoveHistoryBar() {
    if (_moveHistory.isEmpty) {
      return const SizedBox(
        height: 28,
        child: Center(
          child: Text(
            'Offline 2-Player Pass & Play',
            style: TextStyle(fontSize: 12, color: AppColors.textDisabled),
          ),
        ),
      );
    }

    return SizedBox(
      height: 36,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: (_moveHistory.length / 2).ceil(),
        itemBuilder: (context, index) {
          final moveNum = index + 1;
          final whiteIdx = index * 2;
          final blackIdx = whiteIdx + 1;
          final whiteMove = _moveHistory[whiteIdx].uci;
          final blackMove = blackIdx < _moveHistory.length ? _moveHistory[blackIdx].uci : '';

          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Chip(
              backgroundColor: AppColors.surfaceElevated,
              padding: EdgeInsets.zero,
              labelPadding: const EdgeInsets.symmetric(horizontal: 8),
              label: Text(
                '$moveNum. $whiteMove $blackMove',
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSidePanel() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Move Notation',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: AppColors.textMain,
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.border),
            ),
            child: _moveHistory.isEmpty
                ? const Center(
                    child: Text(
                      'No moves played yet',
                      style: TextStyle(color: AppColors.textDisabled),
                    ),
                  )
                : ListView.builder(
                    itemCount: (_moveHistory.length / 2).ceil(),
                    itemBuilder: (context, index) {
                      final moveNum = index + 1;
                      final whiteIdx = index * 2;
                      final blackIdx = whiteIdx + 1;
                      final whiteMove = _moveHistory[whiteIdx].uci;
                      final blackMove =
                          blackIdx < _moveHistory.length ? _moveHistory[blackIdx].uci : '';

                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 32,
                              child: Text(
                                '$moveNum.',
                                style: const TextStyle(
                                  color: AppColors.textDisabled,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            Expanded(
                              child: Text(
                                whiteMove,
                                style: const TextStyle(color: AppColors.textMain),
                              ),
                            ),
                            Expanded(
                              child: Text(
                                blackMove,
                                style: const TextStyle(color: AppColors.textMuted),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ),
        const SizedBox(height: 16),
        _buildActionBar(),
      ],
    );
  }
}
