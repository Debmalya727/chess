import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme/app_colors.dart';
import '../../chess/logic/chess_board_state.dart';
import '../../chess/models/chess_move.dart';
import '../../chess/presentation/chess_board_widget.dart';
import '../state/online_game_notifier.dart';

class OnlineGameScreen extends ConsumerStatefulWidget {
  const OnlineGameScreen({super.key});

  @override
  ConsumerState<OnlineGameScreen> createState() => _OnlineGameScreenState();
}

class _OnlineGameScreenState extends ConsumerState<OnlineGameScreen> with WidgetsBindingObserver {
  String? _selectedSquare;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(onlineGameProvider.notifier).reconnect();
    }
  }

  void _handleSquareTap(String square, ChessBoardState boardState, bool isMyTurn) {
    if (!isMyTurn) return;

    final selected = _selectedSquare;
    if (selected == null) {
      final piece = boardState.pieceAt(square);
      final myColor = ref.read(onlineGameProvider)?.myColor ?? 'w';
      if (piece != null && (piece.isWhite ? 'w' : 'b') == myColor) {
        setState(() {
          _selectedSquare = square;
        });
      }
    } else {
      if (selected == square) {
        setState(() {
          _selectedSquare = null;
        });
      } else {
        final piece = boardState.pieceAt(square);
        final fromPiece = boardState.pieceAt(selected);
        final myColor = ref.read(onlineGameProvider)?.myColor ?? 'w';
        if (piece != null && fromPiece != null && piece.color == fromPiece.color && (piece.isWhite ? 'w' : 'b') == myColor) {
          setState(() {
            _selectedSquare = square;
          });
        }
      }
    }
  }

  void _handleMove(String from, String to, String? promotion) {
    setState(() {
      _selectedSquare = null;
    });
    ref.read(onlineGameProvider.notifier).submitMove(from, to, promotion: promotion);
  }

  void _confirmResign() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Resign Game?', style: TextStyle(color: AppColors.textMain)),
        content: const Text(
          'Are you sure you want to resign this online game? This will count as a loss.',
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
              ref.read(onlineGameProvider.notifier).resign();
            },
            child: const Text('Resign'),
          ),
        ],
      ),
    );
  }

  void _confirmOfferDraw() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Offer Draw?', style: TextStyle(color: AppColors.textMain)),
        content: const Text(
          'Send a draw offer to your opponent?',
          style: TextStyle(color: AppColors.textMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: () {
              Navigator.of(ctx).pop();
              ref.read(onlineGameProvider.notifier).offerDraw();
            },
            child: const Text('Offer Draw'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final gameState = ref.watch(onlineGameProvider);

    if (gameState == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(title: const Text('Online Game')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('No active game found', style: TextStyle(color: AppColors.textMuted)),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => context.go('/online'),
                child: const Text('Return to Lobby'),
              ),
            ],
          ),
        ),
      );
    }

    final isMyTurn = gameState.isMyTurn;
    final boardState = ChessBoardState(
      fen: gameState.fen,
      turn: gameState.turn,
      isFlipped: gameState.isFlipped,
      selectedSquare: _selectedSquare,
      lastMove: (gameState.lastMoveFrom != null && gameState.lastMoveTo != null)
          ? ChessMove(from: gameState.lastMoveFrom!, to: gameState.lastMoveTo!)
          : null,
      isGameOver: gameState.isEnded,
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('Room ${gameState.roomCode}'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (gameState.isEnded) {
              ref.read(onlineGameProvider.notifier).reset();
              context.go('/online');
            } else {
              showDialog(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: AppColors.surface,
                  title: const Text('Leave Game Screen?', style: TextStyle(color: AppColors.textMain)),
                  content: const Text(
                    'The game is still in progress on the server. Your clock will keep running until you return or the game ends.',
                    style: TextStyle(color: AppColors.textMuted),
                  ),
                  actions: [
                    TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Stay')),
                    ElevatedButton(
                      onPressed: () {
                        Navigator.of(ctx).pop();
                        context.go('/online');
                      },
                      child: const Text('Leave'),
                    ),
                  ],
                ),
              );
            }
          },
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Column(
            children: [
              // Error Banner (e.g. Move Rejection)
              if (gameState.errorMessage != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.rose.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.rose),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: AppColors.rose, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          gameState.errorMessage!,
                          style: const TextStyle(color: AppColors.rose, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),

              // Incoming Draw Offer Banner
              if (gameState.drawOfferedToMe && !gameState.isEnded)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.primary),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.handshake_outlined, color: AppColors.primary, size: 20),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Opponent offered a draw',
                          style: TextStyle(color: AppColors.textMain, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ),
                      TextButton(
                        onPressed: () => ref.read(onlineGameProvider.notifier).respondDraw(false),
                        child: const Text('Decline', style: TextStyle(color: AppColors.rose)),
                      ),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald),
                        onPressed: () => ref.read(onlineGameProvider.notifier).respondDraw(true),
                        child: const Text('Accept'),
                      ),
                    ],
                  ),
                ),

              // Top Opponent Card
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: !isMyTurn && !gameState.isEnded ? AppColors.primary : AppColors.border,
                    width: !isMyTurn && !gameState.isEnded ? 1.5 : 1.0,
                  ),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 16,
                      backgroundColor: AppColors.surfaceElevated,
                      child: const Icon(Icons.person_outline, size: 18, color: AppColors.textMain),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                gameState.opponentUsername,
                                style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textMain, fontSize: 14),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: gameState.opponentConnected ? AppColors.emerald : AppColors.rose,
                                ),
                              ),
                            ],
                          ),
                          Text(
                            gameState.opponentRating != null ? '${gameState.opponentRating} Elo' : 'Unrated',
                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      key: const Key('opponent_clock'),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        gameState.opponentClockFormatted,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: AppColors.textMain,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),

              // Interactive Chessboard
              Expanded(
                child: Center(
                  child: ChessBoardWidget(
                    boardState: boardState,
                    isInteractive: isMyTurn && !gameState.isEnded,
                    onSquareTapped: (sq) => _handleSquareTap(sq, boardState, isMyTurn),
                    onMove: _handleMove,
                  ),
                ),
              ),
              const SizedBox(height: 8),

              // Bottom Player Card
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isMyTurn && !gameState.isEnded ? AppColors.emerald : AppColors.border,
                    width: isMyTurn && !gameState.isEnded ? 1.5 : 1.0,
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
                          Text(
                            gameState.myUsername,
                            style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textMain, fontSize: 14),
                          ),
                          Text(
                            '${gameState.myColor == "w" ? "White" : "Black"} • ${gameState.myRating ?? 1200} Elo',
                            style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                    if (isMyTurn && !gameState.isEnded)
                      Container(
                        margin: const EdgeInsets.only(right: 12),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.emerald.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          'Your turn',
                          style: TextStyle(color: AppColors.emerald, fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                    Container(
                      key: const Key('my_clock'),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        gameState.myClockFormatted,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: AppColors.textMain,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),

              // Game Controls or Terminal Result Card
              if (gameState.isEnded)
                Container(
                  key: const Key('game_ended_banner'),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.primary),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.emoji_events, color: AppColors.amber, size: 28),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Game Over • ${gameState.result ?? ""}',
                                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textMain, fontSize: 15),
                                ),
                                Text(
                                  gameState.termination ?? 'Game concluded',
                                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                          if (gameState.isTournamentGame)
                            ElevatedButton(
                              key: const Key('lobby_button'),
                              style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
                              onPressed: () {
                                ref.read(onlineGameProvider.notifier).reset();
                                context.go('/online');
                              },
                              child: const Text('Lobby'),
                            ),
                        ],
                      ),
                      if (!gameState.isTournamentGame) ...[
                        const SizedBox(height: 12),
                        const Divider(height: 1, color: AppColors.border),
                        const SizedBox(height: 12),
                        if (gameState.rematchOfferedToMe)
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${gameState.rematchOfferedByUsername ?? "Opponent"} offered a rematch!',
                                  style: const TextStyle(color: AppColors.textMain, fontWeight: FontWeight.w600, fontSize: 13),
                                ),
                              ),
                              OutlinedButton(
                                key: const Key('rematch_decline_button'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: AppColors.rose,
                                  side: const BorderSide(color: AppColors.rose),
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                ),
                                onPressed: () => ref.read(onlineGameProvider.notifier).respondRematch(false),
                                child: const Text('Decline'),
                              ),
                              const SizedBox(width: 8),
                              ElevatedButton(
                                key: const Key('rematch_accept_button'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.emerald,
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                ),
                                onPressed: gameState.isRematchLoading
                                    ? null
                                    : () => ref.read(onlineGameProvider.notifier).respondRematch(true),
                                child: gameState.isRematchLoading
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                      )
                                    : const Text('Accept'),
                              ),
                            ],
                          )
                        else if (gameState.rematchOfferedByMe)
                          Row(
                            children: [
                              const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.amber),
                              ),
                              const SizedBox(width: 8),
                              const Expanded(
                                child: Text(
                                  'Rematch offered... Waiting for opponent',
                                  style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                                ),
                              ),
                              OutlinedButton(
                                key: const Key('rematch_cancel_button'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: AppColors.rose,
                                  side: const BorderSide(color: AppColors.rose),
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                ),
                                onPressed: () => ref.read(onlineGameProvider.notifier).cancelRematch(),
                                child: const Text('Cancel'),
                              ),
                            ],
                          )
                        else
                          Row(
                            children: [
                              Expanded(
                                child: ElevatedButton.icon(
                                  key: const Key('rematch_button'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.emerald,
                                    padding: const EdgeInsets.symmetric(vertical: 12),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                  onPressed: gameState.isRematchLoading
                                      ? null
                                      : () => ref.read(onlineGameProvider.notifier).offerRematch(),
                                  icon: const Icon(Icons.replay, size: 18),
                                  label: gameState.isRematchLoading
                                      ? const SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                        )
                                      : const Text('Rematch'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: OutlinedButton(
                                  key: const Key('lobby_button'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: AppColors.textMain,
                                    side: const BorderSide(color: AppColors.border),
                                    padding: const EdgeInsets.symmetric(vertical: 12),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                  ),
                                  onPressed: () {
                                    ref.read(onlineGameProvider.notifier).reset();
                                    context.go('/online');
                                  },
                                  child: const Text('Lobby'),
                                ),
                              ),
                            ],
                          ),
                      ],
                    ],
                  ),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        key: const Key('offer_draw_button'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.textMain,
                          side: const BorderSide(color: AppColors.border),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: gameState.drawOfferedByMe ? null : _confirmOfferDraw,
                        icon: const Icon(Icons.handshake_outlined, size: 18),
                        label: Text(gameState.drawOfferedByMe ? 'Draw Offered' : 'Offer Draw'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        key: const Key('resign_button'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.rose,
                          side: const BorderSide(color: AppColors.rose),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: _confirmResign,
                        icon: const Icon(Icons.flag_outlined, size: 18),
                        label: const Text('Resign'),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
