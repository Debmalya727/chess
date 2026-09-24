import 'dart:math';
import 'package:flutter_riverpod/legacy.dart';
import '../../../core/protocol/ws_events.dart';
import '../../../core/websocket/ws_client.dart';
import '../../auth/state/auth_notifier.dart';
import '../models/online_clock_state.dart';
import '../models/online_game_state.dart';

class OnlineGameNotifier extends StateNotifier<OnlineGameState?> {
  final WsClient wsClient;
  final String? currentUserId;
  final List<void Function()> _unsubscribers = [];

  OnlineGameNotifier({
    required this.wsClient,
    required this.currentUserId,
    Map<String, dynamic>? initialPayload,
  }) : super(null) {
    _initSubscriptions();
    if (initialPayload != null) {
      initializeGame(initialPayload);
    }
  }

  void _initSubscriptions() {
    _unsubscribers.add(wsClient.on(WsEvents.gameInit, (payload) {
      final gameId = payload['gameId'] as String?;
      if (state == null || state!.gameId == gameId) {
        initializeGame(payload);
      }
    }));

    _unsubscribers.add(wsClient.on(WsEvents.queueMatched, (payload) {
      initializeGame(payload);
    }));

    _unsubscribers.add(wsClient.on(WsEvents.moveAccepted, (payload) {
      if (state == null) return;
      final gameId = payload['gameId'] as String?;
      if (gameId != state!.gameId) return;

      final incomingVersion = (payload['stateVersion'] as num?)?.toInt() ?? (state!.stateVersion + 1);
      if (incomingVersion <= state!.stateVersion) {
        return;
      }
      wsClient.updateStateVersion(state!.gameId, incomingVersion);

      final moveObj = payload['move'] as Map<String, dynamic>?;
      final from = moveObj?['from'] as String? ?? payload['from'] as String? ?? payload['san'] as String?;
      final to = moveObj?['to'] as String? ?? payload['to'] as String?;

      final movesList = (payload['moves'] as List<dynamic>?)?.map((m) => m.toString()).toList() ?? state!.moves;

      OnlineClockState clockState = state!.clock;
      if (payload['clocks'] is Map<String, dynamic>) {
        clockState = OnlineClockState.fromJson(payload['clocks'] as Map<String, dynamic>);
      }

      final isEnded = payload['isEnded'] as bool? ?? false;
      final result = payload['gameResult'] as String? ?? payload['result'] as String?;
      final termination = payload['termination'] as String?;

      state = state!.copyWith(
        fen: (payload['fen'] as String?) ?? state!.fen,
        turn: (payload['turn'] as String?) ?? (state!.turn == 'w' ? 'b' : 'w'),
        stateVersion: incomingVersion,
        moves: movesList,
        clock: clockState,
        lastMoveFrom: from,
        lastMoveTo: to,
        isEnded: isEnded,
        result: result,
        termination: termination,
        drawOfferedByMe: false,
        drawOfferedToMe: false,
        errorMessage: null,
      );
    }));

    _unsubscribers.add(wsClient.on(WsEvents.moveRejected, (payload) {
      if (state == null) return;
      final gameId = payload['gameId'] as String?;
      if (gameId != state!.gameId) return;

      final code = payload['code'] as String? ?? 'MOVE_REJECTED';
      final reason = payload['reason'] as String? ?? 'The server rejected this move.';

      state = state!.copyWith(errorMessage: '$code: $reason');
    }));

    _unsubscribers.add(wsClient.on(WsEvents.clockTick, (payload) {
      if (state == null) return;
      final gameId = payload['gameId'] as String?;
      if (gameId != state!.gameId) return;

      final updatedClock = OnlineClockState.fromJson(payload);
      state = state!.copyWith(clock: updatedClock);
    }));

    _unsubscribers.add(wsClient.on(WsEvents.drawOffered, (payload) {
      if (state == null) return;
      final gameId = payload['gameId'] as String?;
      if (gameId != state!.gameId) return;

      final offeredBy = payload['offeredBy'] as String?;
      if (offeredBy != currentUserId) {
        state = state!.copyWith(drawOfferedToMe: true);
      }
    }));

    _unsubscribers.add(wsClient.on(WsEvents.drawDeclined, (payload) {
      if (state == null) return;
      state = state!.copyWith(drawOfferedByMe: false);
    }));

    _unsubscribers.add(wsClient.on(WsEvents.gameEnded, (payload) {
      if (state == null) return;
      final gameId = payload['gameId'] as String?;
      if (gameId != state!.gameId) return;

      state = state!.copyWith(
        isEnded: true,
        result: payload['result'] as String?,
        termination: payload['termination'] as String?,
        fen: payload['finalFen'] as String? ?? state!.fen,
      );
    }));

    _unsubscribers.add(wsClient.on(WsEvents.playerPresence, (payload) {
      if (state == null) return;
      final playerId = payload['playerId'] as String?;
      final status = payload['status'] as String?;
      final isOpponent = (state!.myColor == 'w' && playerId == state!.blackPlayerId) ||
          (state!.myColor == 'b' && playerId == state!.whitePlayerId);

      if (isOpponent) {
        state = state!.copyWith(opponentConnected: status == 'connected');
      }
    }));
  }

  void initializeGame(Map<String, dynamic> payload) {
    final gameId = (payload['gameId'] ?? payload['id'] ?? '') as String;
    final roomCode = (payload['roomCode'] ?? '') as String;
    final fen = (payload['fen'] ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') as String;
    final turn = (payload['turn'] ?? 'w') as String;
    final timeControl = (payload['timeControl'] ?? '10+0') as String;
    final stateVersion = (payload['stateVersion'] as num?)?.toInt() ?? 1;

    // Resolve player identities and ratings
    String? whiteId;
    String? blackId;
    String whiteName = 'White';
    String blackName = 'Black';
    int? whiteRating;
    int? blackRating;

    if (payload['whitePlayer'] is Map<String, dynamic>) {
      final wp = payload['whitePlayer'] as Map<String, dynamic>;
      whiteId = wp['id'] as String?;
      whiteName = wp['username'] as String? ?? 'White';
      whiteRating = (wp['rating'] as num?)?.toInt();
    } else {
      whiteId = payload['whitePlayerId'] as String?;
      whiteName = payload['whiteUsername'] as String? ?? 'White';
      whiteRating = (payload['whiteRating'] as num?)?.toInt();
    }

    if (payload['blackPlayer'] is Map<String, dynamic>) {
      final bp = payload['blackPlayer'] as Map<String, dynamic>;
      blackId = bp['id'] as String?;
      blackName = bp['username'] as String? ?? 'Black';
      blackRating = (bp['rating'] as num?)?.toInt();
    } else {
      blackId = payload['blackPlayerId'] as String?;
      blackName = payload['blackUsername'] as String? ?? 'Black';
      blackRating = (payload['blackRating'] as num?)?.toInt();
    }

    // Determine player's assigned color
    String myColor = 'w';
    if (payload['color'] != null) {
      myColor = payload['color'] as String;
    } else if (currentUserId != null) {
      if (currentUserId == blackId) {
        myColor = 'b';
      } else {
        myColor = 'w';
      }
    }

    // Clocks
    OnlineClockState clock;
    if (payload['clocks'] is Map<String, dynamic>) {
      clock = OnlineClockState.fromJson(payload['clocks'] as Map<String, dynamic>);
    } else {
      clock = OnlineClockState.initial(600000);
    }

    final movesList = (payload['moves'] as List<dynamic>?)?.map((m) => m.toString()).toList() ?? [];

    state = OnlineGameState(
      gameId: gameId,
      roomCode: roomCode,
      status: (payload['status'] as String?) ?? 'ACTIVE',
      fen: fen,
      turn: turn,
      myColor: myColor,
      whitePlayerId: whiteId,
      blackPlayerId: blackId,
      whiteUsername: whiteName,
      blackUsername: blackName,
      whiteRating: whiteRating,
      blackRating: blackRating,
      timeControl: timeControl,
      stateVersion: stateVersion,
      moves: movesList,
      clock: clock,
    );
    wsClient.updateStateVersion(gameId, stateVersion);
  }

  void submitMove(String from, String to, {String? promotion}) {
    if (state == null || !state!.isMyTurn || state!.isEnded) return;

    final clientMoveId = 'mov_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(99999)}';

    wsClient.send(WsEvents.moveSubmit, {
      'gameId': state!.gameId,
      'from': from,
      'to': to,
      'promotion': promotion,
      'clientMoveId': clientMoveId,
      'expectedStateVersion': state!.stateVersion,
    });
  }

  void offerDraw() {
    if (state == null || state!.isEnded) return;
    state = state!.copyWith(drawOfferedByMe: true);
    wsClient.send(WsEvents.drawOffer, {'gameId': state!.gameId});
  }

  void respondDraw(bool accept) {
    if (state == null || state!.isEnded) return;
    state = state!.copyWith(drawOfferedToMe: false);
    wsClient.send(WsEvents.drawRespond, {
      'gameId': state!.gameId,
      'accept': accept,
    });
  }

  void resign() {
    if (state == null || state!.isEnded) return;
    wsClient.send(WsEvents.gameResign, {'gameId': state!.gameId});
  }

  void reconnect() {
    if (state != null && !state!.isEnded) {
      wsClient.send(WsEvents.roomJoin, {
        'gameId': state!.gameId,
        'roomCode': state!.roomCode,
      });
    }
  }

  void joinRoom({required String roomCode, String? gameId}) {
    wsClient.send(WsEvents.roomJoin, {
      'roomCode': roomCode,
      'gameId': ?gameId,
    });
  }

  void reset() {
    state = null;
  }

  @override
  void dispose() {
    for (final unsub in _unsubscribers) {
      unsub();
    }
    _unsubscribers.clear();
    super.dispose();
  }
}

final onlineGameProvider =
    StateNotifierProvider<OnlineGameNotifier, OnlineGameState?>((ref) {
  final ws = ref.watch(wsClientProvider);
  final auth = ref.watch(authNotifierProvider);
  return OnlineGameNotifier(
    wsClient: ws,
    currentUserId: auth.user?.id,
  );
});
