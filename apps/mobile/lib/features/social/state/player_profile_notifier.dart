import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import '../../auth/state/auth_notifier.dart';
import '../data/players_repository.dart';
import '../models/user_profile.dart';

class PlayerProfileState {
  final UserProfile? profile;
  final List<OpponentSummary> opponents;
  final List<RatingHistoryEntry> ratingHistory;
  final String selectedCategory; // 'bullet' | 'blitz' | 'rapid' | 'classical'
  final bool isLoading;
  final String? errorMessage;

  const PlayerProfileState({
    this.profile,
    this.opponents = const [],
    this.ratingHistory = const [],
    this.selectedCategory = 'rapid',
    this.isLoading = false,
    this.errorMessage,
  });

  PlayerProfileState copyWith({
    UserProfile? profile,
    List<OpponentSummary>? opponents,
    List<RatingHistoryEntry>? ratingHistory,
    String? selectedCategory,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
  }) {
    return PlayerProfileState(
      profile: profile ?? this.profile,
      opponents: opponents ?? this.opponents,
      ratingHistory: ratingHistory ?? this.ratingHistory,
      selectedCategory: selectedCategory ?? this.selectedCategory,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class PlayerProfileNotifier extends StateNotifier<PlayerProfileState> {
  final PlayersRepository repository;

  PlayerProfileNotifier({required this.repository}) : super(const PlayerProfileState());

  Future<void> loadCurrentUser() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final profile = await repository.getMe();
      final opponents = await repository.getRecentOpponents();
      final history = await repository.getRatingHistory(state.selectedCategory);
      state = state.copyWith(
        profile: profile,
        opponents: opponents,
        ratingHistory: history,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> loadPlayer(String username) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final profile = await repository.getPublicProfile(username);
      state = state.copyWith(
        profile: profile,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> selectCategory(String category) async {
    if (state.selectedCategory == category) return;
    state = state.copyWith(selectedCategory: category);
    try {
      final history = await repository.getRatingHistory(category);
      state = state.copyWith(ratingHistory: history);
    } catch (_) {}
  }
}

final playersRepositoryProvider = Provider<PlayersRepository>((ref) {
  return PlayersRepository(apiClient: ref.watch(apiClientProvider));
});

final playerProfileNotifierProvider = StateNotifierProvider<PlayerProfileNotifier, PlayerProfileState>((ref) {
  return PlayerProfileNotifier(repository: ref.watch(playersRepositoryProvider));
});
