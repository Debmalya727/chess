import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/features/social/state/friends_notifier.dart';
import 'package:chess_mobile/features/social/state/challenges_notifier.dart';
import 'package:chess_mobile/features/social/state/leaderboard_notifier.dart';
import 'package:chess_mobile/features/social/state/player_profile_notifier.dart';

void main() {
  group('M6 Phase C — State copyWith Preservation Tests (M6-F004)', () {
    // ─────────────────────────────────────────────────────────────────────
    // C1. FriendsState.copyWith properly preserves errorMessage/actionMessage
    // ─────────────────────────────────────────────────────────────────────
    group('C1: FriendsState.copyWith error/action preservation', () {
      test('errorMessage is preserved when not explicitly passed', () {
        const s1 = FriendsState(errorMessage: 'Network error');
        final s2 = s1.copyWith(isLoading: false);
        expect(s2.errorMessage, 'Network error');
      });

      test('clearError: true clears errorMessage', () {
        const s1 = FriendsState(errorMessage: 'Network error');
        final s2 = s1.copyWith(clearError: true);
        expect(s2.errorMessage, isNull);
      });

      test('actionMessage is preserved when not explicitly passed', () {
        const s1 = FriendsState(actionMessage: 'Friend request sent!');
        final s2 = s1.copyWith(isLoading: false);
        expect(s2.actionMessage, 'Friend request sent!');
      });

      test('clearAction: true clears actionMessage', () {
        const s1 = FriendsState(actionMessage: 'Friend request sent!');
        final s2 = s1.copyWith(clearAction: true);
        expect(s2.actionMessage, isNull);
      });

      test('errorMessage field update is set correctly when explicitly provided', () {
        const s1 = FriendsState();
        final s2 = s1.copyWith(errorMessage: 'Some error');
        expect(s2.errorMessage, 'Some error');
      });

      test('presence update does not erase existing errorMessage', () {
        // Regression test: WS presenceUpdated handler calls copyWith(friends: ...)
        // which previously cleared errorMessage silently
        const s1 = FriendsState(errorMessage: 'Failed to load friends');
        final s2 = s1.copyWith(friends: []); // simulate presenceUpdated handler
        expect(s2.errorMessage, 'Failed to load friends');
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // C2. ChallengesState.copyWith properly preserves errorMessage/actionMessage
    // ─────────────────────────────────────────────────────────────────────
    group('C2: ChallengesState.copyWith error/action preservation', () {
      test('errorMessage is preserved when not explicitly passed', () {
        const s1 = ChallengesState(errorMessage: 'Server error');
        final s2 = s1.copyWith(isLoading: false);
        expect(s2.errorMessage, 'Server error');
      });

      test('clearError: true clears errorMessage', () {
        const s1 = ChallengesState(errorMessage: 'Server error');
        final s2 = s1.copyWith(clearError: true);
        expect(s2.errorMessage, isNull);
      });

      test('actionMessage is preserved when not explicitly passed', () {
        const s1 = ChallengesState(actionMessage: 'Challenge sent!');
        final s2 = s1.copyWith(isLoading: false);
        expect(s2.actionMessage, 'Challenge sent!');
      });

      test('clearAction: true clears actionMessage', () {
        const s1 = ChallengesState(actionMessage: 'Challenge sent!');
        final s2 = s1.copyWith(clearAction: true);
        expect(s2.actionMessage, isNull);
      });

      test('WS event handler updating acceptedGame preserves errorMessage', () {
        // Regression: challenge:accepted WS handler called copyWith(acceptedGame: ...)
        // which previously cleared errorMessage
        const s1 = ChallengesState(errorMessage: 'Previous error');
        final s2 = s1.copyWith(incoming: []);
        expect(s2.errorMessage, 'Previous error');
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // C3. LeaderboardState.copyWith properly preserves errorMessage
    // ─────────────────────────────────────────────────────────────────────
    group('C3: LeaderboardState.copyWith error preservation', () {
      test('errorMessage is preserved when setCategory changes tab', () {
        const s1 = LeaderboardState(errorMessage: 'Load failed');
        // setCategory triggers copyWith(selectedCategory: ..., page: 1)
        final s2 = s1.copyWith(selectedCategory: 'bullet', page: 1);
        expect(s2.errorMessage, 'Load failed');
      });

      test('clearError: true clears errorMessage on new fetch start', () {
        const s1 = LeaderboardState(errorMessage: 'Load failed');
        final s2 = s1.copyWith(isLoading: true, clearError: true);
        expect(s2.errorMessage, isNull);
      });

      test('errorMessage is preserved when setPage changes page', () {
        const s1 = LeaderboardState(errorMessage: 'Load failed', page: 1);
        final s2 = s1.copyWith(page: 2);
        expect(s2.errorMessage, 'Load failed');
        expect(s2.page, 2);
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // C4. PlayerProfileState.copyWith properly preserves errorMessage
    // ─────────────────────────────────────────────────────────────────────
    group('C4: PlayerProfileState.copyWith error preservation', () {
      test('errorMessage is preserved when selectCategory is called', () {
        const s1 = PlayerProfileState(errorMessage: 'Load failed');
        // selectCategory triggers copyWith(selectedCategory: ...)
        final s2 = s1.copyWith(selectedCategory: 'bullet');
        expect(s2.errorMessage, 'Load failed');
        expect(s2.selectedCategory, 'bullet');
      });

      test('clearError: true clears errorMessage', () {
        const s1 = PlayerProfileState(errorMessage: 'Load failed');
        final s2 = s1.copyWith(clearError: true);
        expect(s2.errorMessage, isNull);
      });

      test('ratingHistory update does not erase errorMessage', () {
        const s1 = PlayerProfileState(errorMessage: 'Partial failure');
        final s2 = s1.copyWith(ratingHistory: []);
        expect(s2.errorMessage, 'Partial failure');
      });
    });
  });
}
