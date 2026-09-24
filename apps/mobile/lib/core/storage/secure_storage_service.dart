import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class StorageService {
  static const String tokenKey = 'auth_token';
  static const String userKey = 'auth_user_profile';

  Future<void> write(String key, String value);
  Future<String?> read(String key);
  Future<void> delete(String key);
  Future<void> deleteAll();

  Future<void> saveAuthToken(String token) => write(tokenKey, token);
  Future<String?> getAuthToken() => read(tokenKey);
  Future<void> clearAuthToken() => delete(tokenKey);

  Future<void> saveUserProfile(String jsonProfile) => write(userKey, jsonProfile);
  Future<String?> getUserProfile() => read(userKey);
  Future<void> clearUserProfile() => delete(userKey);
}

class SecureStorageService extends StorageService {
  final FlutterSecureStorage _storage;

  SecureStorageService({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  @override
  Future<void> write(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
    } catch (_) {
      // Platform exception fallback handled silently
    }
  }

  @override
  Future<String?> read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> delete(String key) async {
    try {
      await _storage.delete(key: key);
    } catch (_) {}
  }

  @override
  Future<void> deleteAll() async {
    try {
      await _storage.deleteAll();
    } catch (_) {}
  }
}

/// In-memory storage implementation for unit and widget tests
class InMemoryStorageService extends StorageService {
  final Map<String, String> _data = {};

  @override
  Future<void> write(String key, String value) async {
    _data[key] = value;
  }

  @override
  Future<String?> read(String key) async {
    return _data[key];
  }

  @override
  Future<void> delete(String key) async {
    _data.remove(key);
  }

  @override
  Future<void> deleteAll() async {
    _data.clear();
  }
}
