import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import '../../auth/state/auth_notifier.dart';
import '../data/leaderboard_repository.dart';
import '../models/leaderboard_entry.dart';
import '../models/user_profile.dart';

class LeaderboardState {
  final String selectedCategory; // 'bullet' | 'blitz' | 'rapid' | 'classical'
  final int page;
  final LeaderboardPage? leaderboardPage;
  final Map<String, CategoryRanking> userRankings;
  final bool isLoading;
  final String? errorMessage;

  const LeaderboardState({
    this.selectedCategory = 'rapid',
    this.page = 1,
    this.leaderboardPage,
    this.userRankings = const {},
    this.isLoading = false,
    this.errorMessage,
  });

  LeaderboardState copyWith({
    String? selectedCategory,
    int? page,
    LeaderboardPage? leaderboardPage,
    Map<String, CategoryRanking>? userRankings,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
  }) {
    return LeaderboardState(
      selectedCategory: selectedCategory ?? this.selectedCategory,
      page: page ?? this.page,
      leaderboardPage: leaderboardPage ?? this.leaderboardPage,
      userRankings: userRankings ?? this.userRankings,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class LeaderboardNotifier extends StateNotifier<LeaderboardState> {
  final LeaderboardRepository repository;

  LeaderboardNotifier({required this.repository}) : super(const LeaderboardState()) {
    refresh();
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final pageData = await repository.getLeaderboard(
        state.selectedCategory,
        page: state.page,
        limit: 50,
      );

      Map<String, CategoryRanking> rankings = state.userRankings;
      try {
        rankings = await repository.getUserRankings();
      } catch (_) {
        // Unauthenticated or rankings endpoint optional
      }

      state = state.copyWith(
        leaderboardPage: pageData,
        userRankings: rankings,
        isLoading: false,
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  void setCategory(String category) {
    if (state.selectedCategory == category) return;
    state = state.copyWith(selectedCategory: category, page: 1);
    refresh();
  }

  void setPage(int page) {
    if (page < 1 || (state.leaderboardPage != null && page > state.leaderboardPage!.pages)) {
      return;
    }
    state = state.copyWith(page: page);
    refresh();
  }
}

final leaderboardRepositoryProvider = Provider<LeaderboardRepository>((ref) {
  return LeaderboardRepository(apiClient: ref.watch(apiClientProvider));
});

final leaderboardNotifierProvider = StateNotifierProvider<LeaderboardNotifier, LeaderboardState>((ref) {
  return LeaderboardNotifier(repository: ref.watch(leaderboardRepositoryProvider));
});
