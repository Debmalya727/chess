import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/network/api_client.dart';
import 'package:chess_mobile/core/network/api_exceptions.dart';
import 'package:chess_mobile/core/storage/secure_storage_service.dart';
import 'package:chess_mobile/features/games/data/games_repository.dart';

void main() {
  group('GamesRepository Tests', () {
    late InMemoryStorageService storage;

    setUp(() {
      storage = InMemoryStorageService();
    });

    test('getGameHistory returns parsed response with valid game history', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/games/history'));
        expect(request.url.queryParameters['page'], equals('1'));
        expect(request.url.queryParameters['limit'], equals('10'));
        expect(request.url.queryParameters['ratingType'], equals('blitz'));
        expect(request.url.queryParameters['result'], equals('1-0'));

        final responseData = {
          'games': [
            {
              'id': 'game-001',
              'roomCode': 'ROOM123',
              'white': {'id': 'user-1', 'username': 'Magnus'},
              'black': {'id': 'user-2', 'username': 'Hikaru'},
              'result': '1-0',
              'termination': 'checkmate',
              'timeControl': '3+0',
              'ratingType': 'blitz',
              'initialFen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
              'finalFen': '8/8/8/8/8/5K2/4Q3/7k b - - 0 1',
              'playedAt': '2026-09-24T12:00:00.000Z',
            }
          ],
          'pagination': {
            'page': 1,
            'limit': 10,
            'total': 25,
            'totalPages': 3,
          }
        };

        return http.Response(
          jsonEncode(responseData),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      final result = await repo.getGameHistory(
        page: 1,
        limit: 10,
        ratingType: 'blitz',
        result: '1-0',
      );

      expect(result.games.length, equals(1));
      final item = result.games.first;
      expect(item.id, equals('game-001'));
      expect(item.roomCode, equals('ROOM123'));
      expect(item.whitePlayerId, equals('user-1'));
      expect(item.whiteUsername, equals('Magnus'));
      expect(item.blackPlayerId, equals('user-2'));
      expect(item.blackUsername, equals('Hikaru'));
      expect(item.result, equals('1-0'));
      expect(item.termination, equals('checkmate'));
      expect(item.timeControl, equals('3+0'));
      expect(item.ratingType, equals('blitz'));
      expect(item.isWhite('user-1'), isTrue);
      expect(item.isBlack('user-2'), isTrue);
      expect(item.getUserColor('user-1'), equals('white'));
      expect(item.getUserColor('user-2'), equals('black'));
      expect(item.getUserColor('other'), isNull);
      expect(item.getOpponentUsername('user-1'), equals('Hikaru'));
      expect(item.getOpponentUsername('user-2'), equals('Magnus'));
      expect(item.isWinner('user-1'), isTrue);
      expect(item.isLoser('user-1'), isFalse);
      expect(item.isWinner('user-2'), isFalse);
      expect(item.isLoser('user-2'), isTrue);
      expect(item.isDraw, isFalse);

      // Pagination
      expect(result.pagination.page, equals(1));
      expect(result.pagination.limit, equals(10));
      expect(result.pagination.total, equals(25));
      expect(result.pagination.totalPages, equals(3));
      expect(result.pagination.hasNextPage, isTrue);
      expect(result.pagination.hasPreviousPage, isFalse);
    });

    test('getGameHistory handles empty history cleanly', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'games': <dynamic>[],
            'pagination': {
              'page': 1,
              'limit': 20,
              'total': 0,
              'totalPages': 1,
            }
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      final result = await repo.getGameHistory();
      expect(result.games, isEmpty);
      expect(result.pagination.total, equals(0));
      expect(result.pagination.hasNextPage, isFalse);
      expect(result.pagination.hasPreviousPage, isFalse);
    });

    test('getGameHistory handles non-map response gracefully', () async {
      final mockClient = MockClient((request) async {
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      final result = await repo.getGameHistory();
      expect(result.games, isEmpty);
      expect(result.pagination.page, equals(1));
    });

    test('getGameHistory handles missing and snake_case optional fields', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'games': [
              {
                'id': 'game-002',
                'room_code': 'ROOM_SNAKE',
                'white_player_id': 'w_id',
                'white_username': 'WhiteSnake',
                'black_player_id': 'b_id',
                'black_username': 'BlackSnake',
                'result': '1/2-1/2',
                'time_control': '10+0',
                'rating_type': 'rapid',
              }
            ],
            'pagination': {
              'page': 2,
              'limit': 20,
              'total': 40,
              'total_pages': 2,
            }
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      final result = await repo.getGameHistory(page: 2);
      expect(result.games.length, equals(1));
      final g = result.games.first;
      expect(g.roomCode, equals('ROOM_SNAKE'));
      expect(g.whitePlayerId, equals('w_id'));
      expect(g.whiteUsername, equals('WhiteSnake'));
      expect(g.blackPlayerId, equals('b_id'));
      expect(g.blackUsername, equals('BlackSnake'));
      expect(g.result, equals('1/2-1/2'));
      expect(g.isDraw, isTrue);
      expect(g.isWinner('w_id'), isFalse);
      expect(g.isLoser('w_id'), isFalse);
      expect(g.termination, equals('normal'));
      expect(g.initialFen, isNull);
      expect(g.finalFen, isNull);
      expect(g.playedAt, isNull);

      expect(result.pagination.hasPreviousPage, isTrue);
      expect(result.pagination.hasNextPage, isFalse);
    });

    test('getGameHistory propagates ApiException on server error', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({'error': 'INTERNAL_ERROR', 'message': 'Database connection failed'}),
          500,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      expect(
        () => repo.getGameHistory(),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'INTERNAL_ERROR')),
      );
    });

    test('getGameDetail parses valid detail with authoritative moves', () async {
      final mockClient = MockClient((request) async {
        if (request.url.path == '/api/games/game-xyz') {
          return http.Response(
            jsonEncode({
              'id': 'game-xyz',
              'roomCode': 'ROOMXYZ',
              'whitePlayerId': 'p1',
              'blackPlayerId': 'p2',
              'whiteUsername': 'Player1',
              'blackUsername': 'Player2',
              'status': 'FINISHED',
              'timeControl': '5+3',
              'rated': true,
              'result': '0-1',
              'termination': 'resignation',
              'initialFen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
              'finalFen': 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
              'moveCount': 2,
              'pgn': '1. e4 e5 0-1',
              'createdAt': '2026-09-24T10:00:00.000Z',
              'endedAt': '2026-09-24T10:15:00.000Z',
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/api/games/game-xyz/moves') {
          return http.Response(
            jsonEncode({
              'moves': [
                {
                  'ply': 1,
                  'san': 'e4',
                  'from': 'e2',
                  'to': 'e4',
                  'fenAfter': 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                  'moveTimeMs': 1200,
                },
                {
                  'ply': 2,
                  'san': 'e5',
                  'from': 'e7',
                  'to': 'e5',
                  'fenAfter': 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
                  'moveTimeMs': 800,
                },
              ]
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      final detail = await repo.getGameDetail('game-xyz');
      expect(detail.id, equals('game-xyz'));
      expect(detail.roomCode, equals('ROOMXYZ'));
      expect(detail.isFinished, isTrue);
      expect(detail.rated, isTrue);
      expect(detail.result, equals('0-1'));
      expect(detail.termination, equals('resignation'));
      expect(detail.pgn, equals('1. e4 e5 0-1'));
      expect(detail.moves.length, equals(2));
      expect(detail.moves[0].san, equals('e4'));
      expect(detail.moves[0].moveTimeMs, equals(1200));
      expect(detail.moves[1].san, equals('e5'));
      expect(detail.moves[1].moveTimeMs, equals(800));
      expect(detail.getUserColor('p1'), equals('white'));
      expect(detail.getUserColor('p2'), equals('black'));
      expect(detail.getOpponentUsername('p1'), equals('Player2'));
      expect(detail.getOpponentUsername('p2'), equals('Player1'));
    });

    test('getGameDetail handles moves failure gracefully by falling back to empty moves', () async {
      final mockClient = MockClient((request) async {
        if (request.url.path == '/api/games/game-nomoves') {
          return http.Response(
            jsonEncode({
              'id': 'game-nomoves',
              'roomCode': 'ROOMNOMOVES',
              'whiteUsername': 'P1',
              'blackUsername': 'P2',
              'status': 'ACTIVE',
              'timeControl': '10+0',
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        } else if (request.url.path == '/api/games/game-nomoves/moves') {
          // Moves endpoint returns 404
          return http.Response('Not Found', 404);
        }
        return http.Response('Not Found', 404);
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      final detail = await repo.getGameDetail('game-nomoves');
      expect(detail.id, equals('game-nomoves'));
      expect(detail.isFinished, isFalse);
      expect(detail.moves, isEmpty);
    });

    test('getGameDetail throws Exception when game response is not a Map', () async {
      final mockClient = MockClient((request) async {
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      expect(
        () => repo.getGameDetail('bad-id'),
        throwsA(isA<Exception>().having((e) => e.toString(), 'message', contains('Failed to load game details'))),
      );
    });

    test('getGameMoves returns parsed list of moves', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/games/game-mv/moves'));
        return http.Response(
          jsonEncode({
            'moves': [
              {
                'ply': 1,
                'san': 'd4',
                'from': 'd2',
                'to': 'd4',
                'fenAfter': 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1',
              }
            ]
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      final moves = await repo.getGameMoves('game-mv');
      expect(moves.length, equals(1));
      expect(moves.first.san, equals('d4'));
      expect(moves.first.from, equals('d2'));
      expect(moves.first.to, equals('d4'));
    });

    test('getGamePgn returns string from both raw text and json wrapper', () async {
      // 1. JSON response format: {'pgn': '1. d4 d5'}
      final mockJsonClient = MockClient((request) async {
        return http.Response(
          jsonEncode({'pgn': '1. d4 d5'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final repoJson = GamesRepository(
        ApiClient(config: AppConfig.development, storage: storage, httpClient: mockJsonClient),
      );
      final pgn1 = await repoJson.getGamePgn('g1');
      expect(pgn1, equals('1. d4 d5'));

      // 2. Raw string response format
      final mockStringClient = MockClient((request) async {
        return http.Response(
          '1. e4 e5 2. Nf3',
          200,
          headers: {'content-type': 'text/plain'},
        );
      });

      final repoString = GamesRepository(
        ApiClient(config: AppConfig.development, storage: storage, httpClient: mockStringClient),
      );
      final pgn2 = await repoString.getGamePgn('g2');
      expect(pgn2, equals('1. e4 e5 2. Nf3'));
    });

    test('getRatingHistory parses rating history entries correctly', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/users/me/ratings/rapid/history'));
        expect(request.url.queryParameters['limit'], equals('20'));

        return http.Response(
          jsonEncode([
            {
              'rating': 1525,
              'previousRating': 1510,
              'delta': 15,
              'gameId': 'game-win',
              'createdAt': '2026-09-24T14:30:00.000Z',
            },
            {
              'rating': 1510,
              'previous_rating': 1520,
              'delta': -10,
              'game_id': 'game-loss',
              'createdAt': '2026-09-24T13:00:00.000Z',
            }
          ]),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = GamesRepository(apiClient);

      final history = await repo.getRatingHistory('rapid', limit: 20);
      expect(history.length, equals(2));
      expect(history[0].rating, equals(1525));
      expect(history[0].previousRating, equals(1510));
      expect(history[0].delta, equals(15));
      expect(history[0].gameId, equals('game-win'));
      expect(history[0].createdAt, isNotNull);

      expect(history[1].rating, equals(1510));
      expect(history[1].previousRating, equals(1520));
      expect(history[1].delta, equals(-10));
      expect(history[1].gameId, equals('game-loss'));
    });
  });
}
