import crypto from 'crypto';
import { createChallenge, getChallengeById, updateChallenge, listChallenges } from '../db/challengeRepository.js';
import { findUserByUsername, findUserById } from '../db/userRepository.js';
import { isBlocked } from '../db/friendRepository.js';
import { globalRoomManager } from '../rooms/roomManager.js';
import { globalGameManager } from '../games/gameManager.js';
import { createGame } from '../db/gameRepository.js';
import { getRatingCategory } from '../ratings/ratingService.js';
import { globalPresenceService } from '../presence/presenceService.js';
import { getActiveGameForUser } from '../games/gameService.js';
import { WS_EVENTS } from '@chess/protocol';

export class ChallengeService {
  constructor() {
    this.acceptLock = new Set(); // challengeId lock
  }

  async createDirectChallenge({ challenger, targetUsername, targetUserId, timeControl = '5+0', colorPreference = 'random' }) {
    if (!challenger || (!targetUsername && !targetUserId)) {
      return { error: 'INVALID_PARAMETERS', message: 'Challenger and target username or user ID are required.' };
    }

    const targetUser = targetUsername ? await findUserByUsername(targetUsername) : await findUserById(targetUserId);
    if (!targetUser) {
      return { error: 'USER_NOT_FOUND', message: `Target user not found.` };
    }

    if (challenger.id === targetUser.id) {
      return { error: 'CANNOT_CHALLENGE_SELF', message: 'You cannot challenge yourself.' };
    }

    // Check blocking in either direction
    const blocked = await isBlocked(challenger.id, targetUser.id);
    if (blocked) {
      return { error: 'USER_BLOCKED', message: 'Unable to challenge this user.' };
    }

    // Check if either user is in an active game
    if (await getActiveGameForUser(challenger.id)) {
      return { error: 'PLAYER_ALREADY_IN_GAME', message: 'You are currently in an active game.' };
    }
    if (await getActiveGameForUser(targetUser.id)) {
      return { error: 'PLAYER_ALREADY_IN_GAME', message: 'The opponent is currently in an active game.' };
    }

    const ratingType = getRatingCategory(timeControl);
    const challengeId = `chal_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const challenge = await createChallenge({
      id: challengeId,
      challengerId: challenger.id,
      challengedId: targetUser.id,
      ratingType,
      timeControl,
      colorPreference,
      expiresAt
    });

    const payload = {
      ...challenge,
      challengerUsername: challenger.username,
      challengedUsername: targetUser.username,
      challenger: { id: challenger.id, username: challenger.username },
      challenged: { id: targetUser.id, username: targetUser.username }
    };

    // Send real-time notification to challenged user if online
    globalPresenceService.sendToUser(targetUser.id, WS_EVENTS.CHALLENGE_RECEIVED, payload);

    return payload;
  }

  async acceptChallenge(challengeId, acceptingUser) {
    if (!challengeId || !acceptingUser) {
      return { error: 'INVALID_PARAMETERS', message: 'Challenge ID is required.' };
    }

    // Concurrency lock for challenge acceptance
    if (this.acceptLock.has(challengeId)) {
      return { error: 'CHALLENGE_ALREADY_RESOLVED', message: 'Challenge is currently being processed.' };
    }
    this.acceptLock.add(challengeId);

    try {
      const challenge = await getChallengeById(challengeId);
      if (!challenge) {
        return { error: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found.' };
      }

      if (challenge.status !== 'pending') {
        return { error: 'CHALLENGE_ALREADY_RESOLVED', message: `Challenge has already been ${challenge.status}.` };
      }

      if (new Date(challenge.expiresAt).getTime() < Date.now()) {
        await updateChallenge(challengeId, { status: 'expired' });
        return { error: 'CHALLENGE_EXPIRED', message: 'This challenge has expired.' };
      }

      if (challenge.challengedId !== acceptingUser.id) {
        return { error: 'UNAUTHORIZED', message: 'Only the challenged player can accept this challenge.' };
      }

      // Check active games for both players
      if ((await getActiveGameForUser(challenge.challengerId)) || (await getActiveGameForUser(challenge.challengedId))) {
        return { error: 'PLAYER_ALREADY_IN_GAME', message: 'One of the players is already in an active game.' };
      }

      const challenger = await findUserById(challenge.challengerId);
      const challenged = acceptingUser;

      if (!challenger) {
        return { error: 'USER_NOT_FOUND', message: 'Challenger account no longer exists.' };
      }

      // Authoritative color assignment
      let isChallengerWhite = true;
      if (challenge.colorPreference === 'w') {
        isChallengerWhite = true;
      } else if (challenge.colorPreference === 'b') {
        isChallengerWhite = false;
      } else {
        isChallengerWhite = Math.random() < 0.5;
      }

      const whiteUser = isChallengerWhite ? challenger : challenged;
      const blackUser = isChallengerWhite ? challenged : challenger;

      // Create game room
      const room = globalRoomManager.createRoom({
        hostUser: whiteUser,
        timeControl: challenge.timeControl,
        colorPreference: 'w'
      });

      room.whiteUsername = whiteUser.username;
      room.blackUsername = blackUser.username;
      globalRoomManager.joinRoom(room.roomCode, blackUser);

      // Create database game record
      await createGame({
        id: room.id,
        roomCode: room.roomCode,
        whitePlayerId: whiteUser.id,
        blackPlayerId: blackUser.id,
        timeControl: challenge.timeControl,
        mode: 'ONLINE',
        status: 'ACTIVE'
      });

      // Start game session
      const session = globalGameManager.getOrCreateSession(room);
      session.start();

      // Mark challenge as accepted
      await updateChallenge(challengeId, { status: 'accepted', gameId: room.id });

      const notification = {
        challengeId,
        gameId: room.id,
        roomCode: room.roomCode,
        timeControl: challenge.timeControl,
        ratingType: challenge.ratingType,
        whiteUsername: whiteUser.username,
        blackUsername: blackUser.username
      };

      globalPresenceService.sendToUser(challenger.id, WS_EVENTS.CHALLENGE_ACCEPTED, notification);
      globalPresenceService.sendToUser(challenged.id, WS_EVENTS.CHALLENGE_ACCEPTED, notification);

      return {
        success: true,
        gameId: room.id,
        roomCode: room.roomCode,
        whiteUsername: whiteUser.username,
        blackUsername: blackUser.username,
        color: acceptingUser.id === whiteUser.id ? 'white' : 'black'
      };
    } finally {
      this.acceptLock.delete(challengeId);
    }
  }

  async declineChallenge(challengeId, decliningUser) {
    const challenge = await getChallengeById(challengeId);
    if (!challenge) {
      return { error: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found.' };
    }

    if (challenge.status !== 'pending') {
      return { error: 'CHALLENGE_ALREADY_RESOLVED', message: `Challenge has already been ${challenge.status}.` };
    }

    if (challenge.challengedId !== decliningUser.id && challenge.challengerId !== decliningUser.id) {
      return { error: 'UNAUTHORIZED', message: 'You cannot modify this challenge.' };
    }

    await updateChallenge(challengeId, { status: 'declined' });
    globalPresenceService.sendToUser(challenge.challengerId, WS_EVENTS.CHALLENGE_DECLINED, { challengeId });

    return { success: true };
  }

  async cancelChallenge(challengeId, cancellingUser) {
    const challenge = await getChallengeById(challengeId);
    if (!challenge) {
      return { error: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found.' };
    }

    if (challenge.status !== 'pending') {
      return { error: 'CHALLENGE_ALREADY_RESOLVED', message: `Challenge has already been ${challenge.status}.` };
    }

    if (challenge.challengerId !== cancellingUser.id) {
      return { error: 'UNAUTHORIZED', message: 'Only the challenger can cancel this challenge.' };
    }

    await updateChallenge(challengeId, { status: 'cancelled' });
    globalPresenceService.sendToUser(challenge.challengedId, WS_EVENTS.CHALLENGE_CANCELLED, { challengeId });

    return { success: true };
  }

  async getUserChallenges(userId) {
    return listChallenges(userId);
  }
}

export const globalChallengeService = new ChallengeService();
