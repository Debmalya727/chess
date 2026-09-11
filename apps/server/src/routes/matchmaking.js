import { globalMatchmakingService } from '../matchmaking/matchmakingService.js';
import { authenticateRequest } from '../auth/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimitMiddleware.js';

export async function matchmakingRoutes(fastify) {
  // POST /api/matchmaking/join — Join the matchmaking queue via REST (Rate limit: 30 per minute per user)
  fastify.post('/api/matchmaking/join', {
    preHandler: [authenticateRequest, rateLimit('matchmaking', 30, 60000, req => req.user?.id || req.ip)]
  }, async (request, reply) => {
    const user = request.user;
    const { timeControl = '10+0' } = request.body || {};

    // joinQueue requires a socket for WS games; for REST-only testing we pass null socket
    const result = await globalMatchmakingService.joinQueue({ user, socket: null, timeControl });

    if (result && result.error) {
      const statusCode = result.error === 'PLAYER_ALREADY_IN_GAME' ? 409 : 400;
      return reply.status(statusCode).send(result);
    }

    return reply.status(200).send(result || { queued: true, timeControl });
  });

  // GET /api/matchmaking/status — Check if user is in queue
  fastify.get('/api/matchmaking/status', { preHandler: authenticateRequest }, async (request, reply) => {
    const user = request.user;
    const inQueue = globalMatchmakingService.queue.has(user.id);
    const entry = inQueue ? globalMatchmakingService.queue.get(user.id) : null;
    return reply.send({
      inQueue,
      timeControl: entry?.timeControl || null,
      rating: entry?.rating || null,
      joinedAt: entry?.joinedAt || null
    });
  });

  // POST /api/matchmaking/leave — Leave the matchmaking queue via REST
  fastify.post('/api/matchmaking/leave', { preHandler: authenticateRequest }, async (request, reply) => {
    const user = request.user;
    globalMatchmakingService.queue.delete(user.id);
    return reply.send({ success: true, message: 'Left matchmaking queue.' });
  });
}
