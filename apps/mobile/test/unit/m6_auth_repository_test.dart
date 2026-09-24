import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/network/api_client.dart';
import 'package:chess_mobile/core/network/api_exceptions.dart';
import 'package:chess_mobile/core/protocol/models/user_model.dart';
import 'package:chess_mobile/core/storage/secure_storage_service.dart';
import 'package:chess_mobile/features/auth/data/auth_repository.dart';

void main() {
  group('AuthRepository Tests', () {
    late InMemoryStorageService storage;

    setUp(() {
      storage = InMemoryStorageService();
    });

    test('login with valid credentials stores token and profile in storage', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/auth/login'));
        expect(request.method, equals('POST'));

        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['identifier'], equals('grandmaster'));
        expect(body['password'], equals('supersecret'));

        return http.Response(
          jsonEncode({
            'user': {
              'id': 'gm-1',
              'username': 'grandmaster',
              'email': 'gm@chess.test',
              'rating': 2500,
            },
            'token': 'jwt_auth_token_gm_1',
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
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      final result = await repo.login(
        identifier: 'grandmaster',
        password: 'supersecret',
      );

      expect(result.token, equals('jwt_auth_token_gm_1'));
      expect(result.user.id, equals('gm-1'));
      expect(result.user.username, equals('grandmaster'));
      expect(result.user.rating, equals(2500));

      // Assert token and profile stored in storage
      final savedToken = await storage.getAuthToken();
      expect(savedToken, equals('jwt_auth_token_gm_1'));
      final savedProfile = await storage.getUserProfile();
      expect(savedProfile, isNotNull);
      final parsed = jsonDecode(savedProfile!) as Map<String, dynamic>;
      expect(parsed['username'], equals('grandmaster'));
    });

    test('login with invalid credentials throws ApiException.unauthorized and does not save token', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'error': 'UNAUTHORIZED',
            'message': 'Invalid username or password',
          }),
          401,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      await expectLater(
        () => repo.login(identifier: 'baduser', password: 'wrongpassword'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 401)
              .having((e) => e.code, 'code', 'UNAUTHORIZED'),
        ),
      );

      expect(await storage.getAuthToken(), isNull);
      expect(await storage.getUserProfile(), isNull);
    });

    test('register with valid details creates user and stores credentials', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/auth/register'));
        expect(request.method, equals('POST'));

        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['username'], equals('new_player'));
        expect(body['email'], equals('player@test.com'));
        expect(body['password'], equals('securepass123'));

        return http.Response(
          jsonEncode({
            'user': {
              'id': 'new-user-42',
              'username': 'new_player',
              'email': 'player@test.com',
              'rating': 1200,
            },
            'token': 'jwt_registered_token_42',
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      final result = await repo.register(
        username: 'new_player',
        email: 'player@test.com',
        password: 'securepass123',
      );

      expect(result.token, equals('jwt_registered_token_42'));
      expect(result.user.id, equals('new-user-42'));
      expect(result.user.username, equals('new_player'));
      expect(await storage.getAuthToken(), equals('jwt_registered_token_42'));
    });

    test('register duplicate username or email propagates ApiException', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'code': 'USERNAME_TAKEN',
            'message': 'Username is already registered',
          }),
          409,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      await expectLater(
        () => repo.register(
          username: 'existing_user',
          email: 'another@test.com',
          password: 'pass',
        ),
        throwsA(
          isA<ApiException>()
              .having((e) => e.code, 'code', 'USERNAME_TAKEN')
              .having((e) => e.statusCode, 'statusCode', 409),
        ),
      );

      expect(await storage.getAuthToken(), isNull);
    });

    test('logout clears local tokens even if server logout request fails', () async {
      await storage.saveAuthToken('stale_token_123');
      await storage.saveUserProfile(jsonEncode({'id': 'u1', 'username': 'test'}));

      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/auth/logout'));
        return http.Response(
          jsonEncode({'error': 'GATEWAY_ERROR', 'message': 'Network timeout'}),
          502,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      // logout must not throw; it should absorb server error and still clear storage
      await repo.logout();

      expect(await storage.getAuthToken(), isNull);
      expect(await storage.getUserProfile(), isNull);
    });

    test('logout clears local tokens on successful server response', () async {
      await storage.saveAuthToken('valid_token_xyz');
      await storage.saveUserProfile(jsonEncode({'id': 'u1', 'username': 'test'}));

      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/auth/logout'));
        return http.Response(
          jsonEncode({'success': true}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      await repo.logout();

      expect(await storage.getAuthToken(), isNull);
      expect(await storage.getUserProfile(), isNull);
    });

    test('getCachedUser returns parsed user when valid json is stored', () async {
      final user = UserModel(id: 'u1', username: 'Kasparov', rating: 2851);
      await storage.saveUserProfile(jsonEncode(user.toJson()));

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
      );
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      final cached = await repo.getCachedUser();
      expect(cached, isNotNull);
      expect(cached!.id, equals('u1'));
      expect(cached.username, equals('Kasparov'));
      expect(cached.rating, equals(2851));
    });

    test('getCachedUser returns null when storage is empty or contains malformed json', () async {
      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
      );
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      expect(await repo.getCachedUser(), isNull);

      await storage.saveUserProfile('not-valid-json{{{');
      expect(await repo.getCachedUser(), isNull);
    });

    test('getSavedToken returns token from storage', () async {
      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
      );
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      expect(await repo.getSavedToken(), isNull);

      await storage.saveAuthToken('my_special_token');
      expect(await repo.getSavedToken(), equals('my_special_token'));
    });

    test('fetchCurrentUser updates cached user and returns user model', () async {
      await storage.saveAuthToken('active_token');

      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/auth/me'));
        expect(request.headers['Authorization'], equals('Bearer active_token'));

        return http.Response(
          jsonEncode({
            'user': {
              'id': 'u-live-99',
              'username': 'LivePlayer',
              'rating': 1800,
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
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      final user = await repo.fetchCurrentUser();
      expect(user.id, equals('u-live-99'));
      expect(user.username, equals('LivePlayer'));
      expect(user.rating, equals(1800));

      // Verifies storage was updated with live profile
      final cached = await repo.getCachedUser();
      expect(cached?.id, equals('u-live-99'));
      expect(cached?.username, equals('LivePlayer'));
    });

    test('fetchCurrentUser propagates network or auth error', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({'error': 'SESSION_EXPIRED', 'message': 'Token expired'}),
          401,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiClient = ApiClient(
        config: AppConfig.development,
        storage: storage,
        httpClient: mockClient,
      );
      final repo = AuthRepository(apiClient: apiClient, storage: storage);

      await expectLater(
        () => repo.fetchCurrentUser(),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'UNAUTHORIZED')),
      );
    });
  });
}
