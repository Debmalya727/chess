import { authenticateRequest } from '../auth/authMiddleware.js';
import { findUserByUsername } from '../db/userRepository.js';
import {
  sendFriendRequest,
  getFriendRequests,
  getFriendshipById,
  updateFriendshipStatus,
  deleteFriendship,
  getFriends,
  blockUser,
  unblockUser,
  getBlockedUsers
} from '../db/friendRepository.js';
import { globalPresenceService } from '../presence/presenceService.js';
import { WS_EVENTS } from '@chess/protocol';

export async function friendRoutes(fastify) {
  // POST /api/friends/request/:username — Send friend request
  fastify.post('/api/friends/request/:username', { preHandler: authenticateRequest }, async (request, reply) => {
    const { username } = request.params;
    const currentUser = request.user;

    const targetUser = await findUserByUsername(username);
    if (!targetUser) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: `User "${username}" not found.` });
    }

    const result = await sendFriendRequest(currentUser.id, targetUser.id);
    if (result.error) {
      return reply.status(400).send(result);
    }

    // Send real-time notification to recipient if connected
    globalPresenceService.sendToUser(targetUser.id, WS_EVENTS.FRIEND_REQUEST_RECEIVED, {
      requestId: result.id,
      requester: { id: currentUser.id, username: currentUser.username, rating: currentUser.rating }
    });

    return reply.status(201).send(result);
  });

  // GET /api/friends/requests — List incoming and outgoing friend requests
  fastify.get('/api/friends/requests', { preHandler: authenticateRequest }, async (request, reply) => {
    const requests = await getFriendRequests(request.user.id);
    return reply.send(requests);
  });

  // POST /api/friends/requests/:id/accept — Accept friend request
  fastify.post('/api/friends/requests/:id/accept', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const reqRecord = await getFriendshipById(id);

    if (!reqRecord || reqRecord.status !== 'pending') {
      return reply.status(404).send({ error: 'FRIEND_REQUEST_NOT_FOUND', message: 'Pending friend request not found.' });
    }

    const recipientId = reqRecord.recipient_id || reqRecord.recipientId;
    const requesterId = reqRecord.requester_id || reqRecord.requesterId;

    if (recipientId !== request.user.id) {
      return reply.status(403).send({ error: 'UNAUTHORIZED', message: 'Only the recipient can accept this request.' });
    }

    await updateFriendshipStatus(id, 'accepted');

    // Send real-time notification to requester
    globalPresenceService.sendToUser(requesterId, WS_EVENTS.FRIEND_REQUEST_ACCEPTED, {
      friendshipId: id,
      friend: { id: request.user.id, username: request.user.username }
    });

    return reply.send({ success: true, message: 'Friend request accepted.' });
  });

  // POST /api/friends/requests/:id/decline — Decline friend request
  fastify.post('/api/friends/requests/:id/decline', { preHandler: authenticateRequest }, async (request, reply) => {
    const { id } = request.params;
    const reqRecord = await getFriendshipById(id);

    if (!reqRecord || reqRecord.status !== 'pending') {
      return reply.status(404).send({ error: 'FRIEND_REQUEST_NOT_FOUND', message: 'Pending friend request not found.' });
    }

    const recipientId = reqRecord.recipient_id || reqRecord.recipientId;
    if (recipientId !== request.user.id) {
      return reply.status(403).send({ error: 'UNAUTHORIZED', message: 'Only the recipient can decline this request.' });
    }

    await updateFriendshipStatus(id, 'declined');
    return reply.send({ success: true, message: 'Friend request declined.' });
  });

  // GET /api/friends — List friends with real-time presence
  fastify.get('/api/friends', { preHandler: authenticateRequest }, async (request, reply) => {
    const friends = await getFriends(request.user.id);
    const userIds = friends.map(f => f.userId);
    const presences = await globalPresenceService.getMultipleUserStatuses(userIds);

    const enriched = friends.map(f => ({
      ...f,
      presence: presences[f.userId] || 'offline'
    }));

    return reply.send({ friends: enriched });
  });

  // DELETE /api/friends/:username — Remove friend
  fastify.delete('/api/friends/:username', { preHandler: authenticateRequest }, async (request, reply) => {
    const { username } = request.params;
    const target = await findUserByUsername(username);
    if (!target) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    await deleteFriendship(request.user.id, target.id);
    return reply.send({ success: true, message: `Removed "${username}" from friends.` });
  });

  // POST /api/users/:username/block — Block user
  fastify.post('/api/users/:username/block', { preHandler: authenticateRequest }, async (request, reply) => {
    const { username } = request.params;
    const target = await findUserByUsername(username);
    if (!target) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    const res = await blockUser(request.user.id, target.id);
    if (res.error) {
      return reply.status(400).send(res);
    }
    return reply.send({ success: true, message: `Blocked "${username}".` });
  });

  // DELETE /api/users/:username/block — Unblock user
  fastify.delete('/api/users/:username/block', { preHandler: authenticateRequest }, async (request, reply) => {
    const { username } = request.params;
    const target = await findUserByUsername(username);
    if (!target) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    const res = await unblockUser(request.user.id, target.id);
    if (res.error) {
      return reply.status(400).send(res);
    }
    return reply.send({ success: true, message: `Unblocked "${username}".` });
  });

  // GET /api/blocks — List blocked users
  fastify.get('/api/blocks', { preHandler: authenticateRequest }, async (request, reply) => {
    const blocked = await getBlockedUsers(request.user.id);
    return reply.send({ blocked });
  });
}
