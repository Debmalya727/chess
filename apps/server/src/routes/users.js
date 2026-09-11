import { findUserByUsername, findUserById, updateUserRole } from '../db/userRepository.js';
import { findGamesByUserId, findPaginatedGamesByUserId } from '../db/gameRepository.js';
import { getUserRatings, getRatingHistory, getRatingHistoryByType } from '../db/ratingRepository.js';
import { getUserStats } from '../users/userStatsService.js';
import { getUserRankings } from '../db/leaderboardRepository.js';
import { authenticateRequest } from '../auth/authMiddleware.js';
import { enrichRatingWithProvisional } from '../ratings/provisionalService.js';
import { globalPresenceService } from '../presence/presenceService.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export async function userRoutes(fastify) {
  // GET /api/users/me — Authenticated player profile
  fastify.get('/api/users/me', { preHandler: authenticateRequest }, async (request, reply) => {
    const authUser = request.user;
    const user = await findUserById(authUser.id);
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'User profile not found.' });
    }

    const { statistics, ratings } = await getUserStats(user.id);
    const rankings = await getUserRankings(user.id);

    const enrichedRatings = {};
    for (const [cat, r] of Object.entries(ratings || {})) {
      enrichedRatings[cat] = enrichRatingWithProvisional(r);
    }

    return reply.send({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'PLAYER',
      createdAt: user.createdAt,
      statistics,
      ratings: enrichedRatings,
      rankings
    });
  });

  // GET /api/users/me/ratings — Authenticated user ratings dashboard
  fastify.get('/api/users/me/ratings', { preHandler: authenticateRequest }, async (request, reply) => {
    const authUser = request.user;
    const { ratings } = await getUserStats(authUser.id);
    return reply.send(ratings);
  });

  // GET /api/users/me/ratings/:ratingType/history — Categorized rating history
  fastify.get('/api/users/me/ratings/:ratingType/history', { preHandler: authenticateRequest }, async (request, reply) => {
    const { ratingType } = request.params;
    const { limit = '50' } = request.query || {};

    const validCategories = ['bullet', 'blitz', 'rapid', 'classical'];
    if (!validCategories.includes(ratingType)) {
      return reply.status(400).send({
        error: 'INVALID_RATING_TYPE',
        message: `Invalid rating type '${ratingType}'. Allowed: ${validCategories.join(', ')}`
      });
    }

    const authUser = request.user;
    const historyLogs = await getRatingHistoryByType(authUser.id, ratingType, limit);

    const formattedHistory = historyLogs.map(h => ({
      rating: h.newRating,
      previousRating: h.oldRating,
      delta: h.ratingChange,
      gameId: h.gameId,
      createdAt: h.createdAt
    }));

    return reply.send(formattedHistory);
  });

  // GET /api/users/:username — Public player profile
  fastify.get('/api/users/:username', async (request, reply) => {
    const { username } = request.params;
    const user = await findUserByUsername(username);

    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: `Player '${username}' not found.` });
    }

    const { statistics, ratings } = await getUserStats(user.id);
    const rankings = await getUserRankings(user.id);
    const recentGamesResult = await findPaginatedGamesByUserId(user.id, { page: 1, limit: 10 });
    const presenceStatus = await globalPresenceService.getUserStatus(user.id);

    const enrichedRatings = {};
    for (const [cat, r] of Object.entries(ratings || {})) {
      enrichedRatings[cat] = enrichRatingWithProvisional(r);
    }

    return reply.send({
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      presence: presenceStatus,
      statistics,
      ratings: enrichedRatings,
      rankings,
      recentGames: recentGamesResult.games
    });
  });

  // GET /api/users/me/opponents — Recent opponents with win/loss record
  fastify.get('/api/users/me/opponents', { preHandler: authenticateRequest }, async (request, reply) => {
    const userId = request.user.id;
    const { limit = '20' } = request.query || {};
    const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);

    const games = await findGamesByUserId(userId);
    const finishedGames = games.filter(g => g.status === 'FINISHED');

    const opponentMap = new Map();

    for (const g of finishedGames) {
      const isWhite = g.whitePlayerId === userId;
      const opponentId = isWhite ? g.blackPlayerId : g.whitePlayerId;
      if (!opponentId || opponentId === userId) continue;

      if (!opponentMap.has(opponentId)) {
        opponentMap.set(opponentId, {
          userId: opponentId,
          lastPlayed: g.endedAt || g.createdAt,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0
        });
      }

      const opp = opponentMap.get(opponentId);
      opp.gamesPlayed++;
      if (g.result === '1/2-1/2') {
        opp.draws++;
      } else if ((isWhite && g.result === '1-0') || (!isWhite && g.result === '0-1')) {
        opp.wins++;
      } else if ((isWhite && g.result === '0-1') || (!isWhite && g.result === '1-0')) {
        opp.losses++;
      }
    }

    const opponentList = Array.from(opponentMap.values()).slice(0, parsedLimit);

    const enriched = await Promise.all(opponentList.map(async opp => {
      const u = await findUserById(opp.userId);
      const presence = await globalPresenceService.getUserStatus(opp.userId);
      return {
        userId: opp.userId,
        username: u ? u.username : 'Unknown',
        avatarUrl: u ? u.avatarUrl : null,
        rating: u ? u.rating : 1500,
        lastPlayed: opp.lastPlayed,
        gamesPlayedAgainst: opp.gamesPlayed,
        wins: opp.wins,
        losses: opp.losses,
        draws: opp.draws,
        presence
      };
    }));

    return reply.send({ opponents: enriched });
  });

  // GET /api/users/:username/presence — Public presence status
  fastify.get('/api/users/:username/presence', async (request, reply) => {
    const { username } = request.params;
    const user = (await findUserByUsername(username)) || (await findUserById(username));
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'User not found.' });
    }
    const status = await globalPresenceService.getUserStatus(user.id);
    return reply.send({ status });
  });

  // GET /api/presence/:userId
  fastify.get('/api/presence/:userId', async (request, reply) => {
    const { userId } = request.params;
    const status = await globalPresenceService.getUserStatus(userId);
    return reply.send({ userId, status });
  });

  // Legacy compatibility routes
  fastify.get('/api/users/:username/games', async (request, reply) => {
    const { username } = request.params;
    const user = await findUserByUsername(username);
    if (!user) {
      return reply.status(404).send({ error: 'PLAYER_NOT_FOUND', message: 'Player not found.' });
    }

    const games = await findGamesByUserId(user.id);
    return reply.send({
      user: { id: user.id, username: user.username, rating: user.rating },
      games
    });
  });

  fastify.get('/api/users/:userId/ratings', async (request, reply) => {
    const { userId } = request.params;
    const ratings = await getUserRatings(userId);
    const history = await getRatingHistory(userId);
    return reply.send({ userId, ratings, history });
  });

  fastify.get('/api/me/ratings', { preHandler: authenticateRequest }, async (request, reply) => {
    const user = request.user;
    const ratings = await getUserRatings(user.id);
    const history = await getRatingHistory(user.id);
    return reply.send({ userId: user.id, ratings, history });
  });

  // POST /api/admin/users/:userId/role — Protected role management (ADMIN only or internal bootstrap)
  fastify.post('/api/admin/users/:userId/role', async (request, reply) => {
    const authHeader = request.headers.authorization;
    let isAdmin = false;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        const reqUser = await findUserById(decoded.id);
        if (reqUser && reqUser.role === 'ADMIN') isAdmin = true;
      } catch {}
    }

    if (!isAdmin) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin role required.' });
    }

    const { userId } = request.params;
    const { role } = request.body || {};
    const validRoles = ['PLAYER', 'TOURNAMENT_ORGANIZER', 'ADMIN'];
    if (!validRoles.includes(role)) {
      return reply.status(400).send({ error: 'INVALID_ROLE', message: `Invalid role: ${role}` });
    }

    const updated = await updateUserRole(userId, role);
    return reply.send({ success: true, user: updated });
  });

  // POST /api/admin/promote-test — Test-only bootstrap helper
  fastify.post('/api/admin/promote-test', async (request, reply) => {
    const isDevOrTest = process.env.NODE_ENV !== 'production' || process.env.DB_MODE === 'memory';
    if (!isDevOrTest) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Test promotion not allowed in production.' });
    }
    const { userId, role } = request.body || {};
    const validRoles = ['PLAYER', 'TOURNAMENT_ORGANIZER', 'ADMIN'];
    if (!validRoles.includes(role)) {
      return reply.status(400).send({ error: 'INVALID_ROLE', message: `Invalid role: ${role}` });
    }
    const updated = await updateUserRole(userId, role);
    return reply.send({ success: true, user: updated });
  });
}
