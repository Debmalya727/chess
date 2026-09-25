import 'online_clock_state.dart';

class OnlineGameState {
  final String gameId;
  final String roomCode;
  final String status;
  final String fen;
  final String turn; // 'w' or 'b'
  final String myColor; // 'w' or 'b'
  final String? whitePlayerId;
  final String? blackPlayerId;
  final String whiteUsername;
  final String blackUsername;
  final int? whiteRating;
  final int? blackRating;
  final String timeControl;
  final int stateVersion;
  final List<String> moves;
  final OnlineClockState clock;
  final bool isEnded;
  final String? result;
  final String? termination;
  final bool drawOfferedByMe;
  final bool drawOfferedToMe;
  final bool rematchOfferedByMe;
  final bool rematchOfferedToMe;
  final String? rematchOfferedByUsername;
  final bool isRematchLoading;
  final String? tournamentId;
  final bool opponentConnected;
  final String? lastMoveFrom;
  final String? lastMoveTo;
  final String? errorMessage;

  const OnlineGameState({
    required this.gameId,
    required this.roomCode,
    this.status = 'ACTIVE',
    required this.fen,
    this.turn = 'w',
    this.myColor = 'w',
    this.whitePlayerId,
    this.blackPlayerId,
    this.whiteUsername = 'White',
    this.blackUsername = 'Black',
    this.whiteRating,
    this.blackRating,
    this.timeControl = '10+0',
    this.stateVersion = 1,
    this.moves = const [],
    required this.clock,
    this.isEnded = false,
    this.result,
    this.termination,
    this.drawOfferedByMe = false,
    this.drawOfferedToMe = false,
    this.rematchOfferedByMe = false,
    this.rematchOfferedToMe = false,
    this.rematchOfferedByUsername,
    this.isRematchLoading = false,
    this.tournamentId,
    this.opponentConnected = true,
    this.lastMoveFrom,
    this.lastMoveTo,
    this.errorMessage,
  });

  bool get isMyTurn => !isEnded && turn == myColor;
  bool get isFlipped => myColor == 'b';
  bool get isOngoing => !isEnded && (status == 'ACTIVE' || status == 'READY');
  int get moveCount => moves.length;
  bool get isTournamentGame => tournamentId != null && tournamentId!.isNotEmpty;

  String get myUsername => myColor == 'w' ? whiteUsername : blackUsername;
  String get opponentUsername => myColor == 'w' ? blackUsername : whiteUsername;
  String get opponentName => opponentUsername;

  int? get myRating => myColor == 'w' ? whiteRating : blackRating;
  int? get opponentRating => myColor == 'w' ? blackRating : whiteRating;

  String get myClockFormatted =>
      myColor == 'w' ? clock.formattedWhite : clock.formattedBlack;
  String get opponentClockFormatted =>
      myColor == 'w' ? clock.formattedBlack : clock.formattedWhite;

  OnlineGameState copyWith({
    String? gameId,
    String? roomCode,
    String? status,
    String? fen,
    String? turn,
    String? myColor,
    String? whitePlayerId,
    String? blackPlayerId,
    String? whiteUsername,
    String? blackUsername,
    int? whiteRating,
    int? blackRating,
    String? timeControl,
    int? stateVersion,
    List<String>? moves,
    OnlineClockState? clock,
    bool? isEnded,
    String? result,
    String? termination,
    bool? drawOfferedByMe,
    bool? drawOfferedToMe,
    bool? rematchOfferedByMe,
    bool? rematchOfferedToMe,
    String? rematchOfferedByUsername,
    bool? isRematchLoading,
    String? tournamentId,
    bool? opponentConnected,
    String? lastMoveFrom,
    String? lastMoveTo,
    String? errorMessage,
  }) {
    return OnlineGameState(
      gameId: gameId ?? this.gameId,
      roomCode: roomCode ?? this.roomCode,
      status: status ?? this.status,
      fen: fen ?? this.fen,
      turn: turn ?? this.turn,
      myColor: myColor ?? this.myColor,
      whitePlayerId: whitePlayerId ?? this.whitePlayerId,
      blackPlayerId: blackPlayerId ?? this.blackPlayerId,
      whiteUsername: whiteUsername ?? this.whiteUsername,
      blackUsername: blackUsername ?? this.blackUsername,
      whiteRating: whiteRating ?? this.whiteRating,
      blackRating: blackRating ?? this.blackRating,
      timeControl: timeControl ?? this.timeControl,
      stateVersion: stateVersion ?? this.stateVersion,
      moves: moves ?? this.moves,
      clock: clock ?? this.clock,
      isEnded: isEnded ?? this.isEnded,
      result: result ?? this.result,
      termination: termination ?? this.termination,
      drawOfferedByMe: drawOfferedByMe ?? this.drawOfferedByMe,
      drawOfferedToMe: drawOfferedToMe ?? this.drawOfferedToMe,
      rematchOfferedByMe: rematchOfferedByMe ?? this.rematchOfferedByMe,
      rematchOfferedToMe: rematchOfferedToMe ?? this.rematchOfferedToMe,
      rematchOfferedByUsername: rematchOfferedByUsername ?? this.rematchOfferedByUsername,
      isRematchLoading: isRematchLoading ?? this.isRematchLoading,
      tournamentId: tournamentId ?? this.tournamentId,
      opponentConnected: opponentConnected ?? this.opponentConnected,
      lastMoveFrom: lastMoveFrom ?? this.lastMoveFrom,
      lastMoveTo: lastMoveTo ?? this.lastMoveTo,
      errorMessage: errorMessage,
    );
  }
}
