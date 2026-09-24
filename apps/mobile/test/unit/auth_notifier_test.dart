import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/config/app_config.dart';
import 'package:chess_mobile/core/network/api_client.dart';
import 'package:chess_mobile/core/protocol/models/user_model.dart';
import 'package:chess_mobile/core/storage/secure_storage_service.dart';
import 'package:chess_mobile/core/websocket/ws_client.dart';
import 'package:chess_mobile/features/auth/data/auth_repository.dart';
import 'package:chess_mobile/features/auth/state/auth_notifier.dart';
import 'package:chess_mobile/features/auth/state/auth_state.dart';

class MockApiClient extends ApiClient {
  MockApiClient({required super.config, required super.storage});

  @override
  Future<dynamic> post(
    String path, {
    dynamic body,
    bool requiresAuth = true,
  }) async {
    if (path == '/api/auth/login') {
      final map = body is Map<String, dynamic> ? body : null;
      if (map?['password'] == 'valid_password') {
        return {
          'user': {
            'id': 'u1',
            'username': 'Kasparov',
            'email': 'g@chess.com',
            'rating': 2800,
          },
          'token': 'jwt_test_token_123',
        };
      }
      throw Exception('Invalid credentials');
    }
    return {};
  }

  @override
  Future<dynamic> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    bool requiresAuth = true,
  }) async {
    if (path == '/api/auth/me') {
      return {
        'user': {
          'id': 'u1',
          'username': 'Kasparov',
          'email': 'g@chess.com',
          'rating': 2800,
        },
      };
    }
    return {};
  }
}

void main() {
  group('AuthNotifier & Session Flow', () {
    late InMemoryStorageService storage;
    late MockApiClient apiClient;
    late AuthRepository authRepository;
    late WsClient wsClient;

    setUp(() {
      storage = InMemoryStorageService();
      apiClient = MockApiClient(config: AppConfig.development, storage: storage);
      authRepository = AuthRepository(apiClient: apiClient, storage: storage);
      wsClient = WsClient(config: AppConfig.development);
    });

    tearDown(() {
      wsClient.dispose();
    });

    test('Initial startup with empty storage restores to unauthenticated state', () async {
      final notifier = AuthNotifier(authRepository: authRepository, wsClient: wsClient);

      // Await session restoration
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(notifier.state.isAuthenticated, isFalse);
      expect(notifier.state.status, equals(AuthStatus.unauthenticated));
    });

    test('Initial startup with stored token restores authenticated session', () async {
      final cachedUser = UserModel(id: 'u1', username: 'Kasparov', rating: 2800);
      await storage.saveAuthToken('stored_token_999');
      await storage.saveUserProfile(jsonEncode(cachedUser.toJson()));

      final notifier = AuthNotifier(authRepository: authRepository, wsClient: wsClient);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(notifier.state.isAuthenticated, isTrue);
      expect(notifier.state.user?.username, equals('Kasparov'));
      expect(notifier.state.token, equals('stored_token_999'));
    });

    test('Login with valid credentials sets user and persists token', () async {
      final notifier = AuthNotifier(authRepository: authRepository, wsClient: wsClient);
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final success = await notifier.login('Kasparov', 'valid_password');
      expect(success, isTrue);
      expect(notifier.state.isAuthenticated, isTrue);
      expect(notifier.state.token, equals('jwt_test_token_123'));
      expect(await storage.getAuthToken(), equals('jwt_test_token_123'));
    });

    test('Logout clears state and removes token from storage', () async {
      await storage.saveAuthToken('active_token');
      final notifier = AuthNotifier(authRepository: authRepository, wsClient: wsClient);
      await Future<void>.delayed(const Duration(milliseconds: 20));

      await notifier.logout();
      expect(notifier.state.isAuthenticated, isFalse);
      expect(notifier.state.token, isNull);
      expect(await storage.getAuthToken(), isNull);
    });
  });
}
