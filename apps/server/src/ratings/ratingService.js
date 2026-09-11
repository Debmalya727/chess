import { config } from '../config/env.js';
import { getUserRating, updateRatingTransaction, hasRatingBeenAppliedForGame } from '../db/ratingRepository.js';

/**
 * Determines rating category based on time control (e.g., "1+0", "3+2", "10+0", "30+0").
 * Categories:
 * - bullet: initial base time < 3 minutes
 * - blitz: initial base time 3 to 5 minutes
 * - rapid: initial base time 6 to 29 minutes
 * - classical: initial base time >= 30 minutes
 */
export function getRatingCategory(timeControl) {
  if (!timeControl || typeof timeControl !== 'string') return 'rapid';

  const parts = timeControl.split('+');
  const baseMinutes = parseFloat(parts[0]) || 10;

  if (baseMinutes < 3) {
    return 'bullet';
  } else if (baseMinutes <= 5) {
    return 'blitz';
  } else if (baseMinutes < 30) {
    return 'rapid';
  } else {
    return 'classical';
  }
}

/**
 * Calculates updated Elo ratings for two players.
 * @param {number} ratingA Player A current rating
 * @param {number} ratingB Player B current rating
 * @param {number} scoreA 1 for win, 0.5 for draw, 0 for loss
 * @param {number} [kFactor] Configurable K-factor (default 32)
 */
export function calculateElo(ratingA, ratingB, scoreA, kFactor = config.ratings?.kFactor || 32) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;

  const newRatingA = Math.round(ratingA + kFactor * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + kFactor * (scoreB - expectedB));

  return {
    playerA: {
      oldRating: ratingA,
      newRating: newRatingA,
      change: newRatingA - ratingA
    },
    playerB: {
      oldRating: ratingB,
      newRating: newRatingB,
      change: newRatingB - ratingB
    }
  };
}

/**
 * Calculates and persists rating updates for a completed rated game.
 */
export async function applyGameRatings({ gameId, timeControl, whiteUserId, blackUserId, result, connection = null }) {
  if (!whiteUserId || !blackUserId || whiteUserId === blackUserId) {
    return null; // Guest game or same user match - unrated
  }

  if (!['1-0', '0-1', '1/2-1/2'].includes(result)) {
    return null; // Incomplete or aborted game
  }

  // Deduplication check: Guarantee no double-Elo under concurrent completion races
  if (gameId && (await hasRatingBeenAppliedForGame(gameId, connection))) {
    return null;
  }

  const ratingType = getRatingCategory(timeControl);

  // Fetch current user ratings
  const whiteRecord = await getUserRating(whiteUserId, ratingType);
  const blackRecord = await getUserRating(blackUserId, ratingType);

  let scoreWhite = 0.5;
  if (result === '1-0') scoreWhite = 1;
  if (result === '0-1') scoreWhite = 0;

  const eloResult = calculateElo(whiteRecord.rating, blackRecord.rating, scoreWhite);

  const whiteOutcome = result === '1-0' ? 'win' : result === '0-1' ? 'loss' : 'draw';
  const blackOutcome = result === '0-1' ? 'win' : result === '1-0' ? 'loss' : 'draw';

  // Apply ratings atomically
  const whiteUpdate = await updateRatingTransaction({
    userId: whiteUserId,
    ratingType,
    oldRating: eloResult.playerA.oldRating,
    newRating: eloResult.playerA.newRating,
    outcome: whiteOutcome,
    gameId,
    connection
  });

  const blackUpdate = await updateRatingTransaction({
    userId: blackUserId,
    ratingType,
    oldRating: eloResult.playerB.oldRating,
    newRating: eloResult.playerB.newRating,
    outcome: blackOutcome,
    gameId,
    connection
  });

  return {
    ratingType,
    white: whiteUpdate,
    black: blackUpdate
  };
}
