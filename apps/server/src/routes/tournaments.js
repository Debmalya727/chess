import { globalTournamentService } from '../tournaments/tournamentService.js';
import { authenticateRequest } from '../auth/authMiddleware.js';
import { requireRole } from '../auth/rbacMiddleware.js';
import { isRedisConnected } from '../redis/redisClient.js';
import { InMemoryRateLimitStore, RedisRateLimitStore } from '../websocket/rateLimitStore.js';
import { getTournamentRounds, getTournamentPairings, getTournamentGames, getTournamentEntries } from '../db/tournamentRepository.js';

const inMemoryRateLimiter = new InMemoryRateLimitStore();
const redisRateLimiter = new RedisRateLimitStore();

async function checkRateLimit(scope, identifier, limit = 60, windowMs = 60000) {
  if (isRedisConnected()) {
    return await redisRateLimiter.isAllowed(scope, identifier, limit, windowMs);
  }
  return await inMemoryRateLimiter.isAllowed(scope, identifier, limit, windowMs);
}

export async function tournamentRoutes(fastify) {
  // GET /api/tournaments — List tournaments with optional filtering & pagination
  fastify.get('/api/tournaments', async (request, reply) => {
    const { status, type, limit = '50', offset = '0' } = request.query || {};
    const tournaments = await globalTournamentService.listTournaments({ status, type, limit, offset });
    return reply.send({ tournaments });
  });

  // GET /api/tournaments/:id — Get single tournament details
  fastify.get('/api/tournaments/:id', async (request, reply) => {
    const { id } = request.params;
    const tournament = await globalTournamentService.getTournamentDetails(id);
    if (!tournament) {
      return reply.status(404).send({ error: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found.' });
    }
    return reply.send(tournament);
  });

  // GET /api/tournaments/:id/participants — List participants
  fastify.get('/api/tournaments/:id/participants', async (request, reply) => {
    const { id } = request.params;
    const tournament = await globalTournamentService.getTournamentDetails(id);
    if (!tournament) {
      return reply.status(404).send({ error: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found.' });
    }
    const participants = await getTournamentEntries(id);
    return reply.send({ tournamentId: id, participants });
  });

  // GET /api/tournaments/:id/standings — Get tournament standings
  fastify.get('/api/tournaments/:id/standings', async (request, reply) => {
    const { id } = request.params;
    const standingsData = await globalTournamentService.getStandings(id);
    if (!standingsData) {
      return reply.status(404).send({ error: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found.' });
    }
    return reply.send(standingsData);
  });

  // GET /api/tournaments/:id/rounds — List rounds
  fastify.get('/api/tournaments/:id/rounds', async (request, reply) => {
    const { id } = request.params;
    const rounds = await getTournamentRounds(id);
    return reply.send({ tournamentId: id, rounds });
  });

  // GET /api/tournaments/:id/pairings — List pairings
  fastify.get('/api/tournaments/:id/pairings', async (request, reply) => {
    const { id } = request.params;
    const { round } = request.query || {};
    const roundNumber = round !== undefined ? parseInt(round, 10) : null;
    const pairings = await getTournamentPairings(id, roundNumber);
    return reply.send({ tournamentId: id, roundNumber, pairings });
  });

  // GET /api/tournaments/:id/games — List games
  fastify.get('/api/tournaments/:id/games', async (request, reply) => {
    const { id } = request.params;
    const games = await getTournamentGames(id);
    return reply.send({ tournamentId: id, games });
  });

  // POST /api/tournaments/:id/register — Register/Join tournament
  fastify.post('/api/tournaments/:id/register', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const user = request.user;

    const allowed = await checkRateLimit('tournament_register', user.id, 20, 60000);
    if (!allowed) {
      return reply.status(429).send({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many registration requests.' });
    }

    const result = await globalTournamentService.joinTournament(id, user);
    if (result.error) {
      return reply.status(400).send(result);
    }
    return reply.send(result);
  });

  // POST /api/tournaments/:id/join — Compatibility alias for registration
  fastify.post('/api/tournaments/:id/join', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const user = request.user;
    const result = await globalTournamentService.joinTournament(id, user);
    if (result.error) {
      return reply.status(400).send(result);
    }
    return reply.send(result);
  });

  // DELETE /api/tournaments/:id/register — Withdraw/Leave tournament
  fastify.delete('/api/tournaments/:id/register', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const user = request.user;

    const allowed = await checkRateLimit('tournament_withdraw', user.id, 20, 60000);
    if (!allowed) {
      return reply.status(429).send({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many withdrawal requests.' });
    }

    const result = await globalTournamentService.leaveTournament(id, user.id);
    if (result.error) {
      return reply.status(400).send(result);
    }
    return reply.send(result);
  });

  // POST /api/tournaments/:id/withdraw — Withdraw alias
  fastify.post('/api/tournaments/:id/withdraw', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const user = request.user;
    const result = await globalTournamentService.leaveTournament(id, user.id);
    if (result.error) {
      return reply.status(400).send(result);
    }
    return reply.send(result);
  });

  // POST /api/tournaments/:id/leave — Compatibility alias for withdraw
  fastify.post('/api/tournaments/:id/leave', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const user = request.user;
    const result = await globalTournamentService.leaveTournament(id, user.id);
    if (result.error) {
      return reply.status(400).send(result);
    }
    return reply.send(result);
  });

  // POST /api/tournaments — Tournament creation (restricted to TOURNAMENT_ORGANIZER or ADMIN)
  fastify.post('/api/tournaments', { preHandler: [authenticateRequest, requireRole('TOURNAMENT_ORGANIZER', 'ADMIN')] }, async (request, reply) => {
    const allowed = await checkRateLimit('tournament_create', request.user.id, 10, 60000);
    if (!allowed) {
      return reply.status(429).send({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many tournament creation requests.' });
    }

    const payload = request.body || {};
    const tournament = await globalTournamentService.createTournament(payload, request.user);
    return reply.status(201).send(tournament);
  });

  // POST /api/admin/tournaments — Compatibility alias for creation
  fastify.post('/api/admin/tournaments', { preHandler: [authenticateRequest, requireRole('TOURNAMENT_ORGANIZER', 'ADMIN')] }, async (request, reply) => {
    const payload = request.body || {};
    const tournament = await globalTournamentService.createTournament(payload, request.user);
    return reply.status(201).send(tournament);
  });

  // POST /api/tournaments/:id/start — Start tournament (TOURNAMENT_ORGANIZER or ADMIN)
  fastify.post('/api/tournaments/:id/start', { preHandler: [authenticateRequest, requireRole('TOURNAMENT_ORGANIZER', 'ADMIN')] }, async (request, reply) => {
    const { id } = request.params;
    const result = await globalTournamentService.startTournament(id, request.user);
    if (result.error) {
      return reply.status(400).send(result);
    }
    return reply.send(result);
  });

  // POST /api/tournaments/:id/rounds/next — Advance Swiss round (TOURNAMENT_ORGANIZER or ADMIN)
  fastify.post('/api/tournaments/:id/rounds/next', { preHandler: [authenticateRequest, requireRole('TOURNAMENT_ORGANIZER', 'ADMIN')] }, async (request, reply) => {
    const { id } = request.params;
    const result = await globalTournamentService.nextSwissRound(id, request.user);
    if (result.error) {
      return reply.status(400).send(result);
    }
    return reply.send(result);
  });

  // POST /api/tournaments/:id/pair — Trigger Arena pairing batch (TOURNAMENT_ORGANIZER or ADMIN)
  fastify.post('/api/tournaments/:id/pair', { preHandler: [authenticateRequest, requireRole('TOURNAMENT_ORGANIZER', 'ADMIN')] }, async (request, reply) => {
    const { id } = request.params;
    const pairings = await globalTournamentService.processArenaPairings(id);
    return reply.send({ success: true, pairings });
  });

  // POST /api/tournaments/:id/finish — Complete tournament (TOURNAMENT_ORGANIZER or ADMIN)
  fastify.post('/api/tournaments/:id/finish', { preHandler: [authenticateRequest, requireRole('TOURNAMENT_ORGANIZER', 'ADMIN')] }, async (request, reply) => {
    const { id } = request.params;
    const result = await globalTournamentService.finishTournament(id);
    if (result.error) {
      return reply.status(400).send(result);
    }
    return reply.send(result);
  });

  // POST /api/tournaments/:id/cancel — Cancel tournament (TOURNAMENT_ORGANIZER or ADMIN)
  fastify.post('/api/tournaments/:id/cancel', { preHandler: [authenticateRequest, requireRole('TOURNAMENT_ORGANIZER', 'ADMIN')] }, async (request, reply) => {
    const { id } = request.params;
    const result = await globalTournamentService.cancelTournament(id, request.user);
    if (result.error) {
      return reply.status(400).send(result);
    }
    return reply.send(result);
  });

  // POST /api/tournaments/:id/games/:gameId/result — Record / Arbiter report tournament match result (ORGANIZER or ADMIN)
  fastify.post('/api/tournaments/:id/games/:gameId/result', { preHandler: [authenticateRequest, requireRole('TOURNAMENT_ORGANIZER', 'ADMIN')] }, async (request, reply) => {
    const { id, gameId } = request.params;
    const { result } = request.body || {};
    if (!result) {
      return reply.status(400).send({ error: 'INVALID_RESULT', message: 'Result is required (1-0, 0-1, 1/2-1/2)' });
    }
    await globalTournamentService.handleTournamentGameEnd(id, gameId, result);
    return reply.send({ success: true, tournamentId: id, gameId, result });
  });
}
