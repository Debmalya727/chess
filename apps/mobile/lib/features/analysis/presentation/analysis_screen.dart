import 'package:flutter/material.dart';
import '../../../app/theme/app_colors.dart';
import '../../chess/logic/chess_board_state.dart';
import '../../chess/presentation/chess_board_widget.dart';

class AnalysisScreen extends StatefulWidget {
  const AnalysisScreen({super.key});

  @override
  State<AnalysisScreen> createState() => _AnalysisScreenState();
}

class _AnalysisScreenState extends State<AnalysisScreen> {
  late ChessBoardState _boardState;

  @override
  void initState() {
    super.initState();
    _boardState = ChessBoardState.initial();
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
    setState(() {
      _boardState = _boardState.applyMove(from, to, promotion: promotion);
    });
  }

  void _flipBoard() {
    setState(() {
      _boardState = _boardState.copyWith(isFlipped: !_boardState.isFlipped);
    });
  }

  void _resetBoard() {
    setState(() {
      _boardState = ChessBoardState.initial(isFlipped: _boardState.isFlipped);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Analysis Board'),
        actions: [
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
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Column(
            children: [
              // Engine Status Banner (Engine permitted here)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: const [
                    Icon(Icons.insights, color: Color(0xFF38BDF8), size: 20),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Stockfish Analysis Enabled • Depth: 18 • Eval: +0.2',
                        style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                      ),
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
                    onSquareTapped: _handleSquareTap,
                    onMove: _handleMove,
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Navigation & Move Controls
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  IconButton(
                    icon: const Icon(Icons.first_page),
                    color: AppColors.textMuted,
                    onPressed: _resetBoard,
                  ),
                  IconButton(
                    icon: const Icon(Icons.chevron_left),
                    color: AppColors.textMuted,
                    onPressed: () {},
                  ),
                  IconButton(
                    icon: const Icon(Icons.chevron_right),
                    color: AppColors.textMuted,
                    onPressed: () {},
                  ),
                  IconButton(
                    icon: const Icon(Icons.last_page),
                    color: AppColors.textMuted,
                    onPressed: () {},
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // FEN Display
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
                          fontSize: 11,
                          color: AppColors.textMuted,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    InkWell(
                      onTap: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('FEN copied to clipboard')),
                        );
                      },
                      child: const Icon(Icons.copy, size: 16, color: AppColors.textMuted),
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
