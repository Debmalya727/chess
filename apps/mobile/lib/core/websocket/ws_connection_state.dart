enum WsConnectionStatus {
  disconnected,
  connecting,
  authenticating,
  connected,
  reconnecting,
  failed,
}

class WsConnectionState {
  final WsConnectionStatus status;
  final String? errorMessage;
  final int retryCount;

  const WsConnectionState({
    required this.status,
    this.errorMessage,
    this.retryCount = 0,
  });

  bool get isConnected => status == WsConnectionStatus.connected;
  bool get isConnecting => status == WsConnectionStatus.connecting || status == WsConnectionStatus.authenticating;
  bool get isReconnecting => status == WsConnectionStatus.reconnecting;
  bool get isDisconnected => status == WsConnectionStatus.disconnected || status == WsConnectionStatus.failed;

  WsConnectionState copyWith({
    WsConnectionStatus? status,
    String? errorMessage,
    int? retryCount,
  }) {
    return WsConnectionState(
      status: status ?? this.status,
      errorMessage: errorMessage ?? this.errorMessage,
      retryCount: retryCount ?? this.retryCount,
    );
  }

  static const initial = WsConnectionState(status: WsConnectionStatus.disconnected);
}
