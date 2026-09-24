import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import '../../../core/protocol/ws_events.dart';
import '../../../core/websocket/ws_client.dart';
import '../../auth/state/auth_notifier.dart';
import '../data/challenges_repository.dart';
import '../models/challenge.dart';

class ChallengesState {
  final List<Challenge> incoming;
  final List<Challenge> outgoing;
  final bool isLoading;
  final String? errorMessage;
  final String? actionMessage;
  final ChallengeAcceptResult? acceptedGame;

  const ChallengesState({
    this.incoming = const [],
    this.outgoing = const [],
    this.isLoading = false,
    this.errorMessage,
    this.actionMessage,
    this.acceptedGame,
  });

  ChallengesState copyWith({
    List<Challenge>? incoming,
    List<Challenge>? outgoing,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
    String? actionMessage,
    bool clearAction = false,
    ChallengeAcceptResult? acceptedGame,
    bool clearAcceptedGame = false,
  }) {
    return ChallengesState(
      incoming: incoming ?? this.incoming,
      outgoing: outgoing ?? this.outgoing,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      actionMessage: clearAction ? null : (actionMessage ?? this.actionMessage),
      acceptedGame: clearAcceptedGame ? null : (acceptedGame ?? this.acceptedGame),
    );
  }
}

class ChallengesNotifier extends StateNotifier<ChallengesState> {
  final ChallengesRepository repository;
  final WsClient wsClient;
  final List<void Function()> _unsubscribers = [];

  ChallengesNotifier({
    required this.repository,
    required this.wsClient,
  }) : super(const ChallengesState()) {
    _initWsListeners();
    refresh();
  }

  void _initWsListeners() {
    _unsubscribers.add(wsClient.on(WsEvents.challengeReceived, (payload) {
      refresh();
    }));

    _unsubscribers.add(wsClient.on(WsEvents.challengeAccepted, (payload) {
      final gameId = payload['gameId'] as String?;
      final roomCode = payload['roomCode'] as String?;
      if (gameId != null && roomCode != null) {
        state = state.copyWith(
          acceptedGame: ChallengeAcceptResult(
            success: true,
            gameId: gameId,
            roomCode: roomCode,
            whiteUsername: payload['whiteUsername'] as String? ?? 'White',
            blackUsername: payload['blackUsername'] as String? ?? 'Black',
            color: 'white', // Color is authoritatively resolved upon game:init
          ),
        );
      }
      refresh();
    }));

    _unsubscribers.add(wsClient.on(WsEvents.challengeDeclined, (_) {
      refresh();
    }));

    _unsubscribers.add(wsClient.on(WsEvents.challengeCancelled, (_) {
      refresh();
    }));

    _unsubscribers.add(wsClient.on(WsEvents.challengeExpired, (_) {
      refresh();
    }));
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final res = await repository.getChallenges();
      state = state.copyWith(
        incoming: res.incoming,
        outgoing: res.outgoing,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<bool> createChallenge({
    required String targetUsername,
    String timeControl = '5+0',
    String colorPreference = 'random',
  }) async {
    state = state.copyWith(isLoading: true, clearError: true, clearAction: true);
    try {
      final challenge = await repository.createChallenge(
        targetUsername: targetUsername,
        timeControl: timeControl,
        colorPreference: colorPreference,
      );
      final updatedOutgoing = [...state.outgoing, challenge];
      state = state.copyWith(
        outgoing: updatedOutgoing,
        isLoading: false,
        actionMessage: 'Challenge sent to "$targetUsername" ($timeControl).',
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
      return false;
    }
  }

  Future<ChallengeAcceptResult?> acceptChallenge(String challengeId) async {
    state = state.copyWith(isLoading: true, clearError: true, clearAction: true);
    try {
      final result = await repository.acceptChallenge(challengeId);
      final updatedIncoming = state.incoming.where((c) => c.id != challengeId).toList();
      state = state.copyWith(
        incoming: updatedIncoming,
        isLoading: false,
        acceptedGame: result,
        actionMessage: 'Challenge accepted! Launching game...',
      );
      return result;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
      return null;
    }
  }

  Future<void> declineChallenge(String challengeId) async {
    state = state.copyWith(isLoading: true, clearError: true, clearAction: true);
    try {
      await repository.declineChallenge(challengeId);
      final updatedIncoming = state.incoming.where((c) => c.id != challengeId).toList();
      state = state.copyWith(
        incoming: updatedIncoming,
        isLoading: false,
        actionMessage: 'Challenge declined.',
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> cancelChallenge(String challengeId) async {
    state = state.copyWith(isLoading: true, clearError: true, clearAction: true);
    try {
      await repository.cancelChallenge(challengeId);
      final updatedOutgoing = state.outgoing.where((c) => c.id != challengeId).toList();
      state = state.copyWith(
        outgoing: updatedOutgoing,
        isLoading: false,
        actionMessage: 'Challenge cancelled.',
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  void clearAcceptedGame() {
    state = state.copyWith(clearAcceptedGame: true);
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

final challengesRepositoryProvider = Provider<ChallengesRepository>((ref) {
  return ChallengesRepository(apiClient: ref.watch(apiClientProvider));
});

final challengesNotifierProvider = StateNotifierProvider<ChallengesNotifier, ChallengesState>((ref) {
  return ChallengesNotifier(
    repository: ref.watch(challengesRepositoryProvider),
    wsClient: ref.watch(wsClientProvider),
  );
});
