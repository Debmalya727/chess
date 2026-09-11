import { verifyToken } from '../../auth/authService.js';
import { findUserById } from '../../db/userRepository.js';

export async function handleAuthToken(socket, payload, clientState, sendResponse, sendError) {
  const { token } = payload;
  if (!token) {
    return sendError('UNAUTHORIZED', 'Token is required.');
  }

  const tokenData = verifyToken(token);
  if (!tokenData) {
    return sendError('UNAUTHORIZED', 'Invalid or expired token.');
  }

  const user = await findUserById(tokenData.id);
  if (!user) {
    return sendError('UNAUTHORIZED', 'User not found.');
  }

  clientState.user = user;
  clientState.isAuthenticated = true;
  if (clientState.authTimeout) {
    clearTimeout(clientState.authTimeout);
    clientState.authTimeout = null;
  }
  socket.user = user;

  import('../../presence/presenceService.js').then(({ globalPresenceService }) => {
    globalPresenceService.handleUserConnected(user.id, socket, user.username);
  }).catch(() => {});

  sendResponse('auth:success', {
    user: { id: user.id, username: user.username, rating: user.rating }
  });
}
