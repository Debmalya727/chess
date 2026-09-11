import { getPaginatedLeaderboard, getUserRankings, isValidRatingType, RATING_TYPES } from '../db/leaderboardRepository.js';
import { authenticateRequest } from '../auth/authMiddleware.js';

export async function leaderboardRoutes(fastify) {
  // GET /api/leaderboards/:ratingType — Global Leaderboards
  fastify.get('/api/leaderboards/:ratingType', async (request, reply) => {
    const { ratingType } = request.params;
    const { page = '1', limit = '50' } = request.query || {};

    if (!isValidRatingType(ratingType)) {
      return reply.status(400).send({
        error: 'INVALID_RATING_TYPE',
        message: `Invalid rating category '${ratingType}'. Allowed: ${RATING_TYPES.join(', ')}.`
      });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Page parameter must be an integer >= 1.'
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return reply.status(400).send({
        error: 'INVALID_INPUT',
        message: 'Limit parameter must be an integer between 1 and 100.'
      });
    }

    const leaderboardData = await getPaginatedLeaderboard(ratingType, { page: pageNum, limit: limitNum });
    return reply.send(leaderboardData);
  });

  // GET /api/users/me/rankings — Authenticated User's Global Rankings Across Categories
  fastify.get('/api/users/me/rankings', { preHandler: authenticateRequest }, async (request, reply) => {
    const user = request.user;
    const rankings = await getUserRankings(user.id);
    return reply.send(rankings);
  });
}
