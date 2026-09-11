import { hashPassword, verifyPassword } from '../auth/passwordService.js';
import { generateToken } from '../auth/authService.js';
import { createUser, findUserByEmail, findUserByUsername } from '../db/userRepository.js';
import { authenticateRequest } from '../auth/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimitMiddleware.js';

export async function authRoutes(fastify) {
  // Register (Rate limit: 60/min in production, 100/min in test)
  const regLimit = process.env.NODE_ENV === 'test' ? 100 : 60;
  fastify.post('/api/auth/register', {
    preHandler: rateLimit('auth:register', regLimit, 60000, req => req.ip || req.headers['x-forwarded-for'] || 'anonymous')
  }, async (request, reply) => {
    const { username, email, password } = request.body || {};

    if (!username || !email || !password || typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return reply.status(400).send({ error: 'INVALID_INPUT', message: 'Username, email, and password must be valid strings.' });
    }
    if (username.length < 3 || username.length > 30) {
      return reply.status(400).send({ error: 'INVALID_INPUT', message: 'Username must be between 3 and 30 characters.' });
    }
    if (password.length < 6) {
      return reply.status(400).send({ error: 'INVALID_INPUT', message: 'Password must be at least 6 characters.' });
    }

    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return reply.status(409).send({ error: 'DUPLICATE_EMAIL', message: 'Email is already registered.' });
    }

    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return reply.status(409).send({ error: 'DUPLICATE_USERNAME', message: 'Username is already taken.' });
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const passwordHash = await hashPassword(password);

    const newUser = await createUser({
      id: userId,
      username,
      email,
      passwordHash,
      rating: 1200
    });

    const token = generateToken(newUser);

    return reply.status(201).send({
      user: { id: newUser.id, username: newUser.username, email: newUser.email, rating: newUser.rating, role: newUser.role || 'PLAYER' },
      token
    });
  });

  // Login (Rate limit: 20 per minute per IP / identifier)
  fastify.post('/api/auth/login', {
    preHandler: rateLimit('auth:login', 20, 60000, req => req.body?.identifier || req.body?.email || req.body?.username || req.ip || 'anonymous')
  }, async (request, reply) => {
    const { identifier, email, username, password } = request.body || {};
    const loginId = identifier || email || username;

    if (!loginId || !password || typeof loginId !== 'string' || typeof password !== 'string') {
      return reply.status(400).send({ error: 'INVALID_INPUT', message: 'Username/email and password must be valid strings.' });
    }

    let user = await findUserByEmail(loginId);
    if (!user) {
      user = await findUserByUsername(loginId);
    }

    if (!user) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' });
    }

    const token = generateToken(user);

    return reply.send({
      user: { id: user.id, username: user.username, email: user.email, rating: user.rating, role: user.role || 'PLAYER' },
      token
    });
  });

  // Logout
  fastify.post('/api/auth/logout', async (request, reply) => {
    return reply.send({ success: true, message: 'Logged out successfully.' });
  });

  // Me (Profile)
  fastify.get('/api/auth/me', { preHandler: authenticateRequest }, async (request, reply) => {
    const user = request.user;
    return reply.send({
      user: { id: user.id, username: user.username, email: user.email, rating: user.rating, role: user.role || 'PLAYER' }
    });
  });
}
