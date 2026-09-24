// Authoritative Game Data Models mirroring backend schemas and WS events.

class GameInitPayload {
  final String gameId;
  final String? roomCode;
  final String status;
  final String? whitePlayerId;
  final String? blackPlayerId;
  final String? whiteUsername;
  final String? blackUsername;
  final int whiteRating;
  final int blackRating;
  final String timeControl;
  final String fen;
  final String turn;
  final List<dynamic> moves;
  final ClockStateModel? clocks;
  final int stateVersion;
  final String color; // assigned color for client: 'w' or 'b'

  const GameInitPayload({
    required this.gameId,
    this.roomCode,
    required this.status,
    this.whitePlayerId,
    this.blackPlayerId,
    this.whiteUsername,
    this.blackUsername,
    this.whiteRating = 1500,
    this.blackRating = 1500,
    required this.timeControl,
    required this.fen,
    required this.turn,
    this.moves = const [],
    this.clocks,
    this.stateVersion = 1,
    this.color = 'w',
  });

  factory GameInitPayload.fromJson(Map<String, dynamic> json, {String? currentUserId}) {
    final whiteId = json['whitePlayerId'] as String? ?? (json['whitePlayer'] as Map<String, dynamic>?)?['id'];
    final blackId = json['blackPlayerId'] as String? ?? (json['blackPlayer'] as Map<String, dynamic>?)?['id'];
    final explicitColor = json['color'] as String?;
    final resolvedColor = explicitColor ?? (currentUserId != null && blackId == currentUserId ? 'b' : 'w');

    ClockStateModel? clocks;
    if (json['clocks'] != null && json['clocks'] is Map<String, dynamic>) {
      clocks = ClockStateModel.fromJson(json['clocks'] as Map<String, dynamic>);
    }

    return GameInitPayload(
      gameId: json['gameId'] as String? ?? '',
      roomCode: json['roomCode'] as String?,
      status: json['status'] as String? ?? 'ACTIVE',
      whitePlayerId: whiteId,
      blackPlayerId: blackId,
      whiteUsername: (json['whitePlayer'] as Map<String, dynamic>?)?['username'] as String? ?? json['whiteUsername'] as String? ?? 'White',
      blackUsername: (json['blackPlayer'] as Map<String, dynamic>?)?['username'] as String? ?? json['blackUsername'] as String? ?? 'Black',
      whiteRating: ((json['whitePlayer'] as Map<String, dynamic>?)?['rating'] as num?)?.toInt() ?? (json['whiteRating'] as num?)?.toInt() ?? 1500,
      blackRating: ((json['blackPlayer'] as Map<String, dynamic>?)?['rating'] as num?)?.toInt() ?? (json['blackRating'] as num?)?.toInt() ?? 1500,
      timeControl: json['timeControl'] as String? ?? '10+0',
      fen: json['fen'] as String? ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: json['turn'] as String? ?? 'w',
      moves: (json['moves'] as List<dynamic>?) ?? const [],
      clocks: clocks,
      stateVersion: (json['stateVersion'] as num?)?.toInt() ?? 1,
      color: resolvedColor,
    );
  }
}

class MoveSubmitPayload {
  final String gameId;
  final String from;
  final String to;
  final String? promotion;
  final String clientMoveId;
  final int? expectedStateVersion;

  const MoveSubmitPayload({
    required this.gameId,
    required this.from,
    required this.to,
    this.promotion,
    required this.clientMoveId,
    this.expectedStateVersion,
  });

  Map<String, dynamic> toJson() {
    return {
      'gameId': gameId,
      'from': from,
      'to': to,
      if (promotion != null) 'promotion': promotion,
      'clientMoveId': clientMoveId,
      if (expectedStateVersion != null) 'expectedStateVersion': expectedStateVersion,
    };
  }
}

class MoveAcceptedPayload {
  final String gameId;
  final String? roomCode;
  final String? clientMoveId;
  final String? san;
  final int stateVersion;
  final String fen;
  final String turn;
  final ClockStateModel? clocks;
  final bool isEnded;
  final String? gameResult;
  final String? termination;
  final bool isDuplicate;

  const MoveAcceptedPayload({
    required this.gameId,
    this.roomCode,
    this.clientMoveId,
    this.san,
    required this.stateVersion,
    required this.fen,
    required this.turn,
    this.clocks,
    this.isEnded = false,
    this.gameResult,
    this.termination,
    this.isDuplicate = false,
  });

  factory MoveAcceptedPayload.fromJson(Map<String, dynamic> json) {
    ClockStateModel? clocks;
    if (json['clocks'] != null && json['clocks'] is Map<String, dynamic>) {
      clocks = ClockStateModel.fromJson(json['clocks'] as Map<String, dynamic>);
    }

    return MoveAcceptedPayload(
      gameId: json['gameId'] as String? ?? '',
      roomCode: json['roomCode'] as String?,
      clientMoveId: json['clientMoveId'] as String?,
      san: json['san'] as String?,
      stateVersion: (json['stateVersion'] as num?)?.toInt() ?? 1,
      fen: json['fen'] as String? ?? '',
      turn: json['turn'] as String? ?? 'w',
      clocks: clocks,
      isEnded: json['isEnded'] as bool? ?? false,
      gameResult: json['gameResult'] as String?,
      termination: json['termination'] as String?,
      isDuplicate: json['isDuplicate'] as bool? ?? false,
    );
  }
}

class ClockStateModel {
  final int whiteRemainingMs;
  final int blackRemainingMs;
  final String activeColor;
  final bool isRunning;

  const ClockStateModel({
    required this.whiteRemainingMs,
    required this.blackRemainingMs,
    required this.activeColor,
    this.isRunning = true,
  });

  factory ClockStateModel.fromJson(Map<String, dynamic> json) {
    return ClockStateModel(
      whiteRemainingMs: (json['whiteRemainingMs'] as num?)?.toInt() ??
          (json['whiteTimeRemaining'] as num?)?.toInt() ??
          600000,
      blackRemainingMs: (json['blackRemainingMs'] as num?)?.toInt() ??
          (json['blackTimeRemaining'] as num?)?.toInt() ??
          600000,
      activeColor: json['activeColor'] as String? ?? 'w',
      isRunning: json['isRunning'] as bool? ?? true,
    );
  }
}

class ClockTickPayload {
  final String gameId;
  final int whiteTimeRemaining;
  final int blackTimeRemaining;
  final String activeColor;
  final int serverTime;

  const ClockTickPayload({
    required this.gameId,
    required this.whiteTimeRemaining,
    required this.blackTimeRemaining,
    required this.activeColor,
    required this.serverTime,
  });

  factory ClockTickPayload.fromJson(Map<String, dynamic> json) {
    return ClockTickPayload(
      gameId: json['gameId'] as String? ?? '',
      whiteTimeRemaining: (json['whiteTimeRemaining'] as num?)?.toInt() ?? 0,
      blackTimeRemaining: (json['blackTimeRemaining'] as num?)?.toInt() ?? 0,
      activeColor: json['activeColor'] as String? ?? 'w',
      serverTime: (json['serverTime'] as num?)?.toInt() ?? 0,
    );
  }
}

class GameEndedPayload {
  final String gameId;
  final String? roomCode;
  final String result;
  final String termination;
  final String finalFen;

  const GameEndedPayload({
    required this.gameId,
    this.roomCode,
    required this.result,
    required this.termination,
    required this.finalFen,
  });

  factory GameEndedPayload.fromJson(Map<String, dynamic> json) {
    return GameEndedPayload(
      gameId: json['gameId'] as String? ?? '',
      roomCode: json['roomCode'] as String?,
      result: json['result'] as String? ?? '*',
      termination: json['termination'] as String? ?? 'COMPLETED',
      finalFen: json['finalFen'] as String? ?? '',
    );
  }
}
