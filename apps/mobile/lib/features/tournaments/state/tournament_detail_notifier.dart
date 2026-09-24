import 'package:flutter_riverpod/legacy.dart';
import '../../../core/websocket/ws_client.dart';
import '../../../core/protocol/ws_events.dart';
import '../../auth/state/auth_notifier.dart';
import '../data/tournaments_repository.dart';
import '../models/tournament.dart';
import '../models/tournament_entry.dart';
import '../models/tournament_pairing.dart';

class TournamentDetailState {
  final Tournament? tournament;
  final List<TournamentEntry> standings;
  final List<TournamentPairing> pairings;
  final bool isLoading;
  final bool isActionLoading;
  final String? errorMessage;
  final String? actionError;
  final String activeTab; // 'standings' | 'pairings' | 'participants'
  final int? selectedRound;
  final TournamentPairing? assignedMatch;

  const TournamentDetailState({
    this.tournament,
    this.standings = const [],
    this.pairings = const [],
    this.isLoading = false,
    this.isActionLoading = false,
    this.errorMessage,
    this.actionError,
    this.activeTab = 'standings',
    this.selectedRound,
    this.assignedMatch,
  });

  bool isUserRegistered(String? userId) {
    if (userId == null || tournament == null) return false;
    return tournament!.isUserRegistered(userId);
  }

  TournamentDetailState copyWith({
    Tournament? tournament,
    List<TournamentEntry>? standings,
    List<TournamentPairing>? pairings,
    bool? isLoading,
    bool? isActionLoading,
    String? errorMessage,
    bool clearError = false,
    String? actionError,
    bool clearActionError = false,
    String? activeTab,
    int? selectedRound,
    TournamentPairing? assignedMatch,
    bool clearAssignedMatch = false,
  }) {
    return TournamentDetailState(
      tournament: tournament ?? this.tournament,
      standings: standings ?? this.standings,
      pairings: pairings ?? this.pairings,
      isLoading: isLoading ?? this.isLoading,
      isActionLoading: isActionLoading ?? this.isActionLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      actionError: clearActionError ? null : (actionError ?? this.actionError),
      activeTab: activeTab ?? this.activeTab,
      selectedRound: selectedRound ?? this.selectedRound,
      assignedMatch: clearAssignedMatch ? null : (assignedMatch ?? this.assignedMatch),
    );
  }
}

final tournamentDetailNotifierProvider = StateNotifierProvider.autoDispose
    .family<TournamentDetailNotifier, TournamentDetailState, String>((ref, tournamentId) {
  final repository = ref.watch(tournamentsRepositoryProvider);
  final wsClient = ref.watch(wsClientProvider);
  final authState = ref.watch(authNotifierProvider);

  return TournamentDetailNotifier(
    tournamentId: tournamentId,
    repository: repository,
    wsClient: wsClient,
    currentUserId: authState.user?.id,
  );
});

class TournamentDetailNotifier extends StateNotifier<TournamentDetailState> {
  final String tournamentId;
  final TournamentsRepository repository;
  final WsClient wsClient;
  final String? currentUserId;
  final List<void Function()> _unsubscribers = [];

  TournamentDetailNotifier({
    required this.tournamentId,
    required this.repository,
    required this.wsClient,
    this.currentUserId,
  }) : super(const TournamentDetailState()) {
    _init();
  }

  void _init() {
    fetchDetails();
    _subscribeWs();
  }

  void _subscribeWs() {
    // Send tournament:join handshake to server
    wsClient.send(WsEvents.tournamentJoin, {'tournamentId': tournamentId});

    // Listen to real-time events broadcast over Redis channel
    _unsubscribers.add(wsClient.on(WsEvents.tournamentUpdated, (payload) {
      if (payload['tournamentId'] == tournamentId) {
        fetchDetails(silent: true);
      }
    }));

    _unsubscribers.add(wsClient.on(WsEvents.tournamentStarted, (payload) {
      if (payload['tournamentId'] == tournamentId) {
        fetchDetails(silent: true);
        if (payload['initialPairings'] is List) {
          _checkAssignedPairings(payload['initialPairings'] as List<dynamic>);
        }
      }
    }));

    _unsubscribers.add(wsClient.on(WsEvents.tournamentRoundStarted, (payload) {
      if (payload['tournamentId'] == tournamentId) {
        fetchDetails(silent: true);
        if (payload['pairings'] is List) {
          _checkAssignedPairings(payload['pairings'] as List<dynamic>);
        }
      }
    }));

    _unsubscribers.add(wsClient.on(WsEvents.tournamentPairingCreated, (payload) {
      if (payload['tournamentId'] == tournamentId) {
        fetchDetails(silent: true);
        if (payload['pairing'] is Map<String, dynamic>) {
          _checkSingleAssignedPairing(payload['pairing'] as Map<String, dynamic>);
        }
      }
    }));

    _unsubscribers.add(wsClient.on(WsEvents.tournamentStandingsUpdated, (payload) {
      if (payload['tournamentId'] == tournamentId) {
        if (payload['standings'] is List) {
          final entries = (payload['standings'] as List<dynamic>)
              .map((e) => TournamentEntry.fromJson(e as Map<String, dynamic>))
              .toList();
          state = state.copyWith(standings: entries);
        } else {
          fetchDetails(silent: true);
        }
      }
    }));

    _unsubscribers.add(wsClient.on(WsEvents.tournamentRoundCompleted, (payload) {
      if (payload['tournamentId'] == tournamentId) {
        fetchDetails(silent: true);
      }
    }));

    _unsubscribers.add(wsClient.on(WsEvents.tournamentFinished, (payload) {
      if (payload['tournamentId'] == tournamentId) {
        fetchDetails(silent: true);
      }
    }));

    _unsubscribers.add(wsClient.on(WsEvents.tournamentCancelled, (payload) {
      if (payload['tournamentId'] == tournamentId) {
        fetchDetails(silent: true);
      }
    }));

    // tournament:game_started fires when the server transitions a pairing
    // into a live game. Refreshing here ensures the assignedMatch banner
    // reflects the actual live game state (e.g. game ID available).
    _unsubscribers.add(wsClient.on(WsEvents.tournamentGameStarted, (payload) {
      if (payload['tournamentId'] != tournamentId) return;
      fetchDetails(silent: true);
    }));
  }

  void _checkAssignedPairings(List<dynamic> rawList) {
    if (currentUserId == null) return;
    for (final raw in rawList) {
      if (raw is Map<String, dynamic>) {
        final pairing = TournamentPairing.fromJson(raw);
        if (pairing.isParticipant(currentUserId) && !pairing.isBye && !pairing.isFinished) {
          state = state.copyWith(assignedMatch: pairing);
          break;
        }
      }
    }
  }

  void _checkSingleAssignedPairing(Map<String, dynamic> raw) {
    if (currentUserId == null) return;
    final pairing = TournamentPairing.fromJson(raw);
    if (pairing.isParticipant(currentUserId) && !pairing.isBye && !pairing.isFinished) {
      state = state.copyWith(assignedMatch: pairing);
    }
  }

  Future<void> fetchDetails({bool silent = false}) async {
    if (!silent) {
      state = state.copyWith(isLoading: true, clearError: true);
    }
    try {
      final tournament = await repository.getTournamentDetails(tournamentId);
      final standings = tournament.entries ?? await repository.getStandings(tournamentId);
      final pairings = tournament.pairings ?? await repository.getPairings(tournamentId);

      // Check if user has an active pending pairing
      TournamentPairing? activeMatch;
      if (currentUserId != null && pairings.isNotEmpty) {
        for (final p in pairings) {
          if (p.isParticipant(currentUserId) && !p.isBye && !p.isFinished) {
            activeMatch = p;
            break;
          }
        }
      }

      if (!mounted) return;
      state = state.copyWith(
        tournament: tournament,
        standings: standings,
        pairings: pairings,
        assignedMatch: activeMatch,
        isLoading: false,
      );
    } catch (e) {
      if (!mounted) return;
      if (!silent) {
        state = state.copyWith(
          isLoading: false,
          errorMessage: e.toString().replaceFirst('Exception: ', ''),
        );
      }
    }
  }

  Future<bool> register() async {
    state = state.copyWith(isActionLoading: true, clearActionError: true);
    try {
      final success = await repository.register(tournamentId);
      if (success) {
        await fetchDetails(silent: true);
      }
      if (!mounted) return success;
      state = state.copyWith(isActionLoading: false);
      return success;
    } catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isActionLoading: false,
        actionError: e.toString().replaceFirst('Exception: ', ''),
      );
      return false;
    }
  }

  Future<bool> withdraw() async {
    state = state.copyWith(isActionLoading: true, clearActionError: true);
    try {
      final success = await repository.withdraw(tournamentId);
      if (success) {
        await fetchDetails(silent: true);
      }
      if (!mounted) return success;
      state = state.copyWith(isActionLoading: false);
      return success;
    } catch (e) {
      if (!mounted) return false;
      state = state.copyWith(
        isActionLoading: false,
        actionError: e.toString().replaceFirst('Exception: ', ''),
      );
      return false;
    }
  }

  void setTab(String tab) {
    state = state.copyWith(activeTab: tab);
  }

  void selectRound(int? round) {
    state = state.copyWith(selectedRound: round);
  }

  void dismissAssignedMatch() {
    state = state.copyWith(clearAssignedMatch: true);
  }

  @override
  void dispose() {
    for (final unsub in _unsubscribers) {
      unsub();
    }
    wsClient.send(WsEvents.tournamentLeave, {'tournamentId': tournamentId});
    super.dispose();
  }
}
