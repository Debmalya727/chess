import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/app_config.dart';
import '../protocol/ws_events.dart';
import 'ws_connection_state.dart';

class WsMessage {
  final String event;
  final Map<String, dynamic> payload;
  final String? requestId;
  final int timestamp;

  const WsMessage({
    required this.event,
    required this.payload,
    this.requestId,
    required this.timestamp,
  });

  factory WsMessage.fromJson(Map<String, dynamic> json) {
    return WsMessage(
      event: (json['event'] ?? json['type'] ?? '') as String,
      payload: (json['payload'] is Map<String, dynamic>)
          ? json['payload'] as Map<String, dynamic>
          : <String, dynamic>{},
      requestId: json['requestId'] as String?,
      timestamp: (json['timestamp'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
    );
  }
}

class WsClient {
  final AppConfig config;
  WebSocketChannel? _channel;
  StreamSubscription? _channelSubscription;

  final _connectionStateController = StreamController<WsConnectionState>.broadcast();
  final _messageController = StreamController<WsMessage>.broadcast();
  final Map<String, List<Function(Map<String, dynamic>)>> _listeners = {};

  WsConnectionState _connectionState = WsConnectionState.initial;
  String? _currentToken;
  Timer? _reconnectTimer;
  Timer? _pingTimer;
  int _reconnectAttempts = 0;
  bool _isManualDisconnect = false;

  // Track latest authoritative stateVersion per game to reject stale events
  final Map<String, int> _gameStateVersions = {};

  WsClient({required this.config});

  Stream<WsConnectionState> get connectionStateStream => _connectionStateController.stream;
  WsConnectionState get connectionState => _connectionState;
  WsConnectionState get currentState => _connectionState;
  Stream<WsMessage> get messageStream => _messageController.stream;

  int getLatestStateVersion(String gameId) => _gameStateVersions[gameId] ?? 0;

  void updateStateVersion(String gameId, int version) {
    _gameStateVersions[gameId] = version;
  }

  bool isStaleEvent(String gameId, int incomingVersion) {
    final current = _gameStateVersions[gameId] ?? 0;
    return incomingVersion <= current;
  }

  void resetStateVersion(String gameId) {
    _gameStateVersions.remove(gameId);
  }

  Duration calculateBackoffDelay(int attempt) {
    final backoffSeconds = min(30, pow(2, min(attempt, 5)).toInt());
    return Duration(seconds: backoffSeconds);
  }

  void _updateStatus(WsConnectionStatus status, {String? errorMessage, int? retryCount}) {
    _connectionState = _connectionState.copyWith(
      status: status,
      errorMessage: errorMessage,
      retryCount: retryCount ?? _reconnectAttempts,
    );
    _connectionStateController.add(_connectionState);
  }

  Future<void> connect(String? token) async {
    _isManualDisconnect = false;
    _currentToken = token;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;

    _updateStatus(
      _reconnectAttempts > 0 ? WsConnectionStatus.reconnecting : WsConnectionStatus.connecting,
    );

    try {
      final wsUri = Uri.parse(config.wsBaseUrl);
      _channel = WebSocketChannel.connect(wsUri);

      _channelSubscription = _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
        cancelOnError: true,
      );

      // Authenticate with server if token is present
      if (_currentToken != null && _currentToken!.isNotEmpty) {
        _updateStatus(WsConnectionStatus.authenticating);
        send(WsEvents.authToken, {'token': _currentToken});
      } else {
        _updateStatus(WsConnectionStatus.connected);
      }

      _startPingHeartbeat();
      _reconnectAttempts = 0;
    } catch (e) {
      _onError(e);
    }
  }

  void _onMessage(dynamic raw) {
    try {
      final json = jsonDecode(raw.toString()) as Map<String, dynamic>;
      final message = WsMessage.fromJson(json);

      if (message.event == WsEvents.authSuccess) {
        _updateStatus(WsConnectionStatus.connected);
      }

      // Authoritative StateVersion Validation for Move and Game Events
      if (message.payload.containsKey('gameId') && message.payload.containsKey('stateVersion')) {
        final gameId = message.payload['gameId'] as String;
        final incomingVersion = (message.payload['stateVersion'] as num).toInt();
        final currentVersion = _gameStateVersions[gameId] ?? 0;

        if (incomingVersion < currentVersion) {
          // Reject stale state version
          return;
        }
        _gameStateVersions[gameId] = incomingVersion;
      }

      _messageController.add(message);

      // Dispatch to event listeners
      final handlers = _listeners[message.event];
      if (handlers != null) {
        for (final handler in List.from(handlers)) {
          handler(message.payload);
        }
      }
    } catch (_) {
      // Ignored malformed JSON
    }
  }

  void _onError(dynamic error) {
    _updateStatus(WsConnectionStatus.failed, errorMessage: error.toString());
    _scheduleReconnect();
  }

  void _onDone() {
    if (!_isManualDisconnect) {
      _updateStatus(WsConnectionStatus.disconnected);
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_isManualDisconnect) return;
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();

    _reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s + small jitter
    final backoffSeconds = min(30, pow(2, min(_reconnectAttempts - 1, 5)).toInt());
    final jitterMs = Random().nextInt(500);
    final delay = Duration(seconds: backoffSeconds, milliseconds: jitterMs);

    _updateStatus(WsConnectionStatus.reconnecting, retryCount: _reconnectAttempts);

    _reconnectTimer = Timer(delay, () {
      connect(_currentToken);
    });
  }

  void _startPingHeartbeat() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_connectionState.isConnected) {
        send(WsEvents.ping, {});
      }
    });
  }

  void send(String event, Map<String, dynamic> payload, {String? requestId}) {
    if (_channel != null) {
      final envelope = {
        'event': event,
        'payload': payload,
        'requestId': ?requestId,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      };
      _channel!.sink.add(jsonEncode(envelope));
    }
  }

  void Function() on(String event, Function(Map<String, dynamic>) callback) {
    _listeners.putIfAbsent(event, () => []).add(callback);
    return () {
      _listeners[event]?.remove(callback);
    };
  }

  void disconnect() {
    _isManualDisconnect = true;
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    _channelSubscription?.cancel();
    _channel?.sink.close();
    _channel = null;
    _updateStatus(WsConnectionStatus.disconnected);
  }

  void dispose() {
    disconnect();
    _connectionStateController.close();
    _messageController.close();
    _listeners.clear();
  }
}
