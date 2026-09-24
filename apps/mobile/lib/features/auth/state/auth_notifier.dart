import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exceptions.dart';
import '../../../core/storage/secure_storage_service.dart';
import '../../../core/websocket/ws_client.dart';
import '../../../core/websocket/ws_connection_state.dart';
import '../data/auth_repository.dart';
import 'auth_state.dart';

// Providers
final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.current);

final storageServiceProvider = Provider<StorageService>((ref) {
  return SecureStorageService();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    config: ref.watch(appConfigProvider),
    storage: ref.watch(storageServiceProvider),
  );
});

final wsClientProvider = Provider<WsClient>((ref) {
  final client = WsClient(config: ref.watch(appConfigProvider));
  ref.onDispose(() => client.dispose());
  return client;
});

final wsConnectionStreamProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionStateStream;
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    apiClient: ref.watch(apiClientProvider),
    storage: ref.watch(storageServiceProvider),
  );
});

final authNotifierProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    authRepository: ref.watch(authRepositoryProvider),
    wsClient: ref.watch(wsClientProvider),
  );
});

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository authRepository;
  final WsClient wsClient;

  AuthNotifier({
    required this.authRepository,
    required this.wsClient,
  }) : super(AuthState.initial) {
    restoreSession();
  }

  Future<void> restoreSession() async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final token = await authRepository.getSavedToken();
      if (token == null || token.isEmpty) {
        state = AuthState.unauthenticated;
        return;
      }

      // First load cached user for instant offline UI
      final cachedUser = await authRepository.getCachedUser();
      if (cachedUser != null) {
        state = AuthState(
          status: AuthStatus.authenticated,
          user: cachedUser,
          token: token,
        );
        wsClient.connect(token);
      }

      // Verify and refresh with live server
      try {
        final liveUser = await authRepository.fetchCurrentUser();
        state = AuthState(
          status: AuthStatus.authenticated,
          user: liveUser,
          token: token,
        );
      } on ApiException catch (e) {
        if (e.statusCode == 401) {
          await authRepository.logout();
          wsClient.disconnect();
          state = AuthState.unauthenticated;
        }
      } catch (_) {
        // Keep cached state if offline
      }
    } catch (_) {
      state = AuthState.unauthenticated;
    }
  }

  Future<bool> login(String identifier, String password) async {
    state = state.copyWith(status: AuthStatus.loading, errorMessage: null);
    try {
      final result = await authRepository.login(identifier: identifier, password: password);
      state = AuthState(
        status: AuthStatus.authenticated,
        user: result.user,
        token: result.token,
      );
      wsClient.connect(result.token);
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(status: AuthStatus.error, errorMessage: e.message);
      return false;
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Login failed. Please check connection and credentials.',
      );
      return false;
    }
  }

  Future<bool> register(String username, String email, String password) async {
    state = state.copyWith(status: AuthStatus.loading, errorMessage: null);
    try {
      final result = await authRepository.register(
        username: username,
        email: email,
        password: password,
      );
      state = AuthState(
        status: AuthStatus.authenticated,
        user: result.user,
        token: result.token,
      );
      wsClient.connect(result.token);
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(status: AuthStatus.error, errorMessage: e.message);
      return false;
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: 'Registration failed. Please try again.',
      );
      return false;
    }
  }

  Future<void> logout() async {
    await authRepository.logout();
    wsClient.disconnect();
    state = AuthState.unauthenticated;
  }
}
