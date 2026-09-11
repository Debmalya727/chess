import { authenticateRequest } from '../auth/authMiddleware.js';
import { requireRole } from '../auth/rbacMiddleware.js';
import { globalFairPlayService } from '../fairplay/fairPlayService.js';

export async function fairPlayRoutes(fastify) {
  // GET /api/admin/fair-play — Moderation list of fair-play analyses (ADMIN only)
  fastify.get('/api/admin/fair-play', { preHandler: [authenticateRequest, requireRole('ADMIN')] }, async (request, reply) => {
    const { status, limit = 50 } = request.query || {};
    const analyses = await globalFairPlayService.listAnalyses({ status, limit });
    return reply.send({ analyses });
  });

  // GET /api/admin/fair-play/:gameId — Specific game analysis details (ADMIN only)
  fastify.get('/api/admin/fair-play/:gameId', { preHandler: [authenticateRequest, requireRole('ADMIN')] }, async (request, reply) => {
    const { gameId } = request.params;
    const analysis = await globalFairPlayService.getGameAnalysis(gameId);
    if (!analysis) {
      return reply.status(404).send({ error: 'ANALYSIS_NOT_FOUND', message: 'Fair-play analysis not found for this game.' });
    }
    return reply.send(analysis);
  });
}
