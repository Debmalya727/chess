/**
 * Arena Pairing Engine
 * 
 * Server-authoritative continuous matchmaking for Arena tournaments:
 * 1. Filter active (non-withdrawn) participants.
 * 2. Exclude participants who are currently playing in an active tournament game.
 * 3. Match available players prioritizing:
 *    - Waiting time / queue order.
 *    - Score proximity.
 *    - Rematch prevention: avoid pairing players who played each other in their most recent game
 *      when other opponents are available.
 * 4. Alternates colors based on each player's recent game history.
 * 5. Returns safe, validated pairs ready for GameSession creation.
 */

export class ArenaPairingEngine {
  /**
   * Generates continuous pairings for available players in an Arena tournament.
   * 
   * @param {Object} params
   * @param {Array<Object>} params.entries - All tournament participants
   * @param {Set<string>|Array<string>} params.activePlayerIds - IDs of players currently in active games
   * @param {Array<Object>} params.previousPairings - Historical pairings in this arena
   * @returns {Array<{whiteUserId: string, blackUserId: string}>}
   */
  static generatePairings({ entries, activePlayerIds = new Set(), previousPairings = [] }) {
    const activeSet = activePlayerIds instanceof Set ? activePlayerIds : new Set(activePlayerIds);

    // 1. Filter available participants (not withdrawn and not currently playing)
    const availablePlayers = entries.filter(e => !e.withdrawn && !activeSet.has(e.userId));
    if (availablePlayers.length < 2) {
      return [];
    }

    // Extract recent opponent and color for each player
    const history = this.analyzeRecentHistory(availablePlayers, previousPairings);

    // Sort available players by score descending, with deterministic tiebreak on userId
    const sortedQueue = [...availablePlayers].sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return a.userId.localeCompare(b.userId);
    });

    const paired = new Set();
    const results = [];

    for (let i = 0; i < sortedQueue.length; i++) {
      const p1 = sortedQueue[i];
      if (paired.has(p1.userId)) continue;

      const p1Hist = history.get(p1.userId);

      // Find best opponent for p1 among remaining unpaired players
      let bestMatch = null;
      let fallbackMatch = null;

      for (let j = i + 1; j < sortedQueue.length; j++) {
        const p2 = sortedQueue[j];
        if (paired.has(p2.userId)) continue;

        const isImmediateRematch = p1Hist?.lastOpponent === p2.userId;

        if (!isImmediateRematch) {
          bestMatch = p2;
          break;
        } else if (!fallbackMatch) {
          fallbackMatch = p2;
        }
      }

      // If no non-rematch opponent is found, and only the fallback remains, use fallback if there are no other options
      const chosenOpponent = bestMatch || fallbackMatch;

      if (chosenOpponent) {
        paired.add(p1.userId);
        paired.add(chosenOpponent.userId);

        const p2Hist = history.get(chosenOpponent.userId);
        const { white, black } = this.decideColors(p1, chosenOpponent, p1Hist, p2Hist);

        results.push({
          whiteUserId: white.userId,
          blackUserId: black.userId
        });
      }
    }

    this.validatePairings(results);
    return results;
  }

  /**
   * Analyzes recent pairings to find last opponent and last color.
   */
  static analyzeRecentHistory(players, previousPairings) {
    const history = new Map();
    for (const p of players) {
      history.set(p.userId, {
        lastOpponent: null,
        lastColor: null,
        whiteCount: 0,
        blackCount: 0
      });
    }

    for (const m of previousPairings) {
      if (m.isBye || !m.blackUserId) continue;

      const w = history.get(m.whiteUserId);
      const b = history.get(m.blackUserId);

      if (w) {
        w.lastOpponent = m.blackUserId;
        w.lastColor = 'white';
        w.whiteCount++;
      }
      if (b) {
        b.lastOpponent = m.whiteUserId;
        b.lastColor = 'black';
        b.blackCount++;
      }
    }

    return history;
  }

  /**
   * Determines color allocation:
   * Favors giving White to whoever played Black last, or has fewer White games.
   */
  static decideColors(p1, p2, h1, h2) {
    const d1 = (h1?.whiteCount || 0) - (h1?.blackCount || 0);
    const d2 = (h2?.whiteCount || 0) - (h2?.blackCount || 0);

    if (d1 < d2) return { white: p1, black: p2 };
    if (d2 < d1) return { white: p2, black: p1 };

    if (h1?.lastColor === 'black' && h2?.lastColor !== 'black') return { white: p1, black: p2 };
    if (h2?.lastColor === 'black' && h1?.lastColor !== 'black') return { white: p2, black: p1 };

    return { white: p1, black: p2 };
  }

  /**
   * Ensures no self-pairing and no duplicate player assignments.
   */
  static validatePairings(pairings) {
    const seen = new Set();
    for (const p of pairings) {
      if (p.whiteUserId === p.blackUserId) {
        throw new Error(`Self-pairing detected: ${p.whiteUserId}`);
      }
      if (seen.has(p.whiteUserId)) {
        throw new Error(`Duplicate pairing for player: ${p.whiteUserId}`);
      }
      seen.add(p.whiteUserId);

      if (seen.has(p.blackUserId)) {
        throw new Error(`Duplicate pairing for player: ${p.blackUserId}`);
      }
      seen.add(p.blackUserId);
    }
  }
}
