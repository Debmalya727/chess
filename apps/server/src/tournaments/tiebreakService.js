/**
 * Tiebreak Service for Chess Tournaments
 * 
 * Primary tiebreak: Buchholz System (Opponents' Score)
 * Formula:
 *   Buchholz(P) = SUM( Score(O) ) for all opponents O that player P has played against in the tournament.
 * 
 * Rules:
 *   - Byes do not contribute an opponent to the Buchholz score.
 *   - Unplayed / withdrawn games where no pairing occurred do not count.
 *   - If an opponent withdrew later, their accumulated score still counts toward P's Buchholz score.
 *   - Calculations are deterministic and recalculated from authoritative pairing and entry data.
 */

/**
 * Calculates Buchholz tiebreak score for all participants in a tournament.
 * 
 * @param {Array<{userId: string, score: number, withdrawn?: boolean}>} entries 
 * @param {Array<{whiteUserId: string, blackUserId: string|null, isBye?: boolean, result?: string|null}>} pairings 
 * @returns {Map<string, number>} Map of userId -> tiebreakScore
 */
export function calculateBuchholzTiebreaks(entries, pairings) {
  const scoresByUserId = new Map();
  for (const entry of entries) {
    scoresByUserId.set(entry.userId, Number(entry.score || 0));
  }

  // Build opponent sets for each player
  const opponentsByUserId = new Map();
  for (const entry of entries) {
    opponentsByUserId.set(entry.userId, []);
  }

  for (const pairing of pairings) {
    if (pairing.isBye || !pairing.blackUserId) {
      // Byes have no opponent
      continue;
    }

    const white = pairing.whiteUserId;
    const black = pairing.blackUserId;

    if (opponentsByUserId.has(white)) {
      opponentsByUserId.get(white).push(black);
    }
    if (opponentsByUserId.has(black)) {
      opponentsByUserId.get(black).push(white);
    }
  }

  const tiebreaks = new Map();
  for (const [userId, opponents] of opponentsByUserId.entries()) {
    let sumOpponentScores = 0.0;
    for (const oppId of opponents) {
      sumOpponentScores += scoresByUserId.get(oppId) || 0.0;
    }
    // Round to 2 decimal places to eliminate floating point imprecision
    tiebreaks.set(userId, Math.round(sumOpponentScores * 100) / 100);
  }

  return tiebreaks;
}

/**
 * Sonneborn-Berger tiebreak (Secondary tiebreak)
 * Formula:
 *   SUM( Score(O) * PointsWon(P against O) )
 */
export function calculateSonnebornBerger(entries, pairings) {
  const scoresByUserId = new Map();
  for (const entry of entries) {
    scoresByUserId.set(entry.userId, Number(entry.score || 0));
  }

  const sbByUserId = new Map();
  for (const entry of entries) {
    sbByUserId.set(entry.userId, 0.0);
  }

  for (const pairing of pairings) {
    if (pairing.isBye || !pairing.blackUserId || !pairing.result) continue;

    const white = pairing.whiteUserId;
    const black = pairing.blackUserId;
    const wScore = scoresByUserId.get(white) || 0;
    const bScore = scoresByUserId.get(black) || 0;

    let whitePts = 0;
    let blackPts = 0;
    if (pairing.result === '1-0') {
      whitePts = 1.0;
    } else if (pairing.result === '0-1') {
      blackPts = 1.0;
    } else if (pairing.result === '1/2-1/2') {
      whitePts = 0.5;
      blackPts = 0.5;
    }

    if (sbByUserId.has(white)) {
      sbByUserId.set(white, sbByUserId.get(white) + (bScore * whitePts));
    }
    if (sbByUserId.has(black)) {
      sbByUserId.set(black, sbByUserId.get(black) + (wScore * blackPts));
    }
  }

  for (const [userId, val] of sbByUserId.entries()) {
    sbByUserId.set(userId, Math.round(val * 100) / 100);
  }

  return sbByUserId;
}
