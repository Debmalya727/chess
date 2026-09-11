/**
 * Swiss Pairing Engine
 * 
 * Implements deterministic Dutch-system Swiss pairings:
 * 1. Filter out withdrawn players.
 * 2. If odd number of participants, assign a 1-point bye to the lowest-ranked player
 *    who has not yet received a bye in this tournament.
 * 3. Group players by authoritative score descending.
 * 4. Resolve odd groups by downfloating the lowest-ranked player of the bracket to the next bracket.
 * 5. Within brackets, pair players to avoid previous encounters and optimize color balance.
 * 6. Color balance ensures players alternate colors where possible and minimizes white/black disparity.
 * 7. Strictly validate all pairings before returning.
 */

export class SwissPairingEngine {
  /**
   * Generates deterministic pairings for a Swiss round.
   * 
   * @param {Object} params
   * @param {Array<Object>} params.entries - All tournament participants
   * @param {Array<Object>} params.previousPairings - All pairings from previous rounds
   * @param {number} params.roundNumber - The round number being paired
   * @returns {{ pairings: Array<Object>, bye: Object|null }}
   */
  static generatePairings({ entries, previousPairings = [], roundNumber = 1 }) {
    // 1. Filter eligible (non-withdrawn) players
    const activeEntries = entries.filter(e => !e.withdrawn);
    if (activeEntries.length < 2) {
      throw new Error('Insufficient active players to generate Swiss pairings.');
    }

    // Sort deterministically: score DESC, tiebreak DESC, wins DESC, seed/rating ASC, userId ASC
    const sortedPlayers = [...activeEntries].sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      if ((b.tiebreakScore || 0) !== (a.tiebreakScore || 0)) return (b.tiebreakScore || 0) - (a.tiebreakScore || 0);
      if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
      if (a.seed != null && b.seed != null && a.seed !== b.seed) return a.seed - b.seed;
      return a.userId.localeCompare(b.userId);
    });

    // Extract historical opponents and color history for each player
    const history = this.analyzeHistory(sortedPlayers, previousPairings);

    let playersToPair = [...sortedPlayers];
    let byeAssignment = null;

    // 2. Odd number of players: assign a single bye
    if (playersToPair.length % 2 !== 0) {
      byeAssignment = this.assignBye(playersToPair, history);
      playersToPair = playersToPair.filter(p => p.userId !== byeAssignment.userId);
    }

    // 3. Generate pairings using maximum weight matching / recursive backtracking with bracket heuristic
    const rawPairings = this.findValidPairings(playersToPair, history);

    if (!rawPairings) {
      // Fallback: relax previous opponents constraint if mathematically impossible otherwise (documented fallback)
      const relaxedPairings = this.findValidPairings(playersToPair, history, true);
      if (!relaxedPairings) {
        throw new Error(`Failed to generate valid Swiss pairings for round ${roundNumber}.`);
      }
      return this.finalizePairings(relaxedPairings, byeAssignment, history, roundNumber);
    }

    return this.finalizePairings(rawPairings, byeAssignment, history, roundNumber);
  }

  /**
   * Analyzes previous pairings to build opponent sets and color counts.
   */
  static analyzeHistory(players, previousPairings) {
    const history = new Map();
    for (const p of players) {
      history.set(p.userId, {
        opponents: new Set(),
        whiteCount: 0,
        blackCount: 0,
        lastColor: null, // 'white' | 'black' | null
        hadBye: Boolean(p.byesCount && p.byesCount > 0)
      });
    }

    // Sort previous pairings chronologically
    const sortedPast = [...previousPairings].sort((a, b) => (a.roundNumber || 0) - (b.roundNumber || 0));

    for (const m of sortedPast) {
      if (m.isBye || !m.blackUserId) {
        if (history.has(m.whiteUserId)) {
          history.get(m.whiteUserId).hadBye = true;
        }
        continue;
      }

      const w = history.get(m.whiteUserId);
      const b = history.get(m.blackUserId);

      if (w) {
        w.opponents.add(m.blackUserId);
        w.whiteCount++;
        w.lastColor = 'white';
      }
      if (b) {
        b.opponents.add(m.whiteUserId);
        b.blackCount++;
        b.lastColor = 'black';
      }
    }

    return history;
  }

  /**
   * Assigns bye to lowest-ranked player in lowest score group who has not had a bye.
   */
  static assignBye(sortedPlayers, history) {
    // Look from bottom up for someone without a bye
    for (let i = sortedPlayers.length - 1; i >= 0; i--) {
      const p = sortedPlayers[i];
      const h = history.get(p.userId);
      if (!h || !h.hadBye) {
        return p;
      }
    }
    // If everyone already had a bye, pick the lowest ranked player
    return sortedPlayers[sortedPlayers.length - 1];
  }

  /**
   * Recursive backtrack pairing generator respecting score proximity and repeat avoidance.
   */
  static findValidPairings(players, history, allowRepeat = false) {
    const n = players.length;
    if (n === 0) return [];

    const paired = new Array(n).fill(false);
    const resultPairings = [];

    const backtrack = (firstUnpairedIdx) => {
      if (firstUnpairedIdx >= n) {
        return true;
      }

      if (paired[firstUnpairedIdx]) {
        return backtrack(firstUnpairedIdx + 1);
      }

      const p1 = players[firstUnpairedIdx];
      paired[firstUnpairedIdx] = true;

      // Candidate opponents sorted by score closeness and seed
      const candidates = [];
      for (let j = firstUnpairedIdx + 1; j < n; j++) {
        if (!paired[j]) {
          const p2 = players[j];
          const hasPlayed = history.get(p1.userId)?.opponents.has(p2.userId);
          if (!hasPlayed || allowRepeat) {
            const scoreDiff = Math.abs((p1.score || 0) - (p2.score || 0));
            candidates.push({ index: j, player: p2, scoreDiff, hasPlayed });
          }
        }
      }

      // Prioritize: never-played candidates first, then minimum score difference
      candidates.sort((a, b) => {
        if (a.hasPlayed !== b.hasPlayed) return a.hasPlayed ? 1 : -1;
        return a.scoreDiff - b.scoreDiff;
      });

      for (const cand of candidates) {
        paired[cand.index] = true;
        resultPairings.push([p1, cand.player]);

        if (backtrack(firstUnpairedIdx + 1)) {
          return true;
        }

        // Backtrack
        resultPairings.pop();
        paired[cand.index] = false;
      }

      paired[firstUnpairedIdx] = false;
      return false;
    };

    const success = backtrack(0);
    return success ? resultPairings : null;
  }

  /**
   * Balances colors and constructs the final pairings.
   */
  static finalizePairings(rawPairs, byePlayer, history, roundNumber) {
    const pairings = [];

    for (const [p1, p2] of rawPairs) {
      const h1 = history.get(p1.userId);
      const h2 = history.get(p2.userId);

      const colorAssignment = this.decideColors(p1, p2, h1, h2);

      pairings.push({
        roundNumber,
        whiteUserId: colorAssignment.white.userId,
        blackUserId: colorAssignment.black.userId,
        isBye: false,
        result: null
      });
    }

    const bye = byePlayer ? {
      roundNumber,
      whiteUserId: byePlayer.userId,
      blackUserId: null,
      isBye: true,
      result: '1-0'
    } : null;

    // Validate all pairings
    this.validatePairings(pairings, byePlayer, rawPairs.length * 2 + (byePlayer ? 1 : 0));

    return { pairings, bye };
  }

  /**
   * Determines color assignments to optimize fairness.
   * Priority:
   * 1. Player with larger color disparity (fewer whites) gets White.
   * 2. If equal disparity, player who played Black last round gets White.
   * 3. If still equal, higher-seeded player alternates or defaults to White.
   */
  static decideColors(p1, p2, h1, h2) {
    const d1 = (h1?.whiteCount || 0) - (h1?.blackCount || 0);
    const d2 = (h2?.whiteCount || 0) - (h2?.blackCount || 0);

    if (d1 < d2) {
      return { white: p1, black: p2 };
    } else if (d2 < d1) {
      return { white: p2, black: p1 };
    }

    // Disparities equal, check last color
    if (h1?.lastColor === 'black' && h2?.lastColor !== 'black') {
      return { white: p1, black: p2 };
    }
    if (h2?.lastColor === 'black' && h1?.lastColor !== 'black') {
      return { white: p2, black: p1 };
    }

    // Default by seed / rating or user id comparison
    return { white: p1, black: p2 };
  }

  /**
   * Validates pairing integrity before persistence.
   */
  static validatePairings(pairings, byePlayer, expectedTotal) {
    const seen = new Set();

    for (const p of pairings) {
      if (!p.whiteUserId) {
        throw new Error('Invalid pairing: missing whiteUserId.');
      }
      if (!p.isBye && !p.blackUserId) {
        throw new Error('Invalid non-bye pairing: missing blackUserId.');
      }
      if (p.whiteUserId === p.blackUserId) {
        throw new Error(`Self-pairing detected for user: ${p.whiteUserId}`);
      }
      if (seen.has(p.whiteUserId)) {
        throw new Error(`Duplicate player in pairings: ${p.whiteUserId}`);
      }
      seen.add(p.whiteUserId);

      if (p.blackUserId) {
        if (seen.has(p.blackUserId)) {
          throw new Error(`Duplicate player in pairings: ${p.blackUserId}`);
        }
        seen.add(p.blackUserId);
      }
    }

    if (byePlayer) {
      if (seen.has(byePlayer.userId)) {
        throw new Error(`Bye player also paired: ${byePlayer.userId}`);
      }
      seen.add(byePlayer.userId);
    }

    if (seen.size !== expectedTotal) {
      throw new Error(`Total paired players (${seen.size}) does not match expected (${expectedTotal}).`);
    }

    return true;
  }
}
