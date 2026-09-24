enum AppEnvironment { development, staging, production }

class AppConfig {
  final AppEnvironment environment;
  final String apiBaseUrl;
  final String wsBaseUrl;
  final Duration connectTimeout;
  final Duration receiveTimeout;

  const AppConfig({
    required this.environment,
    required this.apiBaseUrl,
    required this.wsBaseUrl,
    this.connectTimeout = const Duration(seconds: 15),
    this.receiveTimeout = const Duration(seconds: 15),
  });

  static const AppConfig production = AppConfig(
    environment: AppEnvironment.production,
    apiBaseUrl: 'https://chess-api-hszp.onrender.com',
    wsBaseUrl: 'wss://chess-api-hszp.onrender.com/ws',
  );

  static const AppConfig development = AppConfig(
    environment: AppEnvironment.development,
    apiBaseUrl: 'http://10.0.2.2:10000', // Standard Android emulator localhost alias
    wsBaseUrl: 'ws://10.0.2.2:10000/ws',
  );

  static const AppConfig staging = AppConfig(
    environment: AppEnvironment.staging,
    apiBaseUrl: 'https://chess-api-hszp.onrender.com',
    wsBaseUrl: 'wss://chess-api-hszp.onrender.com/ws',
  );

  static AppConfig current = production;
}
