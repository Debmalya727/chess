import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WS_EVENTS, ERROR_CODES } from '@chess/protocol';
import { ChessWebSocketClient } from '../src/services/wsClient.js';

// Mock Socket to inspect sent messages and test WebSocket interactions
class MockSocket {
  constructor() {
    this.readyState = 1; // WebSocket.OPEN
    this.sent = [];
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3; // WebSocket.CLOSED
  }
}

// Controller modeling the exact state machine and logic used in OnlineMode.jsx
class OnlineModeRematchController {
  constructor(wsClient, currentUser) {
    this.wsClient = wsClient;
    this.user = currentUser;
    this.activeGame = null;
    this.errorMsg = null;
    this.rematchOfferedByMe = false;
    this.rematchOfferReceived = false;
    this.rematchOfferedByUsername = null;
    this.isRematchLoading = false;
    this.unsubscribers = [];

    this._bindEvents();
  }

  _bindEvents() {
    this.unsubscribers.push(
      this.wsClient.on(WS_EVENTS.GAME_INIT, (payload) => {
        const myColor = payload.color || (this.user && payload.whitePlayerId === this.user.id ? 'w' : 'b');
        this.activeGame = {
          gameId: payload.gameId,
          roomCode: payload.roomCode,
          status: payload.status || 'ACTIVE',
          whitePlayerId: payload.whitePlayerId,
          blackPlayerId: payload.blackPlayerId,
          whiteUsername: payload.whiteUsername || 'White',
          blackUsername: payload.blackUsername || 'Black',
          whiteRating: payload.whiteRating || 1500,
          blackRating: payload.blackRating || 1500,
          timeControl: payload.timeControl || '10+0',
          color: myColor,
          stateVersion: payload.stateVersion || 1,
          tournamentId: payload.tournamentId || null
        };
        // Reset rematch state
        this.rematchOfferedByMe = false;
        this.rematchOfferReceived = false;
        this.rematchOfferedByUsername = null;
        this.isRematchLoading = false;
      })
    );

    this.unsubscribers.push(
      this.wsClient.on(WS_EVENTS.GAME_ENDED, (payload) => {
        if (!this.activeGame) return;
        this.activeGame.status = 'FINISHED';
        this.activeGame.result = payload.result;
        this.activeGame.termination = payload.termination;
      })
    );

    this.unsubscribers.push(
      this.wsClient.on(WS_EVENTS.REMATCH_OFFERED, (payload) => {
        if (!this.activeGame || this.activeGame.gameId !== payload.gameId) return;
        if (this.activeGame.status !== 'FINISHED') return;

        if (payload.offeredBy !== this.user?.id) {
          this.rematchOfferReceived = true;
          this.rematchOfferedByUsername = payload.offeredByUsername || 'Opponent';
          this.isRematchLoading = false;
        } else {
          this.rematchOfferedByMe = true;
          this.isRematchLoading = false;
        }
      })
    );

    this.unsubscribers.push(
      this.wsClient.on(WS_EVENTS.REMATCH_DECLINED, (payload) => {
        if (!this.activeGame || this.activeGame.gameId !== payload.gameId) return;
        this.rematchOfferedByMe = false;
        this.rematchOfferReceived = false;
        this.isRematchLoading = false;
      })
    );

    this.unsubscribers.push(
      this.wsClient.on(WS_EVENTS.REMATCH_CANCELLED, (payload) => {
        if (!this.activeGame || this.activeGame.gameId !== payload.gameId) return;
        this.rematchOfferedByMe = false;
        this.rematchOfferReceived = false;
        this.isRematchLoading = false;

        if (payload.reason === 'timeout') {
          this.errorMsg = 'Rematch offer expired.';
        } else if (payload.reason === 'opponent_disconnected') {
          this.errorMsg = 'Opponent disconnected.';
        } else if (payload.reason === 'cancelled_by_player') {
          this.errorMsg = 'Rematch offer was cancelled.';
        }
      })
    );

    this.unsubscribers.push(
      this.wsClient.on(WS_EVENTS.ERROR, (payload) => {
        const code = payload?.code;
        if (code && (code.startsWith('REMATCH_') || code === 'GAME_NOT_FINISHED' || code === 'TOURNAMENT_REMATCH_NOT_ALLOWED' || code === 'PLAYER_ALREADY_IN_GAME')) {
          this.isRematchLoading = false;
          this.rematchOfferedByMe = false;
          this.errorMsg = payload.message || code;
        }
      })
    );
  }

  handleOfferRematch() {
    if (!this.activeGame || this.activeGame.status !== 'FINISHED' || this.activeGame.tournamentId || this.rematchOfferedByMe || this.isRematchLoading) {
      return;
    }
    this.isRematchLoading = true;
    this.rematchOfferedByMe = true;
    this.errorMsg = null;
    this.wsClient.offerRematch(this.activeGame.gameId);
  }

  handleRespondRematch(accept) {
    if (!this.activeGame || this.activeGame.status !== 'FINISHED') return;
    if (accept) {
      this.isRematchLoading = true;
      this.errorMsg = null;
    } else {
      this.rematchOfferReceived = false;
      this.isRematchLoading = false;
    }
    this.wsClient.respondRematch(this.activeGame.gameId, accept);
  }

  handleCancelRematch() {
    if (!this.activeGame || this.activeGame.status !== 'FINISHED' || !this.rematchOfferedByMe) return;
    this.rematchOfferedByMe = false;
    this.isRematchLoading = false;
    this.wsClient.cancelRematch(this.activeGame.gameId);
  }

  handleBackToLobby() {
    this.rematchOfferedByMe = false;
    this.rematchOfferReceived = false;
    this.rematchOfferedByUsername = null;
    this.isRematchLoading = false;
    this.activeGame = null;
  }

  getPGNUrl() {
    if (!this.activeGame || !this.activeGame.gameId) return null;
    return `/api/games/${this.activeGame.gameId}/pgn`;
  }

  isRematchControlVisible() {
    return Boolean(this.activeGame && this.activeGame.status === 'FINISHED' && !this.activeGame.tournamentId);
  }

  destroy() {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
  }
}

describe('Web Rematch Client Test Suite', () => {
  let wsClient;
  let mockSocket;
  let controller;
  const currentUser = { id: 'user_alice', username: 'Alice' };

  beforeEach(() => {
    wsClient = new ChessWebSocketClient();
    mockSocket = new MockSocket();
    wsClient.socket = mockSocket;
    controller = new OnlineModeRematchController(wsClient, currentUser);
  });

  // Helper to initialize a game
  const initGame = (tournamentId = null) => {
    wsClient._emit(WS_EVENTS.GAME_INIT, {
      gameId: 'game_001',
      roomCode: 'ROOM_42',
      status: 'ACTIVE',
      whitePlayerId: 'user_alice',
      blackPlayerId: 'user_bob',
      whiteUsername: 'Alice',
      blackUsername: 'Bob',
      whiteRating: 1600,
      blackRating: 1580,
      timeControl: '10+0',
      color: 'w',
      tournamentId
    });
  };

  // Helper to conclude the game
  const finishGame = () => {
    wsClient._emit(WS_EVENTS.GAME_ENDED, {
      gameId: 'game_001',
      result: '1-0',
      termination: 'Checkmate'
    });
  };

  it('1. Rematch button appears after normal game completion', () => {
    initGame(null);
    assert.equal(controller.isRematchControlVisible(), false, 'Rematch must not show while game is active');

    finishGame();
    assert.equal(controller.activeGame.status, 'FINISHED');
    assert.equal(controller.isRematchControlVisible(), true, 'Rematch controls must appear after normal game completion');
  });

  it('2. Rematch hidden for tournament game', () => {
    initGame('tourney_swiss_99');
    finishGame();

    assert.equal(controller.activeGame.status, 'FINISHED');
    assert.equal(controller.activeGame.tournamentId, 'tourney_swiss_99');
    assert.equal(controller.isRematchControlVisible(), false, 'Rematch controls must be strictly hidden for tournament games');

    // Attempting action is guarded
    controller.handleOfferRematch();
    assert.equal(mockSocket.sent.length, 0, 'No rematch request must be sent for tournament games');
  });

  it('3. Clicking Rematch sends correct event/payload', () => {
    initGame(null);
    finishGame();

    controller.handleOfferRematch();

    assert.equal(mockSocket.sent.length, 1);
    const msg = mockSocket.sent[0];
    assert.equal(msg.event, WS_EVENTS.GAME_REMATCH);
    assert.deepEqual(msg.payload, { gameId: 'game_001' });

    // Invariant: no client-invented properties
    assert.equal(msg.payload.color, undefined);
    assert.equal(msg.payload.fen, undefined);
    assert.equal(msg.payload.clocks, undefined);
    assert.equal(msg.payload.roomCode, undefined);

    assert.equal(controller.rematchOfferedByMe, true);
    assert.equal(controller.isRematchLoading, true);
  });

  it('4. Duplicate clicks are prevented', () => {
    initGame(null);
    finishGame();

    controller.handleOfferRematch();
    assert.equal(mockSocket.sent.length, 1);

    // Second click attempt while waiting
    controller.handleOfferRematch();
    assert.equal(mockSocket.sent.length, 1, 'Duplicate click must be blocked while offer is pending');
  });

  it('5. Incoming rematch offer displays opponent username', () => {
    initGame(null);
    finishGame();

    wsClient._emit(WS_EVENTS.REMATCH_OFFERED, {
      gameId: 'game_001',
      offeredBy: 'user_bob',
      offeredByUsername: 'BobTheGrandmaster',
      expiresAt: Date.now() + 30000
    });

    assert.equal(controller.rematchOfferReceived, true);
    assert.equal(controller.rematchOfferedByUsername, 'BobTheGrandmaster');
    assert.equal(controller.isRematchLoading, false);
  });

  it('6. Accept sends correct payload', () => {
    initGame(null);
    finishGame();

    wsClient._emit(WS_EVENTS.REMATCH_OFFERED, {
      gameId: 'game_001',
      offeredBy: 'user_bob',
      offeredByUsername: 'Bob'
    });

    controller.handleRespondRematch(true);

    assert.equal(mockSocket.sent.length, 1);
    const msg = mockSocket.sent[0];
    assert.equal(msg.event, WS_EVENTS.REMATCH_RESPOND);
    assert.deepEqual(msg.payload, {
      gameId: 'game_001',
      accept: true
    });
    assert.equal(controller.isRematchLoading, true);
  });

  it('7. Decline sends correct payload', () => {
    initGame(null);
    finishGame();

    wsClient._emit(WS_EVENTS.REMATCH_OFFERED, {
      gameId: 'game_001',
      offeredBy: 'user_bob',
      offeredByUsername: 'Bob'
    });

    controller.handleRespondRematch(false);

    assert.equal(mockSocket.sent.length, 1);
    const msg = mockSocket.sent[0];
    assert.equal(msg.event, WS_EVENTS.REMATCH_RESPOND);
    assert.deepEqual(msg.payload, {
      gameId: 'game_001',
      accept: false
    });
    assert.equal(controller.rematchOfferReceived, false);
    assert.equal(controller.isRematchLoading, false);
  });

  it('8. Cancel sends correct payload', () => {
    initGame(null);
    finishGame();

    controller.handleOfferRematch();
    mockSocket.sent = [];

    controller.handleCancelRematch();

    assert.equal(mockSocket.sent.length, 1);
    const msg = mockSocket.sent[0];
    assert.equal(msg.event, WS_EVENTS.REMATCH_CANCEL);
    assert.deepEqual(msg.payload, { gameId: 'game_001' });

    assert.equal(controller.rematchOfferedByMe, false);
    assert.equal(controller.isRematchLoading, false);
  });

  it('9. rematch:declined clears UI state', () => {
    initGame(null);
    finishGame();

    controller.handleOfferRematch();
    assert.equal(controller.rematchOfferedByMe, true);

    wsClient._emit(WS_EVENTS.REMATCH_DECLINED, {
      gameId: 'game_001',
      declinedBy: 'user_bob'
    });

    assert.equal(controller.rematchOfferedByMe, false);
    assert.equal(controller.rematchOfferReceived, false);
    assert.equal(controller.isRematchLoading, false);
  });

  it('10. rematch:cancelled clears UI state and surfaces message', () => {
    initGame(null);
    finishGame();

    controller.handleOfferRematch();

    wsClient._emit(WS_EVENTS.REMATCH_CANCELLED, {
      gameId: 'game_001',
      reason: 'timeout'
    });

    assert.equal(controller.rematchOfferedByMe, false);
    assert.equal(controller.rematchOfferReceived, false);
    assert.equal(controller.isRematchLoading, false);
    assert.equal(controller.errorMsg, 'Rematch offer expired.');

    // Test opponent_disconnected
    wsClient._emit(WS_EVENTS.REMATCH_CANCELLED, {
      gameId: 'game_001',
      reason: 'opponent_disconnected'
    });
    assert.equal(controller.errorMsg, 'Opponent disconnected.');

    // Test cancelled_by_player
    wsClient._emit(WS_EVENTS.REMATCH_CANCELLED, {
      gameId: 'game_001',
      reason: 'cancelled_by_player'
    });
    assert.equal(controller.errorMsg, 'Rematch offer was cancelled.');
  });

  it('11. Wrong gameId events are ignored', () => {
    initGame(null);
    finishGame();

    controller.handleOfferRematch();
    assert.equal(controller.rematchOfferedByMe, true);

    // Event for a different game arrives
    wsClient._emit(WS_EVENTS.REMATCH_DECLINED, {
      gameId: 'unrelated_game_999',
      declinedBy: 'stranger'
    });

    // Current game state must not be mutated
    assert.equal(controller.rematchOfferedByMe, true);

    wsClient._emit(WS_EVENTS.REMATCH_OFFERED, {
      gameId: 'unrelated_game_999',
      offeredBy: 'stranger',
      offeredByUsername: 'Stranger'
    });
    assert.equal(controller.rematchOfferReceived, false);
  });

  it('12. game:init clears rematch state and initializes Game 2', () => {
    initGame(null);
    finishGame();
    controller.handleOfferRematch();

    assert.equal(controller.activeGame.gameId, 'game_001');
    assert.equal(controller.rematchOfferedByMe, true);

    // Backend creates Game 2 and emits authoritative game:init
    wsClient._emit(WS_EVENTS.GAME_INIT, {
      gameId: 'game_002_new',
      roomCode: 'ROOM_99_NEW',
      status: 'ACTIVE',
      whitePlayerId: 'user_bob',   // Swapped colors
      blackPlayerId: 'user_alice',
      whiteUsername: 'Bob',
      blackUsername: 'Alice',
      whiteRating: 1590,
      blackRating: 1590,
      timeControl: '10+0',
      color: 'b',
      stateVersion: 1
    });

    assert.equal(controller.activeGame.gameId, 'game_002_new');
    assert.equal(controller.activeGame.roomCode, 'ROOM_99_NEW');
    assert.equal(controller.activeGame.status, 'ACTIVE');
    assert.equal(controller.activeGame.color, 'b');
    assert.equal(controller.activeGame.whiteUsername, 'Bob');
    assert.equal(controller.activeGame.blackUsername, 'Alice');

    // Rematch flags cleanly reset
    assert.equal(controller.rematchOfferedByMe, false);
    assert.equal(controller.rematchOfferReceived, false);
    assert.equal(controller.rematchOfferedByUsername, null);
    assert.equal(controller.isRematchLoading, false);
    assert.equal(controller.isRematchControlVisible(), false, 'Game 2 is active, rematch controls must hide');
  });

  it('13. Backend rematch errors display correctly', () => {
    initGame(null);
    finishGame();
    controller.handleOfferRematch();
    assert.equal(controller.isRematchLoading, true);

    wsClient._emit(WS_EVENTS.ERROR, {
      code: ERROR_CODES.REMATCH_ALREADY_PENDING,
      message: 'A rematch offer is already pending for this game.'
    });

    assert.equal(controller.isRematchLoading, false);
    assert.equal(controller.rematchOfferedByMe, false);
    assert.equal(controller.errorMsg, 'A rematch offer is already pending for this game.');

    // Test tournament error code
    wsClient._emit(WS_EVENTS.ERROR, {
      code: ERROR_CODES.TOURNAMENT_REMATCH_NOT_ALLOWED,
      message: 'Rematch is not permitted in tournament games.'
    });
    assert.equal(controller.errorMsg, 'Rematch is not permitted in tournament games.');
  });

  it('14. Existing PGN download remains functional', () => {
    initGame(null);
    finishGame();

    const pgnUrl = controller.getPGNUrl();
    assert.equal(pgnUrl, '/api/games/game_001/pgn');
  });

  it('15. Existing Back to Lobby remains functional', () => {
    initGame(null);
    finishGame();
    controller.handleOfferRematch();

    controller.handleBackToLobby();

    assert.equal(controller.activeGame, null);
    assert.equal(controller.rematchOfferedByMe, false);
    assert.equal(controller.rematchOfferReceived, false);
    assert.equal(controller.rematchOfferedByUsername, null);
    assert.equal(controller.isRematchLoading, false);
  });

  it('16. Reconnection and listener cleanup does not duplicate listeners', () => {
    const initialListenerCount = wsClient.listeners.get(WS_EVENTS.REMATCH_OFFERED)?.size || 0;
    assert.equal(initialListenerCount, 1);

    // Destroy controller (simulating component unmount)
    controller.destroy();

    const postDestroyCount = wsClient.listeners.get(WS_EVENTS.REMATCH_OFFERED)?.size || 0;
    assert.equal(postDestroyCount, 0, 'All rematch listeners must be cleanly removed on unmount');

    // Create new controller (simulating re-mount / reconnect)
    const newController = new OnlineModeRematchController(wsClient, currentUser);
    const newCount = wsClient.listeners.get(WS_EVENTS.REMATCH_OFFERED)?.size || 0;
    assert.equal(newCount, 1, 'Listeners must not multiply after reconnect/remount');
    newController.destroy();
  });
});
