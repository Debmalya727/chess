import { WS_EVENTS } from '@chess/protocol';

export class ChessWebSocketClient {
  constructor() {
    this.socket = null;
    this.status = 'DISCONNECTED'; // DISCONNECTED | CONNECTING | CONNECTED | RECONNECTING
    this.listeners = new Map();   // eventName -> Set of callbacks
    this.statusListeners = new Set();
    this.reconnectTimer = null;
    this.token = null;
    this.currentRoomCode = null;
  }

  connect(token) {
    if (token) this.token = token;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this._setStatus(this.status === 'DISCONNECTED' ? 'CONNECTING' : 'RECONNECTING');

    const isPort5173 = typeof window !== 'undefined' && window.location.port === '5173';
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000';
    const defaultWsUrl = isPort5173 ? 'ws://localhost:8000/ws' : `${protocol}//${host}/ws`;
    
    let wsUrl = defaultWsUrl;
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL) {
      const trimmed = import.meta.env.VITE_WS_URL.replace(/\/+$/, '');
      wsUrl = trimmed.endsWith('/ws') ? trimmed : `${trimmed}/ws`;
    }

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this._setStatus('CONNECTED');
      if (this.token) {
        this.send(WS_EVENTS.AUTH_TOKEN, { token: this.token });
      }
      const activeRoom = this.currentRoomCode || localStorage.getItem('chess_active_room');
      if (activeRoom) {
        this.currentRoomCode = activeRoom;
        this.send(WS_EVENTS.ROOM_JOIN, { roomCode: activeRoom });
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data);
        const { event: eventName, payload } = envelope;
        this._emit(eventName, payload);
      } catch (err) {
        console.warn('[WS Client] Message parse error:', err);
      }
    };

    this.socket.onclose = () => {
      this._setStatus('RECONNECTING');
      this.socket = null;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.token) this.connect(this.token);
      }, 3000);
    };

    this.socket.onerror = (err) => {
      console.warn('[WS Client] WebSocket error:', err);
    };
  }

  send(event, payload = {}) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        event,
        payload,
        timestamp: Date.now(),
        requestId: `req_${Math.random().toString(36).substring(2, 8)}`
      }));
    } else {
      console.warn('[WS Client] Cannot send event - WebSocket not connected:', event);
    }
  }

  createRoom(timeControl = '10+0', colorPreference = 'random') {
    this.send(WS_EVENTS.ROOM_CREATE, { timeControl, colorPreference });
  }

  joinRoom(roomCode) {
    this.currentRoomCode = roomCode;
    this.send(WS_EVENTS.ROOM_JOIN, { roomCode });
  }

  submitMove(gameId, from, to, promotion = null) {
    const clientMoveId = `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.send(WS_EVENTS.MOVE_SUBMIT, { gameId, from, to, promotion, clientMoveId });
  }

  offerDraw(gameId) {
    this.send(WS_EVENTS.DRAW_OFFER, { gameId });
  }

  respondDraw(gameId, accept) {
    this.send(WS_EVENTS.DRAW_RESPOND, { gameId, accept });
  }

  joinQueue(timeControl = '10+0') {
    this.send(WS_EVENTS.QUEUE_JOIN, { timeControl });
  }

  leaveQueue() {
    this.send(WS_EVENTS.QUEUE_LEAVE, {});
  }

  getQueueStatus() {
    this.send(WS_EVENTS.QUEUE_STATUS, {});
  }

  resign(gameId) {
    this.send(WS_EVENTS.GAME_RESIGN, { gameId });
  }


  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  onStatusChange(callback) {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  _setStatus(status) {
    this.status = status;
    this.statusListeners.forEach(cb => cb(status));
  }

  _emit(event, payload) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb(payload));
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this._setStatus('DISCONNECTED');
  }
}

export const globalWsClient = new ChessWebSocketClient();
if (typeof window !== 'undefined') {
  window.globalWsClient = globalWsClient;
}

