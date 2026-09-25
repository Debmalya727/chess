import { WS_EVENTS, ERROR_CODES } from '@chess/protocol';
import { globalRoomManager } from '../rooms/roomManager.js';
import { globalGameManager } from './gameManager.js';
import { createGame, findGameById } from '../db/gameRepository.js';
import { findUserById } from '../db/userRepository.js';
import { getActiveGameForUser } from './gameService.js';
import { getRatingCategory } from '../ratings/ratingService.js';
import { getUserRating } from '../db/ratingRepository.js';
import { globalPresenceService } from '../presence/presenceService.js';
import { globalPubSubService } from '../pubsub/pubSubService.js';

export class RematchService {
  constructor() {
    this.pendingOffers = new Map(); // gameId -> { gameId, offeredBy, offeredByUsername, targetUserId, expiresAt, timer }
    this.resolvedRematches = new Map(); // gameId -> newGameId
    this.creationLock = new Set(); // gameId set for concurrency locking
  }

  _broadcastToUser(userId, event, payload, room = null) {
    const envelope = JSON.stringify({ event, payload, timestamp: Date.now() });
    const contactedSockets = new Set();

    if (room && room.connectedSockets) {
      const s = room.connectedSockets.get(userId);
      if (s && s.readyState === 1) {
        try {
          s.send(envelope);
          contactedSockets.add(s);
        } catch {}
      }
    }

    try {
      if (globalPresenceService && globalPresenceService.activeSockets) {
        for (const s of globalPresenceService.activeSockets.values()) {
          if (s.user && s.user.id === userId && s.readyState === 1 && !contactedSockets.has(s)) {
            try {
              s.send(envelope);
              contactedSockets.add(s);
            } catch {}
          }
        }
      }
      if (globalPubSubService && typeof globalPubSubService.publishUserEvent === 'function') {
        globalPubSubService.publishUserEvent(userId, event, payload).catch(() => {});
      }
    } catch {}
  }

  _handleOfferTimeout(gameId) {
    const pending = this.pendingOffers.get(gameId);
    if (!pending) return;

    this.pendingOffers.delete(gameId);
    const room = globalRoomManager.getRoomById(gameId);
    const cancelPayload = { gameId, reason: 'timeout' };

    this._broadcastToUser(pending.offeredBy, WS_EVENTS.REMATCH_CANCELLED, cancelPayload, room);
    this._broadcastToUser(pending.targetUserId, WS_EVENTS.REMATCH_CANCELLED, cancelPayload, room);
  }

  handleUserDisconnected(userId) {
    for (const [gameId, pending] of this.pendingOffers.entries()) {
      if (pending.offeredBy === userId || pending.targetUserId === userId) {
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingOffers.delete(gameId);

        const room = globalRoomManager.getRoomById(gameId);
        const otherUserId = pending.offeredBy === userId ? pending.targetUserId : pending.offeredBy;
        const cancelPayload = { gameId, reason: 'opponent_disconnected' };
        this._broadcastToUser(otherUserId, WS_EVENTS.REMATCH_CANCELLED, cancelPayload, room);
      }
    }
  }

  async requestRematch(user, gameId, socket = null) {
    if (!user || !user.id) {
      return { error: ERROR_CODES.UNAUTHORIZED, message: 'Authentication required.' };
    }
    if (!gameId || typeof gameId !== 'string') {
      return { error: 'INVALID_INPUT', message: 'Valid gameId is required.' };
    }

    // 1. Invariant check: At most one rematch game per completed game
    if (this.resolvedRematches.has(gameId) || this.creationLock.has(gameId)) {
      return { error: ERROR_CODES.REMATCH_ALREADY_RESOLVED, message: 'A rematch has already been created for this game.' };
    }

    // 2. Fetch original game
    let game = await findGameById(gameId);
    let room = globalRoomManager.getRoomById(gameId);
    if (!game && room) {
      game = {
        id: room.id,
        roomCode: room.roomCode,
        whitePlayerId: room.whitePlayerId,
        blackPlayerId: room.blackPlayerId,
        status: room.status,
        tournamentId: room.tournamentId,
        timeControl: room.timeControl,
        rated: room.rated
      };
    } else if (game && !room) {
      room = globalRoomManager.rehydrateRoomFromDb(game);
    }

    if (!game) {
      return { error: ERROR_CODES.GAME_NOT_FOUND, message: 'Game not found.' };
    }

    // 3. Tournament Safety Guard
    if (game.tournamentId || (room && room.tournamentId)) {
      return { error: ERROR_CODES.TOURNAMENT_REMATCH_NOT_ALLOWED, message: 'Rematch is not permitted in tournament games.' };
    }

    // 4. Game Must Be Finished Guard
    const session = globalGameManager.getSession(gameId);
    const isFinished = game.status === 'FINISHED' || game.status === 'COMPLETED' || (session && session.isEnded);
    if (!isFinished) {
      return { error: ERROR_CODES.GAME_NOT_FINISHED, message: 'Cannot request rematch on an ongoing game.' };
    }

    // 5. Participant Authorization Guard
    const isWhite = game.whitePlayerId === user.id;
    const isBlack = game.blackPlayerId === user.id;
    if (!isWhite && !isBlack) {
      return { error: ERROR_CODES.FORBIDDEN, message: 'Only players of this game can request a rematch.' };
    }

    const opponentId = isWhite ? game.blackPlayerId : game.whitePlayerId;
    if (!opponentId) {
      return { error: 'INVALID_STATE', message: 'Game does not have two players.' };
    }

    // Register requester socket in room if available
    if (room && socket) {
      room.connectedSockets.set(user.id, socket);
    }

    // 6. Active Game Safety Guard (neither player may be in another active game)
    const userActiveGame = await getActiveGameForUser(user.id);
    if (userActiveGame && userActiveGame.id !== gameId) {
      return { error: ERROR_CODES.PLAYER_ALREADY_IN_GAME, message: 'You are already in an active game.' };
    }
    const oppActiveGame = await getActiveGameForUser(opponentId);
    if (oppActiveGame && oppActiveGame.id !== gameId) {
      return { error: ERROR_CODES.PLAYER_ALREADY_IN_GAME, message: 'Opponent is already in an active game.' };
    }

    // 7. Check Pending Offer
    const pending = this.pendingOffers.get(gameId);
    if (pending) {
      if (pending.offeredBy === user.id) {
        // Idempotent: same player requesting again
        return {
          success: true,
          alreadyPending: true,
          gameId,
          offeredBy: pending.offeredBy,
          expiresAt: pending.expiresAt
        };
      } else {
        // Mutual request: Opponent had already offered -> coalesce into Mutual Acceptance!
        return this._acceptAndCreateGame(gameId, user);
      }
    }

    // 8. Create New Pending Rematch Offer (30s lifetime)
    const expiresAt = Date.now() + 30000;
    const timer = setTimeout(() => this._handleOfferTimeout(gameId), 30000);
    if (timer.unref) timer.unref();

    this.pendingOffers.set(gameId, {
      gameId,
      offeredBy: user.id,
      offeredByUsername: user.username,
      targetUserId: opponentId,
      expiresAt,
      timer
    });

    // Notify opponent
    this._broadcastToUser(opponentId, WS_EVENTS.REMATCH_OFFERED, {
      gameId,
      offeredBy: user.id,
      offeredByUsername: user.username,
      expiresAt
    }, room);

    return {
      success: true,
      gameId,
      offeredBy: user.id,
      expiresAt
    };
  }

  async respondRematch(user, gameId, accept, socket = null) {
    if (!user || !user.id) {
      return { error: ERROR_CODES.UNAUTHORIZED, message: 'Authentication required.' };
    }
    if (!gameId || typeof gameId !== 'string') {
      return { error: 'INVALID_INPUT', message: 'Valid gameId is required.' };
    }

    if (this.creationLock.has(gameId) || this.resolvedRematches.has(gameId)) {
      return { error: ERROR_CODES.REMATCH_ALREADY_RESOLVED, message: 'A rematch has already been created for this game.' };
    }

    const pending = this.pendingOffers.get(gameId);
    if (!pending) {
      return { error: ERROR_CODES.REMATCH_NOT_FOUND, message: 'No active rematch offer found for this game.' };
    }

    if (pending.offeredBy === user.id) {
      return { error: ERROR_CODES.FORBIDDEN, message: 'Cannot respond to your own rematch offer.' };
    }
    if (pending.targetUserId !== user.id) {
      return { error: ERROR_CODES.FORBIDDEN, message: 'You are not the recipient of this rematch offer.' };
    }

    const room = globalRoomManager.getRoomById(gameId);
    if (room && socket) {
      room.connectedSockets.set(user.id, socket);
    }

    if (!accept) {
      if (pending.timer) clearTimeout(pending.timer);
      this.pendingOffers.delete(gameId);

      const declinePayload = { gameId, declinedBy: user.id };
      this._broadcastToUser(pending.offeredBy, WS_EVENTS.REMATCH_DECLINED, declinePayload, room);
      this._broadcastToUser(user.id, WS_EVENTS.REMATCH_DECLINED, declinePayload, room);

      return { success: true, accepted: false, declined: true };
    }

    return this._acceptAndCreateGame(gameId, user);
  }

  async cancelRematch(user, gameId) {
    if (!user || !user.id) {
      return { error: ERROR_CODES.UNAUTHORIZED, message: 'Authentication required.' };
    }
    if (!gameId || typeof gameId !== 'string') {
      return { error: 'INVALID_INPUT', message: 'Valid gameId is required.' };
    }

    const pending = this.pendingOffers.get(gameId);
    if (!pending) {
      return { error: ERROR_CODES.REMATCH_NOT_FOUND, message: 'No active rematch offer found for this game.' };
    }

    if (pending.offeredBy !== user.id) {
      return { error: ERROR_CODES.FORBIDDEN, message: 'Only the player who offered the rematch can cancel it.' };
    }

    if (pending.timer) clearTimeout(pending.timer);
    this.pendingOffers.delete(gameId);

    const room = globalRoomManager.getRoomById(gameId);
    const cancelPayload = { gameId, reason: 'cancelled_by_player' };
    this._broadcastToUser(pending.offeredBy, WS_EVENTS.REMATCH_CANCELLED, cancelPayload, room);
    this._broadcastToUser(pending.targetUserId, WS_EVENTS.REMATCH_CANCELLED, cancelPayload, room);

    return { success: true, cancelled: true };
  }

  async _acceptAndCreateGame(gameId, acceptingUser) {
    // Concurrency Mutex: Prevent duplicate game creation under simultaneous acceptance
    if (this.creationLock.has(gameId)) {
      return { error: ERROR_CODES.REMATCH_ALREADY_RESOLVED, message: 'Rematch game creation already in progress.' };
    }
    this.creationLock.add(gameId);

    try {
      if (this.resolvedRematches.has(gameId)) {
        return { error: ERROR_CODES.REMATCH_ALREADY_RESOLVED, message: 'A rematch has already been created for this game.' };
      }

      const pending = this.pendingOffers.get(gameId);
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingOffers.delete(gameId);
      }

      // 1. Fetch Game 1
      let game1 = await findGameById(gameId);
      let room1 = globalRoomManager.getRoomById(gameId);
      if (!game1 && room1) {
        game1 = room1;
      }
      if (!game1) {
        return { error: ERROR_CODES.GAME_NOT_FOUND, message: 'Original game not found.' };
      }

      // 2. Tournament Restriction
      if (game1.tournamentId || (room1 && room1.tournamentId)) {
        return { error: ERROR_CODES.TOURNAMENT_REMATCH_NOT_ALLOWED, message: 'Rematch is not permitted in tournament games.' };
      }

      // 3. Active Game Check
      const p1Active = await getActiveGameForUser(game1.whitePlayerId);
      const p2Active = await getActiveGameForUser(game1.blackPlayerId);
      if ((p1Active && p1Active.id !== gameId) || (p2Active && p2Active.id !== gameId)) {
        return { error: ERROR_CODES.PLAYER_ALREADY_IN_GAME, message: 'One or both players are already in an active game.' };
      }

      // 4. Deterministic Authoritative Color Inversion
      // Game 1: White = game1.whitePlayerId, Black = game1.blackPlayerId
      // Game 2: White = game1.blackPlayerId, Black = game1.whitePlayerId
      const game2WhiteId = game1.blackPlayerId;
      const game2BlackId = game1.whitePlayerId;

      let whiteUser = await findUserById(game2WhiteId);
      let blackUser = await findUserById(game2BlackId);

      if (!whiteUser && room1 && room1.players) {
        whiteUser = room1.players.get(game2WhiteId);
      }
      if (!blackUser && room1 && room1.players) {
        blackUser = room1.players.get(game2BlackId);
      }

      if (!whiteUser) whiteUser = { id: game2WhiteId, username: room1?.blackUsername || 'Player' };
      if (!blackUser) blackUser = { id: game2BlackId, username: room1?.whiteUsername || 'Player' };

      const timeControl = game1.timeControl || '10+0';
      const isRated = game1.rated !== false && (room1 ? room1.rated !== false : true);
      const ratingType = getRatingCategory(timeControl);

      // 5. Create New Room for Game 2
      const room2 = globalRoomManager.createRoom({
        hostUser: whiteUser,
        timeControl,
        colorPreference: 'w'
      });

      room2.whiteUsername = whiteUser.username;
      room2.blackUsername = blackUser.username;
      room2.rated = isRated;

      // Join Black player
      globalRoomManager.joinRoom(room2.roomCode, blackUser);

      // Transfer connected sockets from Game 1 room
      if (room1 && room1.connectedSockets) {
        const whiteSock = room1.connectedSockets.get(game2WhiteId);
        const blackSock = room1.connectedSockets.get(game2BlackId);
        if (whiteSock) room2.connectedSockets.set(game2WhiteId, whiteSock);
        if (blackSock) room2.connectedSockets.set(game2BlackId, blackSock);
      }

      // Also attach from global active sockets if present
      try {
        if (globalPresenceService && globalPresenceService.activeSockets) {
          for (const s of globalPresenceService.activeSockets.values()) {
            if (s.user) {
              if (s.user.id === game2WhiteId && !room2.connectedSockets.has(game2WhiteId)) {
                room2.connectedSockets.set(game2WhiteId, s);
              }
              if (s.user.id === game2BlackId && !room2.connectedSockets.has(game2BlackId)) {
                room2.connectedSockets.set(game2BlackId, s);
              }
            }
          }
        }
      } catch {}

      // 6. Instantiate Active Game Session for Game 2
      const session2 = globalGameManager.getOrCreateSession(room2);
      session2.start();

      // 7. Persist Game 2 authoritatively in Database (Game 1 remains untouched)
      await createGame({
        id: room2.id,
        roomCode: room2.roomCode,
        whitePlayerId: room2.whitePlayerId,
        blackPlayerId: room2.blackPlayerId,
        mode: 'ONLINE',
        status: 'ACTIVE',
        timeControl: room2.timeControl,
        initialFen: session2.game.getFen(),
        rated: isRated
      });

      // 8. Register Resolved Rematch (enforces single-game invariant)
      this.resolvedRematches.set(gameId, room2.id);

      // 9. Fetch Player Current Ratings for Game 2 init payload
      const whiteRating = await getUserRating(game2WhiteId, ratingType);
      const blackRating = await getUserRating(game2BlackId, ratingType);

      const initPayload = {
        gameId: room2.id,
        roomCode: room2.roomCode,
        fen: session2.game.getFen(),
        timeControl: room2.timeControl,
        status: 'ACTIVE',
        turn: session2.game.getTurn(),
        clocks: session2.clock.getTimes(),
        stateVersion: session2.stateVersion,
        rated: isRated,
        whitePlayer: { id: whiteUser.id, username: whiteUser.username, rating: whiteRating?.rating || 1500 },
        blackPlayer: { id: blackUser.id, username: blackUser.username, rating: blackRating?.rating || 1500 }
      };

      // 10. Broadcast game:init to both players with assigned colors
      this._broadcastToUser(game2WhiteId, WS_EVENTS.GAME_INIT, { ...initPayload, color: 'w' }, room2);
      this._broadcastToUser(game2BlackId, WS_EVENTS.GAME_INIT, { ...initPayload, color: 'b' }, room2);

      return {
        success: true,
        newGameId: room2.id,
        newRoomCode: room2.roomCode,
        whitePlayerId: game2WhiteId,
        blackPlayerId: game2BlackId
      };
    } finally {
      this.creationLock.delete(gameId);
    }
  }
}

export const globalRematchService = new RematchService();
