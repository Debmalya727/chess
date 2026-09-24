class ApiException implements Exception {
  final String code;
  final String message;
  final int? statusCode;

  const ApiException({
    required this.code,
    required this.message,
    this.statusCode,
  });

  @override
  String toString() => 'ApiException($code, $message, status: $statusCode)';

  factory ApiException.networkError(dynamic err) {
    return ApiException(
      code: 'NETWORK_ERROR',
      message: 'Network connection failed. Please verify your internet connection.',
      statusCode: null,
    );
  }

  factory ApiException.timeout() {
    return const ApiException(
      code: 'TIMEOUT',
      message: 'Connection timed out. Render server may be spinning up from idle.',
      statusCode: 408,
    );
  }

  factory ApiException.unauthorized([String? message]) {
    return ApiException(
      code: 'UNAUTHORIZED',
      message: message ?? 'Session expired or authentication invalid. Please sign in.',
      statusCode: 401,
    );
  }
}
