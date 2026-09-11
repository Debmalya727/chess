import { EventEmitter } from 'events';
import { getRedisClient, getRedisSubscriber, isRedisConnected } from '../redis/redisClient.js';
import { redisKeys } from '../redis/redisKeys.js';

export class PubSubService {
  constructor() {
    this.localEmitter = new EventEmitter();
    this.localEmitter.setMaxListeners(100);
    this.subscribedChannels = new Set();
    this.channelHandlers = new Map(); // channel -> Set of handlers
    this.isSubscriberBound = false;
  }

  _bindSubscriberIfNeeded() {
    if (this.isSubscriberBound) return;
    const subscriber = getRedisSubscriber();
    if (!subscriber) return;

    subscriber.on('message', (channel, message) => {
      try {
        const envelope = JSON.parse(message);
        const handlers = this.channelHandlers.get(channel);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(envelope);
            } catch (err) {
              console.warn(`[PubSub] Handler error for channel ${channel}:`, err.message);
            }
          }
        }
      } catch (err) {
        console.warn(`[PubSub] Parse error on channel ${channel}:`, err.message);
      }
    });

    // Automatically re-subscribe after reconnect
    subscriber.on('ready', async () => {
      if (this.subscribedChannels.size > 0) {
        const channels = Array.from(this.subscribedChannels);
        console.log(`[PubSub] Re-subscribing to ${channels.length} channels after reconnect...`);
        try {
          await subscriber.subscribe(...channels);
        } catch (err) {
          console.warn('[PubSub] Failed to re-subscribe:', err.message);
        }
      }
    });

    this.isSubscriberBound = true;
  }

  async init() {
    this._bindSubscriberIfNeeded();
    if (isRedisConnected()) {
      const subscriber = getRedisSubscriber();
      if (subscriber && this.subscribedChannels.size > 0) {
        const channels = Array.from(this.subscribedChannels);
        try {
          await subscriber.subscribe(...channels);
        } catch (err) {
          console.warn('[PubSub] Initial subscribe failed:', err.message);
        }
      }
    }
  }

  async publish(channel, eventType, payload = {}) {
    const envelope = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      eventVersion: 1,
      eventType,
      timestamp: Date.now(),
      payload
    };

    const message = JSON.stringify(envelope);

    if (isRedisConnected()) {
      const client = getRedisClient();
      try {
        await client.publish(channel, message);
        return envelope;
      } catch (err) {
        console.warn(`[PubSub] Redis publish failed on ${channel}:`, err.message);
      }
    }

    // In-memory fallback / local dispatch
    this.localEmitter.emit(channel, envelope);
    return envelope;
  }

  async subscribe(channel, handler) {
    if (!this.channelHandlers.has(channel)) {
      this.channelHandlers.set(channel, new Set());
    }
    this.channelHandlers.get(channel).add(handler);
    this.subscribedChannels.add(channel);

    // Also register on local emitter
    this.localEmitter.on(channel, handler);

    if (isRedisConnected()) {
      this._bindSubscriberIfNeeded();
      const subscriber = getRedisSubscriber();
      if (subscriber) {
        try {
          await subscriber.subscribe(channel);
        } catch (err) {
          console.warn(`[PubSub] Redis subscribe failed for ${channel}:`, err.message);
        }
      }
    }
  }

  async unsubscribe(channel, handler) {
    if (this.channelHandlers.has(channel)) {
      const handlers = this.channelHandlers.get(channel);
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.channelHandlers.delete(channel);
        this.subscribedChannels.delete(channel);

        if (isRedisConnected()) {
          const subscriber = getRedisSubscriber();
          if (subscriber) {
            try {
              await subscriber.unsubscribe(channel);
            } catch (err) {
              console.warn(`[PubSub] Redis unsubscribe failed for ${channel}:`, err.message);
            }
          }
        }
      }
    }

    this.localEmitter.removeListener(channel, handler);
  }

  // Convenience helpers
  async publishUserEvent(userId, eventType, data) {
    const channel = redisKeys.pubsubUser(userId);
    return this.publish(channel, eventType, data);
  }

  async publishGameEvent(gameId, eventType, data) {
    const channel = redisKeys.pubsubGame(gameId);
    return this.publish(channel, eventType, data);
  }

  async publishTournamentEvent(tournamentId, eventType, data) {
    const channel = redisKeys.pubsubTournament(tournamentId);
    return this.publish(channel, eventType, data);
  }

  async publishPresenceEvent(presenceData) {
    const channel = redisKeys.pubsubPresence();
    return this.publish(channel, 'presence:updated', presenceData);
  }
}

export const globalPubSubService = new PubSubService();
