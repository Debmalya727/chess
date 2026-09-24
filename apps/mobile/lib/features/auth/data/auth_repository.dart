import 'dart:convert';
import '../../../core/network/api_client.dart';
import '../../../core/protocol/models/user_model.dart';
import '../../../core/storage/secure_storage_service.dart';

class AuthRepository {
  final ApiClient apiClient;
  final StorageService storage;

  AuthRepository({
    required this.apiClient,
    required this.storage,
  });

  Future<AuthResult> login({required String identifier, required String password}) async {
    final response = await apiClient.post(
      '/api/auth/login',
      body: {'identifier': identifier, 'password': password},
      requiresAuth: false,
    );

    final user = UserModel.fromJson(response['user'] as Map<String, dynamic>);
    final token = response['token'] as String;

    await storage.saveAuthToken(token);
    await storage.saveUserProfile(jsonEncode(user.toJson()));

    return AuthResult(user: user, token: token);
  }

  Future<AuthResult> register({
    required String username,
    required String email,
    required String password,
  }) async {
    final response = await apiClient.post(
      '/api/auth/register',
      body: {'username': username, 'email': email, 'password': password},
      requiresAuth: false,
    );

    final user = UserModel.fromJson(response['user'] as Map<String, dynamic>);
    final token = response['token'] as String;

    await storage.saveAuthToken(token);
    await storage.saveUserProfile(jsonEncode(user.toJson()));

    return AuthResult(user: user, token: token);
  }

  Future<void> logout() async {
    try {
      await apiClient.post('/api/auth/logout');
    } catch (_) {
      // Local clean-up proceeds even if server connection is dropped
    } finally {
      await storage.clearAuthToken();
      await storage.clearUserProfile();
    }
  }

  Future<UserModel?> getCachedUser() async {
    final raw = await storage.getUserProfile();
    if (raw != null) {
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        return UserModel.fromJson(json);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  Future<String?> getSavedToken() async {
    return await storage.getAuthToken();
  }

  Future<UserModel> fetchCurrentUser() async {
    final response = await apiClient.get('/api/auth/me');
    final user = UserModel.fromJson(response['user'] as Map<String, dynamic>);
    await storage.saveUserProfile(jsonEncode(user.toJson()));
    return user;
  }
}

class AuthResult {
  final UserModel user;
  final String token;

  const AuthResult({required this.user, required this.token});
}
