/**
 * Provisional Rating Threshold and Utility.
 * Players with fewer than 20 rated games in a category are considered provisional.
 */
export const PROVISIONAL_GAMES_THRESHOLD = 20;

export function isProvisional(gamesPlayed) {
  return (gamesPlayed || 0) < PROVISIONAL_GAMES_THRESHOLD;
}

export function enrichRatingWithProvisional(ratingObj) {
  if (!ratingObj) return ratingObj;
  const games = ratingObj.gamesPlayed !== undefined ? ratingObj.gamesPlayed : (ratingObj.games_played || 0);
  return {
    ...ratingObj,
    gamesPlayed: games,
    isProvisional: isProvisional(games),
    status: isProvisional(games) ? 'provisional' : 'established'
  };
}
