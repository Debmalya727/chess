import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/network/api_client.dart';
import 'package:chess_mobile/core/protocol/ws_events.dart';
import 'package:chess_mobile/core/storage/secure_storage_service.dart';
import 'package:chess_mobile/core/websocket/ws_client.dart';
import 'package:chess_mobile/features/tournaments/data/tournaments_repository.dart';
import 'package:chess_mobile/features/tournaments/models/tournament.dart';
import 'package:chess_mobile/features/tournaments/models/tournament_entry.dart';
import 'package:chess_mobile/features/tournaments/models/tournament_pairing.dart';
import 'package:chess_mobile/features/tournaments/state/tournament_detail_notifier.dart';

class FakeWsClient extends WsClient {
  final List<Map<String, dynamic>> sentMessages = [];
  final Map<String, List<Function(Map<String, dynamic>)>> callbacks = {};

  FakeWsClient() : super(config: AppConfig.development);

  @override
  void Function() on(String event, Function(Map<String, dynamic>) callback) {
    callbacks.putIfAbsent(event, () => []).add(callback);
    return () {
      callbacks[event]?.remove(callback);
    };
  }

  @override
  void send(String event, Map<String, dynamic> payload, {String? requestId}) {
    sentMessages.add({'event': event, 'payload': payload, 'requestId': requestId});
  }

  void dispatch(String event, Map<String, dynamic> payload) {
    final list = callbacks[event];
    if (list != null) {
      for (final cb in List.of(list)) {
        cb(payload);
      }
    }
  }
}

class FakeTournamentsRepository extends TournamentsRepository {
  int fetchDetailsCallCount = 0;
  Tournament tournamentToReturn;

  FakeTournamentsRepository({
    required this.tournamentToReturn,
  }) : super(
          ApiClient(
            config: AppConfig.development,
            storage: InMemoryStorageService(),
          ),
        );

  @override
  Future<Tournament> getTournamentDetails(String id) async {
    fetchDetailsCallCount++;
    return tournamentToReturn;
  }

  @override
  Future<List<TournamentEntry>> getStandings(String id) async {
    return tournamentToReturn.entries ?? [];
  }

  @override
  Future<List<TournamentPairing>> getPairings(String id, {int? round}) async {
    return tournamentToReturn.pairings ?? [];
  }
}

void main() {
  group('TournamentDetailNotifier & M6-F005 tournament:game_started Tests', () {
    late FakeWsClient fakeWs;
    late FakeTournamentsRepository repository;
    const tournamentId = 'tourn-100';
    const currentUserId = 'user-me';

    final initialTournament = Tournament(
      id: tournamentId,
      name: 'Arena Championship',
      type: 'arena',
      status: 'running',
      ratingType: 'blitz',
      timeControl: '3+0',
      pairings: const [],
      entries: const [],
    );

    setUp(() {
      fakeWs = FakeWsClient();
      repository = FakeTournamentsRepository(tournamentToReturn: initialTournament);
    });

    tearDown(() {
      fakeWs.dispose();
    });

    test('initializes and subscribes to tournament:join handshake', () async {
      final notifier = TournamentDetailNotifier(
        tournamentId: tournamentId,
        repository: repository,
        wsClient: fakeWs,
        currentUserId: currentUserId,
      );

      // Verify handshake sent
      expect(fakeWs.sentMessages.length, equals(1));
      expect(fakeWs.sentMessages.first['event'], equals(WsEvents.tournamentJoin));
      expect(fakeWs.sentMessages.first['payload'], equals({'tournamentId': tournamentId}));

      // Initial fetch details called
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(1));
      expect(notifier.state.tournament?.id, equals(tournamentId));
      expect(notifier.state.assignedMatch, isNull);

      notifier.dispose();
    });

    test('valid tournament:game_started event refreshes details and updates state', () async {
      final notifier = TournamentDetailNotifier(
        tournamentId: tournamentId,
        repository: repository,
        wsClient: fakeWs,
        currentUserId: currentUserId,
      );
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(1));
      expect(notifier.state.assignedMatch, isNull);

      // Now server creates live pairing for user-me
      final livePairing = TournamentPairing(
        id: 'pairing-42',
        tournamentId: tournamentId,
        roundNumber: 1,
        whiteUserId: currentUserId,
        whiteUsername: 'MySelf',
        blackUserId: 'opp-99',
        blackUsername: 'GrandmasterOpponent',
        gameId: 'game-live-777',
        roomCode: 'ARENA_R1',
        result: null, // ongoing
      );

      repository.tournamentToReturn = Tournament(
        id: tournamentId,
        name: 'Arena Championship',
        type: 'arena',
        status: 'running',
        ratingType: 'blitz',
        timeControl: '3+0',
        pairings: [livePairing],
        entries: const [],
      );

      // Dispatch tournament:game_started event (M6-F005 handler)
      fakeWs.dispatch(WsEvents.tournamentGameStarted, {
        'tournamentId': tournamentId,
        'gameId': 'game-live-777',
        'whiteId': currentUserId,
        'blackId': 'opp-99',
      });

      await Future<void>.delayed(Duration.zero);

      // Must have triggered refresh
      expect(repository.fetchDetailsCallCount, equals(2));
      expect(notifier.state.assignedMatch, isNotNull);
      expect(notifier.state.assignedMatch?.gameId, equals('game-live-777'));
      expect(notifier.state.assignedMatch?.whiteUserId, equals(currentUserId));
      expect(notifier.state.assignedMatch?.blackUsername, equals('GrandmasterOpponent'));

      notifier.dispose();
    });

    test('unrelated tournament:game_started event is ignored', () async {
      final notifier = TournamentDetailNotifier(
        tournamentId: tournamentId,
        repository: repository,
        wsClient: fakeWs,
        currentUserId: currentUserId,
      );
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(1));

      // Dispatch event for a different tournament ID
      fakeWs.dispatch(WsEvents.tournamentGameStarted, {
        'tournamentId': 'different-tournament-999',
        'gameId': 'game-999',
      });

      await Future<void>.delayed(Duration.zero);

      // Call count must remain 1 (no refresh triggered)
      expect(repository.fetchDetailsCallCount, equals(1));

      notifier.dispose();
    });

    test('malformed payload does not crash notifier and is safely ignored', () async {
      final notifier = TournamentDetailNotifier(
        tournamentId: tournamentId,
        repository: repository,
        wsClient: fakeWs,
        currentUserId: currentUserId,
      );
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(1));

      // Empty payload
      fakeWs.dispatch(WsEvents.tournamentGameStarted, {});
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(1));

      // Missing tournamentId key
      fakeWs.dispatch(WsEvents.tournamentGameStarted, {
        'gameId': 'game-no-tourn-id',
      });
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(1));

      // null tournamentId
      fakeWs.dispatch(WsEvents.tournamentGameStarted, {
        'tournamentId': null,
      });
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(1));

      notifier.dispose();
    });

    test('multiple game_started events for same tournament refresh state idempotently', () async {
      final notifier = TournamentDetailNotifier(
        tournamentId: tournamentId,
        repository: repository,
        wsClient: fakeWs,
        currentUserId: currentUserId,
      );
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(1));

      // Event 1
      fakeWs.dispatch(WsEvents.tournamentGameStarted, {
        'tournamentId': tournamentId,
        'gameId': 'game-1',
      });
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(2));

      // Event 2
      fakeWs.dispatch(WsEvents.tournamentGameStarted, {
        'tournamentId': tournamentId,
        'gameId': 'game-2',
      });
      await Future<void>.delayed(Duration.zero);
      expect(repository.fetchDetailsCallCount, equals(3));

      notifier.dispose();
    });
  });
}
