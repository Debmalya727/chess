class ChessMove {
  final String from;
  final String to;
  final String? promotion;
  final String? san;

  const ChessMove({
    required this.from,
    required this.to,
    this.promotion,
    this.san,
  });

  String get uci => '$from$to${promotion ?? ''}';

  @override
  String toString() => san ?? uci;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ChessMove &&
          runtimeType == other.runtimeType &&
          from == other.from &&
          to == other.to &&
          promotion == other.promotion;

  @override
  int get hashCode => from.hashCode ^ to.hashCode ^ (promotion?.hashCode ?? 0);
}
