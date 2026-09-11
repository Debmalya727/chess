import { PresenceStore } from './presenceStore.js';

/**
 * In-memory PresenceStore with multi-tab socket tracking per user.
 */
export class InMemoryPresenceStore extends PresenceStore {
  constructor() {
    super();
    this.userSockets = new Map(); // userId -> Set<socketId>
    this.playingUsers = new Set(); // Set of userIds currently in game
  }

  async addSocket(userId, socketId) {
    if (!userId || !socketId) return;
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socketId);
  }

  async removeSocket(userId, socketId) {
    if (!userId || !socketId) return false;
    const sockets = this.userSockets.get(userId);
    if (!sockets) return false;

    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      this.playingUsers.delete(userId);
      return true; // Final socket removed -> user is now offline
    }
    return false; // Still has other active sockets
  }

  async getUserStatus(userId) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      return 'offline';
    }
    if (this.playingUsers.has(userId)) {
      return 'playing';
    }
    return 'online';
  }

  async setUserPlaying(userId, isPlaying) {
    if (isPlaying) {
      this.playingUsers.add(userId);
    } else {
      this.playingUsers.delete(userId);
    }
  }

  async getOnlineUserIds() {
    return Array.from(this.userSockets.keys());
  }

  async getSocketCount(userId) {
    const sockets = this.userSockets.get(userId);
    return sockets ? sockets.size : 0;
  }
}
