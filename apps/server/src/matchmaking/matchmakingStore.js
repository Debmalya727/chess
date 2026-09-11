/**
 * Base MatchmakingStore interface.
 * Allows Phase 7 Redis implementation without changing MatchmakingService logic.
 */
export class MatchmakingStore {
  async add(userId, entry) {
    throw new Error('Not implemented');
  }

  async get(userId) {
    throw new Error('Not implemented');
  }

  async has(userId) {
    throw new Error('Not implemented');
  }

  async remove(userId) {
    throw new Error('Not implemented');
  }

  async getAll() {
    throw new Error('Not implemented');
  }

  async size() {
    throw new Error('Not implemented');
  }
}
