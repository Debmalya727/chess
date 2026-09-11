import { InMemoryPresenceStore } from './inMemoryPresenceStore.js';
import { RedisPresenceStore } from './redisPresenceStore.js';
import { isRedisConnected } from '../redis/redisClient.js';
import { globalPubSubService } from '../pubsub/pubSubService.js';
import { redisKeys } from '../redis/redisKeys.js';
import { WS_EVENTS } from '@chess/protocol';

export class PresenceService {
  constructor(store = null) {
    this._customStore = store;
    this.activeSockets = new Map(); // socketId -> socket
    this.userUsernames = new Map(); // userId -> username
    this._initPubSubSubscriptions();
  }

  get store() {
    if (this._customStore) return this._customStore;
    if (isRedisConnected()) {
      if (!this._redisStore) this._redisStore = new RedisPresenceStore();
      return this._redisStore;
    }
    if (!this._memoryStore) this._memoryStore = new InMemoryPresenceStore();
    return this._memoryStore;
  }

  _initPubSubSubscriptions() {
    // Listen for cross-instance presence updates
    globalPubSubService.subscribe(redisKeys.pubsubPresence(), (envelope) => {
      if (envelope && envelope.payload) {
        this._deliverToLocalSockets(WS_EVENTS.PRESENCE_UPDATED, envelope.payload);
      }
    }).catch(() => {});
  }

  async handleUserConnected(userId, socket, username = null) {
    if (!userId || !socket) return;
    const socketId = socket.id || `sock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    socket.id = socketId;

    this.activeSockets.set(socketId, socket);
    if (username) {
      this.userUsernames.set(userId, username);
    }

    // Subscribe this instance to user-specific channel for notifications
    const userChannel = redisKeys.pubsubUser(userId);
    globalPubSubService.subscribe(userChannel, (envelope) => {
      if (envelope) {
        this._deliverToLocalUser(userId, envelope.eventType || envelope.event, envelope.payload);
      }
    }).catch(() => {});

    const previousStatus = await this.store.getUserStatus(userId);
    await this.store.addSocket(userId, socketId);
    const newStatus = await this.store.getUserStatus(userId);

    if (previousStatus !== newStatus) {
      this._broadcastPresence(userId, this.userUsernames.get(userId) || username, newStatus);
    }
  }

  async handleUserDisconnected(userId, socketId) {
    if (!userId) return;
    if (socketId) {
      this.activeSockets.delete(socketId);
    }

    const previousStatus = await this.store.getUserStatus(userId);
    await this.store.removeSocket(userId, socketId);
    const newStatus = await this.store.getUserStatus(userId);

    if (previousStatus !== newStatus) {
      this._broadcastPresence(userId, this.userUsernames.get(userId) || 'Unknown', newStatus);
    }
  }

  async setUserPlaying(userId, isPlaying) {
    if (!userId) return;
    const previousStatus = await this.store.getUserStatus(userId);
    await this.store.setUserPlaying(userId, isPlaying);
    const newStatus = await this.store.getUserStatus(userId);

    if (previousStatus !== newStatus) {
      this._broadcastPresence(userId, this.userUsernames.get(userId) || 'Unknown', newStatus);
    }
  }

  async getUserStatus(userId) {
    return this.store.getUserStatus(userId);
  }

  async getMultipleUserStatuses(userIds = []) {
    const statuses = {};
    for (const id of userIds) {
      statuses[id] = await this.store.getUserStatus(id);
    }
    return statuses;
  }

  _deliverToLocalSockets(event, payload) {
    const message = JSON.stringify({
      event,
      payload,
      timestamp: Date.now()
    });

    for (const socket of this.activeSockets.values()) {
      try {
        if (socket.readyState === 1 /* OPEN */) {
          socket.send(message);
        }
      } catch {}
    }
  }

  _deliverToLocalUser(userId, event, data) {
    const message = JSON.stringify({
      event,
      payload: data,
      timestamp: Date.now()
    });

    for (const [sId, s] of this.activeSockets.entries()) {
      if (s.user && s.user.id === userId && s.readyState === 1) {
        try {
          s.send(message);
        } catch {}
      }
    }
  }

  _broadcastPresence(userId, username, status) {
    const presenceData = { userId, username, status };
    // 1. Deliver locally
    this._deliverToLocalSockets(WS_EVENTS.PRESENCE_UPDATED, presenceData);
    // 2. Broadcast via Pub/Sub to other Fastify instances
    globalPubSubService.publishPresenceEvent(presenceData).catch(() => {});
  }

  sendToUser(userId, event, data) {
    // 1. Deliver to local sockets if connected on this instance
    this._deliverToLocalUser(userId, event, data);
    // 2. Publish to user channel for cross-instance delivery
    globalPubSubService.publishUserEvent(userId, event, data).catch(() => {});
  }
}

export const globalPresenceService = new PresenceService();
