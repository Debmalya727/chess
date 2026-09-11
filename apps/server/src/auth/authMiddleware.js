import { verifyToken } from './authService.js';
import { findUserById } from '../db/userRepository.js';

export async function authenticateRequest(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired token.' });
  }

  const user = await findUserById(payload.id);
  if (!user) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'User not found.' });
  }

  request.user = user;
}
