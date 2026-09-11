import Redis from 'ioredis';
import { redisConfig, getRedisOptions } from './redisConfig.js';

let primaryClient = null;
let subscriberClient = null;
let isConnected = false;
let isConnecting = false;

export async function initRedis() {
  if (primaryClient && isConnected) {
    return { client: primaryClient, subscriber: subscriberClient };
  }
  if (isConnecting) {
    // Wait for in-flight connection
    await new Promise(r => setTimeout(r, 200));
    return { client: primaryClient, subscriber: subscriberClient };
  }

  isConnecting = true;
  const options = getRedisOptions();
  let client = null;
  let subscriber = null;

  try {
    client = redisConfig.url ? new Redis(redisConfig.url, options) : new Redis(options);
    
    client.on('connect', () => {
      console.log('[Redis] Primary client connection initiated.');
    });

    client.on('ready', () => {
      console.log('[Redis] Primary client ready.');
      isConnected = true;
    });

    client.on('error', (err) => {
      console.warn('[Redis] Client error:', err.message);
      if (!isConnected && redisConfig.isRequired) {
        // Startup failure in strict production mode
        console.error('[Redis] Fatal: Redis is required but connection failed.');
      }
    });

    client.on('close', () => {
      console.log('[Redis] Connection closed.');
      isConnected = false;
    });

    client.on('reconnecting', (delay) => {
      console.log(`[Redis] Reconnecting in ${delay}ms...`);
    });

    // Attempt connection
    await client.connect();

    // Create dedicated subscriber client
    subscriber = client.duplicate({
      lazyConnect: true
    });

    subscriber.on('ready', () => {
      console.log('[Redis] Subscriber client ready.');
    });

    subscriber.on('error', (err) => {
      console.warn('[Redis] Subscriber error:', err.message);
    });

    await subscriber.connect();

    primaryClient = client;
    subscriberClient = subscriber;
    isConnected = true;

    console.log('[Redis] Infrastructure initialized successfully.');
    return { client: primaryClient, subscriber: subscriberClient };
  } catch (err) {
    isConnected = false;
    if (client) {
      try { client.disconnect(); } catch (_) {}
    }
    if (subscriber) {
      try { subscriber.disconnect(); } catch (_) {}
    }
    primaryClient = null;
    subscriberClient = null;

    if (redisConfig.isRequired) {
      console.error('[Redis] Startup failed: REDIS_REQUIRED is true but connection could not be established.');
      throw err;
    } else {
      console.log('[Redis] REDIS_REQUIRED is false. Falling back to in-memory coordination stores.');
      return null;
    }
  } finally {
    isConnecting = false;
  }
}

export function getRedisClient() {
  return primaryClient;
}

export function getRedisSubscriber() {
  return subscriberClient;
}

export function isRedisConnected() {
  return isConnected && primaryClient !== null && primaryClient.status === 'ready';
}

export async function closeRedis() {
  if (subscriberClient) {
    try {
      await subscriberClient.quit();
    } catch {
      subscriberClient.disconnect();
    }
    subscriberClient = null;
  }

  if (primaryClient) {
    try {
      await primaryClient.quit();
    } catch {
      primaryClient.disconnect();
    }
    primaryClient = null;
  }

  isConnected = false;
  console.log('[Redis] Connections closed cleanly.');
}
