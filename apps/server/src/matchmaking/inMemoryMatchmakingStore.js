import { MatchmakingStore } from './matchmakingStore.js';

/**
 * In-memory implementation of MatchmakingStore for single-instance Fastify.
 */
export class InMemoryMatchmakingStore extends MatchmakingStore {
  constructor() {
    super();
    this.entries = new Map(); // userId -> entry
  }

  async add(userId, entry) {
    this.entries.set(userId, entry);
    return true;
  }

  async get(userId) {
    return this.entries.get(userId) || null;
  }

  async has(userId) {
    return this.entries.has(userId);
  }

  async remove(userId) {
    return this.entries.delete(userId);
  }

  async getAll() {
    return Array.from(this.entries.values());
  }

  async size() {
    return this.entries.size;
  }
}
