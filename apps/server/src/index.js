import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { config } from './config/env.js';
import { initDb, isUsingMysql, getPool } from './db/index.js';
import { initRedis, closeRedis } from './redis/redisClient.js';
import { checkRedisHealth } from './redis/redisHealth.js';
import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/games.js';
import { userRoutes } from './routes/users.js';
import { leaderboardRoutes } from './routes/leaderboards.js';
import { matchmakingRoutes } from './routes/matchmaking.js';
import { tournamentRoutes } from './routes/tournaments.js';
import { friendRoutes } from './routes/friends.js';
import { challengeRoutes } from './routes/challenges.js';
import { fairPlayRoutes } from './routes/fairPlay.js';
import { setupWebSocketServer } from './websocket/wsServer.js';

import { registerSecurityHeaders } from './middleware/securityHeaders.js';
import { redisConfig } from './redis/redisConfig.js';

export async function createServer() {
  const fastify = Fastify({
    logger: false,
    bodyLimit: 64 * 1024 // 64 KB strict request body limit
  });

  // Security Headers (CSP, FrameGuard, NoSniff, Referrer, Permissions)
  registerSecurityHeaders(fastify);

  await fastify.register(fastifyCors, {
    origin: (origin, cb) => {
      // If CORS_ORIGIN is set, validate strictly; in dev/testing allow same-origin and localhost
      if (!origin || !process.env.CORS_ORIGIN) {
        return cb(null, true);
      }
      const allowed = process.env.CORS_ORIGIN.split(',').map(s => s.trim().toLowerCase());
      if (allowed.includes(origin.toLowerCase()) || allowed.includes('*')) {
        return cb(null, true);
      }
      cb(new Error('CORS origin not allowed'), false);
    },
    credentials: true
  });

  // Sanitized Global Error Handler: Prevents stack trace and database detail leakage
  fastify.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    if (statusCode === 413 || error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size of 64KB.'
      });
    }
    if (statusCode < 500) {
      return reply.status(statusCode).send({
        error: error.code || 'BAD_REQUEST',
        message: error.message
      });
    }

    // Mask internal error details on 500 responses
    console.error(`[Server Error] [${new Date().toISOString()}] ${request.method} ${request.url}:`, error);
    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An internal error occurred. Please try again later.'
    });
  });

  // Health check endpoint (Liveness)
  const healthHandler = async () => {
    const redisHealth = await checkRedisHealth();
    return {
      status: 'ok',
      serverTime: new Date().toISOString(),
      database: isUsingMysql() ? 'ok' : 'in-memory',
      redis: redisHealth.status,
      redisMode: redisHealth.mode
    };
  };

  fastify.get('/health', healthHandler);
  fastify.get('/api/health', healthHandler);

  // Readiness check endpoint (Dependency availability)
  const readinessHandler = async (request, reply) => {
    const redisHealth = await checkRedisHealth();
    let dbOk = true;
    if (isUsingMysql()) {
      try {
        const pool = getPool();
        await pool.query('SELECT 1');
      } catch (err) {
        dbOk = false;
      }
    }

    const redisOk = !redisConfig.isRequired || redisHealth.status === 'connected' || redisHealth.status === 'ok';
    const isReady = dbOk && redisOk;

    const payload = {
      status: isReady ? 'ready' : 'not_ready',
      serverTime: new Date().toISOString(),
      database: dbOk ? (isUsingMysql() ? 'connected' : 'in-memory') : 'error',
      redis: redisHealth.status,
      redisRequired: redisConfig.isRequired
    };

    if (!isReady) {
      return reply.status(503).send(payload);
    }
    return reply.send(payload);
  };

  fastify.get('/readiness', readinessHandler);
  fastify.get('/api/readiness', readinessHandler);

  // REST API routes
  await fastify.register(authRoutes);
  await fastify.register(gameRoutes);
  await fastify.register(userRoutes);
  await fastify.register(leaderboardRoutes);
  await fastify.register(matchmakingRoutes);
  await fastify.register(tournamentRoutes);
  await fastify.register(friendRoutes);
  await fastify.register(challengeRoutes);
  await fastify.register(fairPlayRoutes);

  // WebSocket Server
  await setupWebSocketServer(fastify);

  return fastify;
}

export async function start() {
  await initDb();
  await initRedis();
  const { globalPubSubService } = await import('./pubsub/pubSubService.js');
  await globalPubSubService.init();
  const server = await createServer();

  try {
    await server.listen({ port: config.port, host: config.host });
    console.log(`[Chess Backend] Fastify server running on http://${config.host}:${config.port}`);
  } catch (err) {
    console.error('[Chess Backend] Error starting server:', err);
    process.exit(1);
  }

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    console.log(`[Chess Backend] Received ${signal}. Starting graceful shutdown...`);
    try {
      await server.close();
      await closeRedis();
      const pool = getPool();
      if (pool) await pool.end();
    } catch (err) {
      console.warn('[Chess Backend] Shutdown error:', err.message);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  start();
}
