/**
 * Role-Based Access Control Middleware.
 * Roles: PLAYER (default), TOURNAMENT_ORGANIZER, ADMIN
 */
export function requireRole(...allowedRoles) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication is required for this action.'
      });
    }

    const userRole = request.user.role || 'PLAYER';
    if (!allowedRoles.includes(userRole)) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}.`
      });
    }
  };
}
