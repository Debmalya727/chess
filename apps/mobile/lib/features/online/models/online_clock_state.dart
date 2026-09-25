class OnlineClockState {
  final int whiteRemainingMs;
  final int blackRemainingMs;
  final String activeColor;
  final bool isRunning;
  final int? serverTime;

  const OnlineClockState({
    required this.whiteRemainingMs,
    required this.blackRemainingMs,
    this.activeColor = 'w',
    this.isRunning = false,
    this.serverTime,
  });

  factory OnlineClockState.initial(int totalMs) {
    return OnlineClockState(
      whiteRemainingMs: totalMs,
      blackRemainingMs: totalMs,
      activeColor: 'w',
      isRunning: false,
    );
  }

  factory OnlineClockState.fromJson(Map<String, dynamic> json) {
    return OnlineClockState(
      whiteRemainingMs: (json['whiteRemainingMs'] as num?)?.toInt() ??
          (json['whiteTimeRemaining'] as num?)?.toInt() ??
          (json['white'] as num?)?.toInt() ??
          600000,
      blackRemainingMs: (json['blackRemainingMs'] as num?)?.toInt() ??
          (json['blackTimeRemaining'] as num?)?.toInt() ??
          (json['black'] as num?)?.toInt() ??
          600000,
      activeColor: (json['activeColor'] as String?) ?? 'w',
      isRunning: (json['isRunning'] as bool?) ?? true,
      serverTime: (json['serverTime'] as num?)?.toInt(),
    );
  }

  static String formatTime(int ms) {
    final clamped = ms < 0 ? 0 : ms;
    final totalSeconds = (clamped / 1000).floor();
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    final mStr = minutes.toString().padLeft(2, '0');
    final sStr = seconds.toString().padLeft(2, '0');

    if (totalSeconds < 60) {
      final tenths = ((clamped % 1000) / 100).floor();
      return '$mStr:$sStr.$tenths';
    }
    return '$mStr:$sStr';
  }

  bool isLowTime({required bool isWhite}) =>
      (isWhite ? whiteRemainingMs : blackRemainingMs) < 30000;

  String get formattedWhite => formatTime(whiteRemainingMs);
  String get formattedBlack => formatTime(blackRemainingMs);

  OnlineClockState copyWith({
    int? whiteRemainingMs,
    int? blackRemainingMs,
    String? activeColor,
    bool? isRunning,
    int? serverTime,
  }) {
    return OnlineClockState(
      whiteRemainingMs: whiteRemainingMs ?? this.whiteRemainingMs,
      blackRemainingMs: blackRemainingMs ?? this.blackRemainingMs,
      activeColor: activeColor ?? this.activeColor,
      isRunning: isRunning ?? this.isRunning,
      serverTime: serverTime ?? this.serverTime,
    );
  }
}
