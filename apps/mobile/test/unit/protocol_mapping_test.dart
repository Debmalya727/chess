import 'package:flutter_test/flutter_test.dart';
import 'package:chess_mobile/core/protocol/ws_events.dart';
import 'package:chess_mobile/core/protocol/error_codes.dart';
import 'package:chess_mobile/core/protocol/models/user_model.dart';
import 'package:chess_mobile/core/protocol/models/game_models.dart';

void main() {
  group('Protocol Mapping & Error Codes', () {
    test('WebSocket event constants match backend protocol', () {
      expect(WsEvents.authToken, equals('auth:token'));
      expect(WsEvents.authSuccess, equals('auth:success'));
      expect(WsEvents.error, equals('error'));
      expect(WsEvents.gameInit, equals('game:init'));
      expect(WsEvents.moveSubmit, equals('move:submit'));
      expect(WsEvents.moveAccepted, equals('move:accepted'));
      expect(WsEvents.clockTick, equals('clock:tick'));
      expect(WsEvents.queueJoin, equals('queue:join'));
      expect(WsEvents.tournamentRoundStarted, equals('tournament:round_started'));
    });

    test('Error codes match backend protocol', () {
      expect(ErrorCodes.unauthorized, equals('UNAUTHORIZED'));
      expect(ErrorCodes.forbidden, equals('FORBIDDEN'));
      expect(ErrorCodes.invalidMove, equals('INVALID_MOVE'));
      expect(ErrorCodes.notYourTurn, equals('NOT_YOUR_TURN'));
      expect(ErrorCodes.staleState, equals('STALE_STATE'));
      expect(ErrorCodes.gameNotFound, equals('GAME_NOT_FOUND'));
      expect(ErrorCodes.rateLimited, equals('RATE_LIMITED'));
    });

    test('UserModel JSON serialization and deserialization', () {
      final json = {
        'id': 'user_123',
        'username': 'GrandmasterFlash',
        'email': 'gm@chess.org',
        'rating': 2150,
        'createdAt': '2026-01-01T00:00:00.000Z',
      };

      final user = UserModel.fromJson(json);
      expect(user.id, equals('user_123'));
      expect(user.username, equals('GrandmasterFlash'));
      expect(user.rating, equals(2150));
      expect(user.toJson()['username'], equals('GrandmasterFlash'));
    });

    test('GameInitPayload serialization and deserialization', () {
      final json = {
        'gameId': 'game_abc',
        'roomCode': 'ROOM1',
        'status': 'active',
        'whitePlayerId': 'p1',
        'blackPlayerId': 'p2',
        'whiteUsername': 'PlayerWhite',
        'blackUsername': 'PlayerBlack',
        'whiteRating': 1500,
        'blackRating': 1520,
        'timeControl': '10+0',
        'fen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'turn': 'w',
        'moves': [],
        'clocks': {
          'whiteRemainingMs': 600000,
          'blackRemainingMs': 600000,
          'activeColor': 'w',
          'isRunning': true,
        },
        'stateVersion': 1,
        'color': 'w',
      };

      final payload = GameInitPayload.fromJson(json);
      expect(payload.gameId, equals('game_abc'));
      expect(payload.stateVersion, equals(1));
      expect(payload.color, equals('w'));
      expect(payload.clocks?.whiteRemainingMs, equals(600000));
    });

    test('MoveSubmitPayload envelope matches server requirements', () {
      final payload = MoveSubmitPayload(
        gameId: 'game_xyz',
        from: 'e2',
        to: 'e4',
        clientMoveId: 'cm_001',
        expectedStateVersion: 3,
      );

      final json = payload.toJson();
      expect(json['gameId'], equals('game_xyz'));
      expect(json['from'], equals('e2'));
      expect(json['to'], equals('e4'));
      expect(json['clientMoveId'], equals('cm_001'));
      expect(json['expectedStateVersion'], equals(3));
    });

    test('ClockTickPayload parsing and remaining time calculation', () {
      final json = {
        'gameId': 'game_xyz',
        'whiteTimeRemaining': 598000,
        'blackTimeRemaining': 600000,
        'activeColor': 'w',
        'serverTime': 1720000002000,
      };

      final tick = ClockTickPayload.fromJson(json);
      expect(tick.whiteTimeRemaining, equals(598000));
      expect(tick.activeColor, equals('w'));
    });
  });
}
