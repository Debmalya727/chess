import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../storage/secure_storage_service.dart';
import 'api_exceptions.dart';

class ApiClient {
  final AppConfig config;
  final StorageService storage;
  final http.Client _httpClient;

  ApiClient({
    required this.config,
    required this.storage,
    http.Client? httpClient,
  }) : _httpClient = httpClient ?? http.Client();

  Future<Map<String, String>> _buildHeaders({bool requiresAuth = true}) async {
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (requiresAuth) {
      final token = await storage.getAuthToken();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    return headers;
  }

  Uri _buildUri(String path, [Map<String, dynamic>? queryParameters]) {
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final base = config.apiBaseUrl;
    final uri = Uri.parse('$base$cleanPath');

    if (queryParameters != null && queryParameters.isNotEmpty) {
      final stringParams = queryParameters.map((k, v) => MapEntry(k, v.toString()));
      return uri.replace(queryParameters: stringParams);
    }
    return uri;
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? queryParameters, bool requiresAuth = true}) async {
    try {
      final uri = _buildUri(path, queryParameters);
      final headers = await _buildHeaders(requiresAuth: requiresAuth);

      final response = await _httpClient
          .get(uri, headers: headers)
          .timeout(config.receiveTimeout);

      return _handleResponse(response);
    } on TimeoutException {
      throw ApiException.timeout();
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException.networkError(e);
    }
  }

  Future<dynamic> post(String path, {dynamic body, bool requiresAuth = true}) async {
    try {
      final uri = _buildUri(path);
      final headers = await _buildHeaders(requiresAuth: requiresAuth);
      final encodedBody = body != null ? jsonEncode(body) : null;

      final response = await _httpClient
          .post(uri, headers: headers, body: encodedBody)
          .timeout(config.receiveTimeout);

      return _handleResponse(response);
    } on TimeoutException {
      throw ApiException.timeout();
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException.networkError(e);
    }
  }

  Future<dynamic> delete(String path, {bool requiresAuth = true}) async {
    try {
      final uri = _buildUri(path);
      final headers = await _buildHeaders(requiresAuth: requiresAuth);

      final response = await _httpClient
          .delete(uri, headers: headers)
          .timeout(config.receiveTimeout);

      return _handleResponse(response);
    } on TimeoutException {
      throw ApiException.timeout();
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException.networkError(e);
    }
  }

  dynamic _handleResponse(http.Response response) {
    dynamic jsonBody;
    if (response.body.isNotEmpty) {
      try {
        jsonBody = jsonDecode(response.body);
      } catch (_) {
        jsonBody = response.body;
      }
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonBody;
    }

    if (response.statusCode == 401) {
      final msg = (jsonBody is Map) ? jsonBody['message'] as String? : null;
      throw ApiException.unauthorized(msg);
    }

    String errorCode = 'HTTP_${response.statusCode}';
    String errorMessage = 'Request failed with status ${response.statusCode}';

    if (jsonBody is Map<String, dynamic>) {
      errorCode = jsonBody['error'] as String? ?? jsonBody['code'] as String? ?? errorCode;
      errorMessage = jsonBody['message'] as String? ?? errorMessage;
    }

    throw ApiException(
      code: errorCode,
      message: errorMessage,
      statusCode: response.statusCode,
    );
  }

  void dispose() {
    _httpClient.close();
  }
}
