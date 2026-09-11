/**
 * Base PresenceStore interface.
 * Abstracting presence storage enables Phase 7 Redis implementation.
 */
export class PresenceStore {
  async addSocket(userId, socketId) {
    throw new Error('Not implemented');
  }

  async removeSocket(userId, socketId) {
    throw new Error('Not implemented');
  }

  async getUserStatus(userId) {
    throw new Error('Not implemented');
  }

  async setUserPlaying(userId, isPlaying) {
    throw new Error('Not implemented');
  }

  async getOnlineUserIds() {
    throw new Error('Not implemented');
  }
}
