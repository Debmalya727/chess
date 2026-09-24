import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import '../../../core/protocol/ws_events.dart';
import '../../../core/websocket/ws_client.dart';
import '../../auth/state/auth_notifier.dart';
import '../data/friends_repository.dart';
import '../models/friend.dart';
import '../models/friend_request.dart';

class FriendsState {
  final List<Friend> friends;
  final List<FriendRequest> incomingRequests;
  final List<FriendRequest> outgoingRequests;
  final bool isLoading;
  final String? errorMessage;
  final String? actionMessage;

  const FriendsState({
    this.friends = const [],
    this.incomingRequests = const [],
    this.outgoingRequests = const [],
    this.isLoading = false,
    this.errorMessage,
    this.actionMessage,
  });

  FriendsState copyWith({
    List<Friend>? friends,
    List<FriendRequest>? incomingRequests,
    List<FriendRequest>? outgoingRequests,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
    String? actionMessage,
    bool clearAction = false,
  }) {
    return FriendsState(
      friends: friends ?? this.friends,
      incomingRequests: incomingRequests ?? this.incomingRequests,
      outgoingRequests: outgoingRequests ?? this.outgoingRequests,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      actionMessage: clearAction ? null : (actionMessage ?? this.actionMessage),
    );
  }
}

class FriendsNotifier extends StateNotifier<FriendsState> {
  final FriendsRepository repository;
  final WsClient wsClient;
  final List<void Function()> _unsubscribers = [];

  FriendsNotifier({
    required this.repository,
    required this.wsClient,
  }) : super(const FriendsState()) {
    _initWsListeners();
    refresh();
  }

  void _initWsListeners() {
    // When incoming friend request arrives
    _unsubscribers.add(wsClient.on(WsEvents.friendRequestReceived, (_) {
      refresh();
    }));

    // When outgoing friend request is accepted
    _unsubscribers.add(wsClient.on(WsEvents.friendRequestAccepted, (_) {
      refresh();
    }));

    // Real-time friend presence updates
    _unsubscribers.add(wsClient.on(WsEvents.presenceUpdated, (payload) {
      final userId = payload['userId'] as String?;
      final status = (payload['status'] ?? 'offline') as String;
      if (userId == null) return;

      final updatedFriends = state.friends.map((f) {
        if (f.userId == userId) {
          return f.copyWith(presence: status);
        }
        return f;
      }).toList();

      state = state.copyWith(friends: updatedFriends);
    }));
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final friends = await repository.getFriends();
      final reqs = await repository.getFriendRequests();
      state = state.copyWith(
        friends: friends,
        incomingRequests: reqs.incoming,
        outgoingRequests: reqs.outgoing,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<bool> sendRequest(String username) async {
    if (username.trim().isEmpty) return false;
    state = state.copyWith(isLoading: true, clearError: true, clearAction: true);
    try {
      final req = await repository.sendFriendRequest(username);
      final updatedOutgoing = [...state.outgoingRequests, req];
      state = state.copyWith(
        outgoingRequests: updatedOutgoing,
        isLoading: false,
        actionMessage: 'Friend request sent to "$username".',
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

  Future<void> acceptRequest(String id) async {
    state = state.copyWith(isLoading: true, clearError: true, clearAction: true);
    try {
      await repository.acceptFriendRequest(id);
      await refresh();
      state = state.copyWith(actionMessage: 'Friend request accepted.');
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> declineRequest(String id) async {
    state = state.copyWith(isLoading: true, clearError: true, clearAction: true);
    try {
      await repository.declineFriendRequest(id);
      final updatedIncoming = state.incomingRequests.where((r) => r.id != id).toList();
      state = state.copyWith(
        incomingRequests: updatedIncoming,
        isLoading: false,
        actionMessage: 'Friend request declined.',
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
  }

  Future<void> removeFriend(String username) async {
    state = state.copyWith(isLoading: true, clearError: true, clearAction: true);
    try {
      await repository.removeFriend(username);
      final updatedFriends = state.friends.where((f) => f.username != username).toList();
      state = state.copyWith(
        friends: updatedFriends,
        isLoading: false,
        actionMessage: 'Removed "$username" from friends.',
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString().replaceFirst('Exception: ', ''),
      );
    }
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

final friendsRepositoryProvider = Provider<FriendsRepository>((ref) {
  return FriendsRepository(apiClient: ref.watch(apiClientProvider));
});

final friendsNotifierProvider = StateNotifierProvider<FriendsNotifier, FriendsState>((ref) {
  return FriendsNotifier(
    repository: ref.watch(friendsRepositoryProvider),
    wsClient: ref.watch(wsClientProvider),
  );
});
