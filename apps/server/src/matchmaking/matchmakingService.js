import { globalRoomManager } from '../rooms/roomManager.js';
import { globalGameManager } from '../games/gameManager.js';
import { createGame } from '../db/gameRepository.js';
import { getUserRating } from '../db/ratingRepository.js';
import { getRatingCategory } from '../ratings/ratingService.js';
import { getActiveGameForUser } from '../games/gameService.js';
import { InMemoryMatchmakingStore } from './inMemoryMatchmakingStore.js';
import { RedisMatchmakingStore } from './redisMatchmakingStore.js';
import { isRedisConnected, getRedisClient } from '../redis/redisClient.js';
import { globalPubSubService } from '../pubsub/pubSubService.js';
import { WS_EVENTS } from '@chess/protocol';

export class MatchmakingService {
  constructor(store = null) {
    this._customStore = store;
    this.checkInterval = null;
    this.isProcessingLock = false;
  }

  get store() {
    if (this._customStore) return this._customStore;
    if (isRedisConnected()) {
      if (!this._redisStore) this._redisStore = new RedisMatchmakingStore();
      return this._redisStore;
    }
    if (!this._memoryStore) this._memoryStore = new InMemoryMatchmakingStore();
    return this._memoryStore;
  }

  // Backwards compatibility getter for tests expecting service.queue
  get queue() {
    if (this.store instanceof InMemoryMatchmakingStore) {
      return this.store.entries;
    }
    // Return proxy mapping Map methods to async/sync store methods
    const store = this.store;
    return {
      has: (userId) => {
        if (store.entries) return store.entries.has(userId);
        return false;
      },
      get: (userId) => {
        if (store.entries) return store.entries.get(userId);
        return null;
      },
      set: (userId, entry) => {
        if (store.entries) store.entries.set(userId, entry);
      },
      delete: (userId) => {
        if (store.entries) return store.entries.delete(userId);
        return false;
      },
      get size() {
        if (store.entries) return store.entries.size;
        return 0;
      },
      values: () => {
        if (store.entries) return store.entries.values();
        return [][Symbol.iterator]();
      },
      entries: () => {
        if (store.entries) return store.entries.entries();
        return [][Symbol.iterator]();
      }
    };
  }

  start() {
    if (!this.checkInterval) {
      this.checkInterval = setInterval(() => this._processQueue(), 2000);
      if (this.checkInterval.unref) this.checkInterval.unref();
    }
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async joinQueue({ user, socket, timeControl = '10+0' }) {
    // 1. Check duplicate queue entry
    const isAlreadyQueued = await this.store.has(user.id);
    if (isAlreadyQueued) {
      return { error: 'ALREADY_IN_MATCHMAKING_QUEUE', message: 'User is already in matchmaking queue.' };
    }

    // 2. Check if player is already in an active room/game
    if (await getActiveGameForUser(user.id)) {
      return { error: 'PLAYER_ALREADY_IN_GAME', message: 'User is currently playing an active online game.' };
    }

    const ratingType = getRatingCategory(timeControl);
    const ratingRecord = await getUserRating(user.id, ratingType);

    const entry = {
      userId: user.id,
      user,
      socket,
      socketId: socket ? socket.id : null,
      timeControl,
      ratingType,
      rating: ratingRecord.rating,
      joinedAt: Date.now()
    };

    // Atomic Matchmaking Attempt
    if (!this.isProcessingLock) {
      this.isProcessingLock = true;
      try {
        const allEntries = await this.store.getAll();
        const match = this._findMatch(entry, allEntries);
        if (match) {
          let claimed = true;
          if (typeof this.store.claimPair === 'function') {
            claimed = await this.store.claimPair(entry.userId, match.userId);
          }

          if (claimed) {
            await this.store.remove(match.userId);
            return await this._createMatchedGame(entry, match);
          }
        }
      } finally {
        this.isProcessingLock = false;
      }
    }

    // Otherwise add to distributed store
    await this.store.add(user.id, entry);
    this.start();

    const searchDelta = Math.min(400, 100 + Math.floor((Date.now() - entry.joinedAt) / 5000) * 50);
    return {
      matched: false,
      queued: true,
      rating: entry.rating,
      ratingType,
      timeControl,
      minRating: Math.max(100, entry.rating - searchDelta),
      maxRating: entry.rating + searchDelta
    };
  }

  leaveQueue(userId) {
    if (this.store.entries) {
      const exists = this.store.entries.has(userId);
      if (exists) {
        this.store.entries.delete(userId);
        if (this.store.entries.size === 0) {
          this.stop();
        }
        return { success: true };
      }
      return { error: 'NOT_IN_QUEUE', message: 'User is not in matchmaking queue.' };
    }

    return (async () => {
      const exists = await this.store.has(userId);
      if (exists) {
        await this.store.remove(userId);
        const remaining = await this.store.size();
        if (remaining === 0) {
          this.stop();
        }
        return { success: true };
      }
      return { error: 'NOT_IN_QUEUE', message: 'User is not in matchmaking queue.' };
    })();
  }

  getQueueStatus(userId) {
    if (this.store.entries) {
      const entry = this.store.entries.get(userId);
      if (entry) {
        const now = Date.now();
        const searchDelta = Math.min(400, 100 + Math.floor((now - entry.joinedAt) / 5000) * 50);
        return {
          inQueue: true,
          timeControl: entry.timeControl,
          ratingType: entry.ratingType,
          rating: entry.rating,
          joinedAt: entry.joinedAt,
          minRating: Math.max(100, entry.rating - searchDelta),
          maxRating: entry.rating + searchDelta
        };
      }
      return { inQueue: false };
    }

    return (async () => {
      const entry = await this.store.get(userId);
      if (entry) {
        const now = Date.now();
        const searchDelta = Math.min(400, 100 + Math.floor((now - entry.joinedAt) / 5000) * 50);
        return {
          inQueue: true,
          timeControl: entry.timeControl,
          ratingType: entry.ratingType,
          rating: entry.rating,
          joinedAt: entry.joinedAt,
          minRating: Math.max(100, entry.rating - searchDelta),
          maxRating: entry.rating + searchDelta
        };
      }
      return { inQueue: false };
    })();
  }

  _findMatch(entry, candidateList = null) {
    const now = Date.now();
    const entryWaitSeconds = Math.floor((now - entry.joinedAt) / 1000);
    const entryMaxDelta = Math.min(400, 100 + Math.floor(entryWaitSeconds / 5) * 50);

    const list = candidateList || (this.store.entries ? Array.from(this.store.entries.values()) : []);

    for (const oppEntry of list) {
      if (oppEntry.userId === entry.userId) continue;
      if (oppEntry.timeControl !== entry.timeControl) continue;

      // Socket check for local entries
      if (oppEntry.socket && oppEntry.socket.readyState !== undefined && oppEntry.socket.readyState !== 1) {
        this.store.remove(oppEntry.userId).catch(() => {});
        continue;
      }

      const oppWaitSeconds = Math.floor((now - oppEntry.joinedAt) / 1000);
      const oppMaxDelta = Math.min(400, 100 + Math.floor(oppWaitSeconds / 5) * 50);
      const ratingDiff = Math.abs(entry.rating - oppEntry.rating);

      if (ratingDiff <= entryMaxDelta || ratingDiff <= oppMaxDelta) {
        return oppEntry;
      }
    }
    return null;
  }

  async _processQueue() {
    if (this.isProcessingLock) return;
    this.isProcessingLock = true;

    try {
      const now = Date.now();
      const entries = await this.store.getAll();

      for (const entry of entries) {
        const stillInQueue = await this.store.has(entry.userId);
        if (!stillInQueue) continue; // Already matched or cancelled

        // Cleanup stale entries older than 5 minutes
        if (now - entry.joinedAt > 300000) {
          await this.store.remove(entry.userId);
          continue;
        }

        const match = this._findMatch(entry, entries);
        if (match) {
          let claimed = true;
          if (typeof this.store.claimPair === 'function') {
            claimed = await this.store.claimPair(entry.userId, match.userId);
          }

          if (claimed) {
            await this.store.remove(entry.userId);
            await this.store.remove(match.userId);
            await this._createMatchedGame(entry, match);
          }
        }
      }
    } finally {
      this.isProcessingLock = false;
    }
  }

  async _createMatchedGame(playerA, playerB) {
    // Server-authoritative color selection
    const isPlayerAWhite = Math.random() < 0.5;
    const whitePlayer = isPlayerAWhite ? playerA : playerB;
    const blackPlayer = isPlayerAWhite ? playerB : playerA;

    // Create room locally
    const room = globalRoomManager.createRoom({
      hostUser: whitePlayer.user,
      timeControl: whitePlayer.timeControl,
      colorPreference: 'w'
    });

    room.whiteUsername = whitePlayer.user.username;
    room.blackUsername = blackPlayer.user.username;

    // Join black player
    globalRoomManager.joinRoom(room.roomCode, blackPlayer.user);

    // Track local sockets in room if present on this instance
    if (whitePlayer.socket) room.connectedSockets.set(whitePlayer.userId, whitePlayer.socket);
    if (blackPlayer.socket) room.connectedSockets.set(blackPlayer.userId, blackPlayer.socket);

    // If socket was not in entry (e.g., loaded from Redis), check active local sockets
    try {
      const { globalPresenceService } = await import('../presence/presenceService.js');
      for (const s of globalPresenceService.activeSockets.values()) {
        if (s.user && s.user.id === whitePlayer.userId && !room.connectedSockets.has(whitePlayer.userId)) {
          room.connectedSockets.set(whitePlayer.userId, s);
        }
        if (s.user && s.user.id === blackPlayer.userId && !room.connectedSockets.has(blackPlayer.userId)) {
          room.connectedSockets.set(blackPlayer.userId, s);
        }
      }
    } catch {}

    // Create game session
    const session = globalGameManager.getOrCreateSession(room);
    session.start();

    // Persist game authoritatively in TiDB
    await createGame({
      id: room.id,
      roomCode: room.roomCode,
      whitePlayerId: room.whitePlayerId,
      blackPlayerId: room.blackPlayerId,
      mode: 'ONLINE',
      status: 'ACTIVE',
      timeControl: room.timeControl,
      initialFen: session.game.getFen(),
      rated: true
    });

    // Cache ephemeral room metadata in Redis for instant cross-instance lookup
    if (isRedisConnected()) {
      try {
        const client = getRedisClient();
        const meta = JSON.stringify({
          id: room.id,
          roomCode: room.roomCode,
          whitePlayerId: room.whitePlayerId,
          blackPlayerId: room.blackPlayerId,
          whiteUsername: room.whiteUsername,
          blackUsername: room.blackUsername,
          timeControl: room.timeControl,
          status: room.status,
          initialFen: session.game.getFen(),
          rated: true
        });
        await client.set(`chess:game:meta:${room.roomCode}`, meta, 'EX', 3600);
        await client.set(`chess:game:meta:${room.id}`, meta, 'EX', 3600);
      } catch {}
    }

    // Construct init payload for sockets
    const initPayload = {
      gameId: room.id,
      roomCode: room.roomCode,
      fen: session.game.getFen(),
      timeControl: room.timeControl,
      status: 'ACTIVE',
      turn: session.game.getTurn(),
      clocks: session.clock.getTimes(),
      stateVersion: session.stateVersion,
      whitePlayer: { id: whitePlayer.userId, username: whitePlayer.user.username, rating: whitePlayer.rating },
      blackPlayer: { id: blackPlayer.userId, username: blackPlayer.user.username, rating: blackPlayer.rating }
    };

    // 1. Emit directly to local sockets if connected on this instance
    if (whitePlayer.socket && typeof whitePlayer.socket.send === 'function') {
      try {
        whitePlayer.socket.send(JSON.stringify({ event: WS_EVENTS.QUEUE_MATCHED, payload: { ...initPayload, color: 'w' } }));
        whitePlayer.socket.send(JSON.stringify({ event: WS_EVENTS.GAME_INIT, payload: { ...initPayload, color: 'w' } }));
      } catch {}
    }

    if (blackPlayer.socket && typeof blackPlayer.socket.send === 'function') {
      try {
        blackPlayer.socket.send(JSON.stringify({ event: WS_EVENTS.QUEUE_MATCHED, payload: { ...initPayload, color: 'b' } }));
        blackPlayer.socket.send(JSON.stringify({ event: WS_EVENTS.GAME_INIT, payload: { ...initPayload, color: 'b' } }));
      } catch {}
    }

    // 2. Publish over Pub/Sub to reach sockets on other Fastify instances
    await globalPubSubService.publishUserEvent(whitePlayer.userId, WS_EVENTS.QUEUE_MATCHED, { ...initPayload, color: 'w' });
    await globalPubSubService.publishUserEvent(whitePlayer.userId, WS_EVENTS.GAME_INIT, { ...initPayload, color: 'w' });

    await globalPubSubService.publishUserEvent(blackPlayer.userId, WS_EVENTS.QUEUE_MATCHED, { ...initPayload, color: 'b' });
    await globalPubSubService.publishUserEvent(blackPlayer.userId, WS_EVENTS.GAME_INIT, { ...initPayload, color: 'b' });

    return { matched: true, room, session };
  }
}

export const globalMatchmakingService = new MatchmakingService();
