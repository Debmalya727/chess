import { authenticateRequest } from '../auth/authMiddleware.js';
import { globalChallengeService } from '../challenges/challengeService.js';
import { rateLimit } from '../middleware/rateLimitMiddleware.js';

export async function challengeRoutes(fastify) {
  // POST /api/challenges — Create direct challenge (Rate limit: 25 per minute per user)
  fastify.post('/api/challenges', {
    preHandler: [authenticateRequest, rateLimit('challenges', 25, 60000, req => req.user?.id || req.ip)]
  }, async (request, reply) => {
    const { targetUsername, targetUserId, timeControl, colorPreference } = request.body || {};
    const result = await globalChallengeService.createDirectChallenge({
      challenger: request.user,
      targetUsername,
      targetUserId,
      timeControl,
      colorPreference
    });

    if (result.error) {
      const statusCode = result.error === 'USER_NOT_FOUND' ? 404 : 400;
      return reply.status(statusCode).send(result);
    }
    return reply.status(201).send(result);
  });

  // GET /api/challenges — List active challenges
  fastify.get('/api/challenges', { preHandler: authenticateRequest }, async (request, reply) => {
    const challenges = await globalChallengeService.getUserChallenges(request.user.id);
    return reply.send(challenges);
  });

  // POST /api/challenges/:id/accept — Accept challenge and start online game
  fastify.post('/api/challenges/:id/accept', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const result = await globalChallengeService.acceptChallenge(id, request.user);

    if (result.error) {
      const statusCode = result.error === 'CHALLENGE_NOT_FOUND' ? 404 : 
                         result.error === 'UNAUTHORIZED' ? 403 : 400;
      return reply.status(statusCode).send(result);
    }
    return reply.send(result);
  });

  // POST /api/challenges/:id/decline — Decline challenge
  fastify.post('/api/challenges/:id/decline', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const result = await globalChallengeService.declineChallenge(id, request.user);

    if (result.error) {
      const statusCode = result.error === 'CHALLENGE_NOT_FOUND' ? 404 : 
                         result.error === 'UNAUTHORIZED' ? 403 : 400;
      return reply.status(statusCode).send(result);
    }
    return reply.send(result);
  });

  // DELETE /api/challenges/:id — Cancel challenge
  fastify.delete('/api/challenges/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const result = await globalChallengeService.cancelChallenge(id, request.user);

    if (result.error) {
      const statusCode = result.error === 'CHALLENGE_NOT_FOUND' ? 404 : 
                         result.error === 'UNAUTHORIZED' ? 403 : 400;
      return reply.status(statusCode).send(result);
    }
    return reply.send(result);
  });
}
