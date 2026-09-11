import { ActiveGameSession } from './gameService.js';
import { findGameById } from '../db/gameRepository.js';
import { findMovesByGameId } from '../db/moveRepository.js';
import { globalRoomManager } from '../rooms/roomManager.js';

export class GameManager {
  constructor() {
    this.sessions = new Map(); // gameId -> ActiveGameSession
  }

  getOrCreateSession(room) {
    if (!this.sessions.has(room.id)) {
      const session = new ActiveGameSession(room);
      this.sessions.set(room.id, session);
    }
    return this.sessions.get(room.id);
  }

  getSession(gameId) {
    return this.sessions.get(gameId) || null;
  }

  async restoreSessionFromDb(gameId) {
    if (this.sessions.has(gameId)) {
      return this.sessions.get(gameId);
    }

    const dbGame = await findGameById(gameId);
    if (!dbGame || dbGame.status === 'FINISHED' || dbGame.status === 'CANCELLED') {
      return null;
    }

    // Reconstruct room if not already in memory
    let room = globalRoomManager.getRoomById(gameId) || (dbGame.roomCode ? globalRoomManager.getRoomByCode(dbGame.roomCode) : null);
    if (!room) {
      room = {
        id: dbGame.id,
        roomCode: dbGame.roomCode,
        hostUserId: dbGame.whitePlayerId,
        whitePlayerId: dbGame.whitePlayerId,
        blackPlayerId: dbGame.blackPlayerId,
        timeControl: dbGame.timeControl,
        status: dbGame.status,
        players: new Map(),
        connectedSockets: new Map(),
        createdAt: dbGame.createdAt
      };
      globalRoomManager.roomsById.set(room.id, room);
      if (room.roomCode) {
        globalRoomManager.roomsByCode.set(room.roomCode, room);
      }
    }

    const session = new ActiveGameSession(room);

    // Replay moves to restore exact board state
    const moves = await findMovesByGameId(gameId);
    for (const m of moves) {
      session.game.move(m.from, m.to, m.promotion || 'q');
      session.stateVersion++;
    }

    if (room.status === 'ACTIVE') {
      session.start();
    }

    this.sessions.set(gameId, session);
    return session;
  }
}

export const globalGameManager = new GameManager();
