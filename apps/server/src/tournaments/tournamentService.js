import { 
  createTournament, findTournamentById, findTournaments, updateTournamentStatus,
  registerUserForTournament, withdrawUserFromTournament, removeUserFromTournament,
  getTournamentEntries, updateTournamentEntryScore, updateTournamentEntryTiebreak,
  incrementUserBye, addTournamentGame, getTournamentGames,
  createTournamentRound, updateTournamentRoundStatus, getTournamentRounds,
  addTournamentPairing, getTournamentPairings, findPairingByGameId,
  updateTournamentPairingResult
} from '../db/tournamentRepository.js';
import { globalRoomManager } from '../rooms/roomManager.js';
import { globalGameManager } from '../games/gameManager.js';
import { createGame, findGameById } from '../db/gameRepository.js';
import { recordGameEvent } from '../db/gameEventRepository.js';
import { withLock } from '../redis/redisLock.js';
import { redisKeys } from '../redis/redisKeys.js';
import { globalPubSubService } from '../pubsub/pubSubService.js';
import { SwissPairingEngine } from './swissPairingEngine.js';
import { ArenaPairingEngine } from './arenaPairingEngine.js';
import { calculateBuchholzTiebreaks } from './tiebreakService.js';
import { WS_EVENTS, ERROR_CODES } from '@chess/protocol';

export class TournamentService {
  /**
   * Create a new Arena or Swiss Tournament
   */
  async createTournament(params, creatorUser = null) {
    const id = `tourn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const organizerId = creatorUser?.id || params.organizerId || null;

    const tournament = await createTournament({
      id,
      name: params.name || (params.type === 'swiss' ? 'Swiss Championship' : 'Arena Championship'),
      description: params.description || '',
      organizerId,
      type: params.type || 'arena', // 'arena' | 'swiss'
      status: 'registration', // 'scheduled' | 'registration' | 'running' | 'finished' | 'cancelled'
      ratingType: params.ratingType || 'rapid',
      timeControl: params.timeControl || '10+0',
      durationMinutes: params.durationMinutes ? parseInt(params.durationMinutes, 10) : 60,
      rated: false, // Section 11: rated = false ALWAYS for tournaments
      maxPlayers: params.maxPlayers ? parseInt(params.maxPlayers, 10) : 64,
      minPlayers: params.minPlayers ? parseInt(params.minPlayers, 10) : 2,
      winPoints: params.winPoints !== undefined ? Number(params.winPoints) : 1.0,
      drawPoints: params.drawPoints !== undefined ? Number(params.drawPoints) : 0.5,
      lossPoints: params.lossPoints !== undefined ? Number(params.lossPoints) : 0.0,
      byePoints: params.byePoints !== undefined ? Number(params.byePoints) : 1.0,
      totalRounds: params.totalRounds ? parseInt(params.totalRounds, 10) : 3,
      currentRound: 0,
      startAt: params.startAt || new Date().toISOString()
    });

    await globalPubSubService.publishTournamentEvent(id, WS_EVENTS.TOURNAMENT_UPDATED, {
      tournament
    });

    await recordGameEvent({
      gameId: id,
      eventType: 'TOURNAMENT_CREATED',
      userId: organizerId,
      metadata: { name: tournament.name, type: tournament.type, timeControl: tournament.timeControl }
    }).catch(() => {});

    return tournament;
  }

  async listTournaments(options = {}) {
    return await findTournaments(options);
  }

  async getTournamentDetails(tournamentId) {
    const tournament = await findTournamentById(tournamentId);
    if (!tournament) return null;

    const entries = await getTournamentEntries(tournamentId);
    const games = await getTournamentGames(tournamentId);
    const rounds = await getTournamentRounds(tournamentId);
    const pairings = await getTournamentPairings(tournamentId);

    return {
      ...tournament,
      entries,
      games,
      rounds,
      pairings
    };
  }

  async getStandings(tournamentId) {
    const tournament = await findTournamentById(tournamentId);
    if (!tournament) return null;

    const entries = await getTournamentEntries(tournamentId);
    return {
      tournamentId,
      name: tournament.name,
      type: tournament.type,
      status: tournament.status,
      currentRound: tournament.currentRound,
      totalRounds: tournament.totalRounds,
      standings: entries
    };
  }

  /**
   * Concurrency-safe tournament registration protected by distributed lock.
   */
  async joinTournament(tournamentId, user) {
    const lockKey = redisKeys.tournamentLock(tournamentId);

    return await withLock(lockKey, 5000, async () => {
      const tournament = await findTournamentById(tournamentId);
      if (!tournament) {
        return { error: ERROR_CODES.TOURNAMENT_NOT_FOUND, message: 'Tournament not found.' };
      }

      if (tournament.status === 'running') {
        return { error: ERROR_CODES.TOURNAMENT_ALREADY_STARTED, message: 'Tournament is already running.' };
      }

      if (tournament.status === 'finished' || tournament.status === 'cancelled') {
        return { error: ERROR_CODES.TOURNAMENT_FINISHED, message: 'Tournament has already ended.' };
      }

      const entries = await getTournamentEntries(tournamentId);
      const activeEntries = entries.filter(e => !e.withdrawn);

      const already = entries.find(e => e.userId === user.id);
      if (already && !already.withdrawn) {
        return { error: ERROR_CODES.ALREADY_REGISTERED, message: 'User is already registered for this tournament.' };
      }

      if (activeEntries.length >= tournament.maxPlayers) {
        return { error: ERROR_CODES.TOURNAMENT_FULL, message: 'Tournament capacity reached.' };
      }

      const nextSeed = entries.length + 1;
      await registerUserForTournament(tournamentId, user.id, nextSeed);

      const updatedEntries = await getTournamentEntries(tournamentId);
      await globalPubSubService.publishTournamentEvent(tournamentId, WS_EVENTS.TOURNAMENT_UPDATED, {
        tournamentId,
        participantCount: updatedEntries.filter(e => !e.withdrawn).length,
        entries: updatedEntries
      });

      await recordGameEvent({
        gameId: tournamentId,
        eventType: 'TOURNAMENT_REGISTERED',
        userId: user.id,
        metadata: { seed: nextSeed }
      }).catch(() => {});

      return { success: true, tournamentId, userId: user.id };
    });
  }

  /**
   * Participant withdrawal / leave
   */
  async leaveTournament(tournamentId, userId) {
    const lockKey = redisKeys.tournamentLock(tournamentId);

    return await withLock(lockKey, 5000, async () => {
      const tournament = await findTournamentById(tournamentId);
      if (!tournament) {
        return { error: ERROR_CODES.TOURNAMENT_NOT_FOUND, message: 'Tournament not found.' };
      }

      if (tournament.status === 'finished' || tournament.status === 'cancelled') {
        return { error: ERROR_CODES.TOURNAMENT_FINISHED, message: 'Cannot leave an ended tournament.' };
      }

      if (tournament.status === 'registration' || tournament.status === 'scheduled') {
        // Pre-tournament: remove completely
        await removeUserFromTournament(tournamentId, userId);
      } else {
        // Tournament in progress: mark withdrawn
        await withdrawUserFromTournament(tournamentId, userId);
      }

      const updatedEntries = await getTournamentEntries(tournamentId);
      await globalPubSubService.publishTournamentEvent(tournamentId, WS_EVENTS.TOURNAMENT_UPDATED, {
        tournamentId,
        participantCount: updatedEntries.filter(e => !e.withdrawn).length,
        entries: updatedEntries
      });

      await recordGameEvent({
        gameId: tournamentId,
        eventType: 'TOURNAMENT_WITHDRAWN',
        userId,
        metadata: { status: tournament.status }
      }).catch(() => {});

      return { success: true };
    });
  }

  /**
   * Start a tournament (Organizer / Admin)
   */
  async startTournament(tournamentId, actingUser = null) {
    const lockKey = redisKeys.tournamentLock(tournamentId);

    return await withLock(lockKey, 8000, async () => {
      const tournament = await findTournamentById(tournamentId);
      if (!tournament) {
        return { error: ERROR_CODES.TOURNAMENT_NOT_FOUND, message: 'Tournament not found.' };
      }

      // Idempotency check
      if (tournament.status === 'running') {
        return { success: true, tournament, message: 'Tournament already running.' };
      }

      if (tournament.status === 'finished' || tournament.status === 'cancelled') {
        return { error: ERROR_CODES.INVALID_TOURNAMENT_STATE, message: `Cannot start a ${tournament.status} tournament.` };
      }

      const entries = await getTournamentEntries(tournamentId);
      const activeEntries = entries.filter(e => !e.withdrawn);

      if (activeEntries.length < (tournament.minPlayers || 2)) {
        return { 
          error: ERROR_CODES.INSUFFICIENT_PLAYERS, 
          message: `Insufficient players. Need at least ${tournament.minPlayers || 2} players, got ${activeEntries.length}.` 
        };
      }

      const now = new Date();
      const endAt = tournament.type === 'arena' 
        ? new Date(now.getTime() + (tournament.durationMinutes || 60) * 60 * 1000).toISOString()
        : null;

      await updateTournamentStatus(tournamentId, {
        status: 'running',
        startAt: now.toISOString(),
        endAt
      });

      tournament.status = 'running';
      tournament.startAt = now.toISOString();
      tournament.endAt = endAt;

      let initialPairings = [];
      if (tournament.type === 'swiss') {
        const roundRes = await this._executeSwissRound(tournament, 1, activeEntries, []);
        initialPairings = roundRes.pairings || [];
      } else if (tournament.type === 'arena') {
        initialPairings = await this._executeArenaPairings(tournament, activeEntries, [], new Set());
      }

      await globalPubSubService.publishTournamentEvent(tournamentId, WS_EVENTS.TOURNAMENT_STARTED, {
        tournamentId,
        tournament,
        initialPairings
      });

      await recordGameEvent({
        gameId: tournamentId,
        eventType: 'TOURNAMENT_STARTED',
        userId: actingUser?.id || tournament.organizerId,
        metadata: { activePlayers: activeEntries.length, type: tournament.type }
      }).catch(() => {});

      return { success: true, tournament, initialPairings };
    });
  }

  /**
   * Cancel tournament (Organizer / Admin)
   */
  async cancelTournament(tournamentId, actingUser = null) {
    const lockKey = redisKeys.tournamentLock(tournamentId);

    return await withLock(lockKey, 5000, async () => {
      const tournament = await findTournamentById(tournamentId);
      if (!tournament) {
        return { error: ERROR_CODES.TOURNAMENT_NOT_FOUND, message: 'Tournament not found.' };
      }

      if (tournament.status === 'cancelled') {
        return { success: true, message: 'Tournament already cancelled.' };
      }

      await updateTournamentStatus(tournamentId, {
        status: 'cancelled',
        endAt: new Date().toISOString()
      });

      await globalPubSubService.publishTournamentEvent(tournamentId, WS_EVENTS.TOURNAMENT_CANCELLED, {
        tournamentId
      });

      await recordGameEvent({
        gameId: tournamentId,
        eventType: 'TOURNAMENT_CANCELLED',
        userId: actingUser?.id,
        metadata: {}
      }).catch(() => {});

      return { success: true };
    });
  }

  /**
   * Complete tournament and calculate final standings with Buchholz tiebreaks
  /**
   * Complete tournament and calculate final standings with Buchholz tiebreaks
   */
  async finishTournament(tournamentId) {
    const lockKey = redisKeys.tournamentLock(tournamentId);
    return await withLock(lockKey, 5000, async () => {
      return await this._finishTournamentLocked(tournamentId);
    });
  }

  async _finishTournamentLocked(tournamentId) {
    const tournament = await findTournamentById(tournamentId);
    if (!tournament) return { error: ERROR_CODES.TOURNAMENT_NOT_FOUND };

    if (tournament.status === 'finished') {
      return { success: true, message: 'Tournament already finished.' };
    }

    // Final tiebreak recalculation
    const entries = await getTournamentEntries(tournamentId);
    const pairings = await getTournamentPairings(tournamentId);
    const tiebreaks = calculateBuchholzTiebreaks(entries, pairings);

    for (const [userId, tbScore] of tiebreaks.entries()) {
      await updateTournamentEntryTiebreak(tournamentId, userId, tbScore);
    }

    await updateTournamentStatus(tournamentId, {
      status: 'finished',
      endAt: new Date().toISOString()
    });

    const finalEntries = await getTournamentEntries(tournamentId);

    await globalPubSubService.publishTournamentEvent(tournamentId, WS_EVENTS.TOURNAMENT_FINISHED, {
      tournamentId,
      standings: finalEntries
    });

    await recordGameEvent({
      gameId: tournamentId,
      eventType: 'TOURNAMENT_COMPLETED',
      userId: null,
      metadata: { winner: finalEntries[0]?.userId, totalPlayers: finalEntries.length }
    }).catch(() => {});

    return { success: true, status: 'finished', standings: finalEntries };
  }

  /**
   * Start a specific Swiss round (used by round 1 and unit tests)
   */
  async startSwissRound(tournamentId, roundNumber = 1) {
    const lockKey = redisKeys.tournamentLock(tournamentId);

    return await withLock(lockKey, 8000, async () => {
      const tournament = await findTournamentById(tournamentId);
      if (!tournament) return { error: ERROR_CODES.TOURNAMENT_NOT_FOUND, message: 'Tournament not found.' };

      await updateTournamentStatus(tournamentId, { status: 'running', currentRound: roundNumber });
      tournament.status = 'running';
      tournament.currentRound = roundNumber;

      const entries = await getTournamentEntries(tournamentId);
      const activeEntries = entries.filter(e => !e.withdrawn);
      const allPastPairings = await getTournamentPairings(tournamentId);

      const res = await this._executeSwissRound(tournament, roundNumber, activeEntries, allPastPairings);
      
      return {
        tournamentId,
        roundNumber,
        pairings: res.pairings || [],
        bye: res.bye
      };
    });
  }

  /**
   * Advance Swiss tournament to the next round
   */
  async nextSwissRound(tournamentId, actingUser = null) {
    const lockKey = redisKeys.tournamentLock(tournamentId);

    return await withLock(lockKey, 8000, async () => {
      const tournament = await findTournamentById(tournamentId);
      if (!tournament) return { error: ERROR_CODES.TOURNAMENT_NOT_FOUND, message: 'Tournament not found.' };

      if (tournament.type !== 'swiss') {
        return { error: ERROR_CODES.INVALID_TOURNAMENT_STATE, message: 'Tournament is not Swiss format.' };
      }

      if (tournament.status !== 'running') {
        return { error: ERROR_CODES.TOURNAMENT_NOT_RUNNING, message: 'Tournament is not currently running.' };
      }

      // Check current round games
      const currentRound = tournament.currentRound;
      const pairings = await getTournamentPairings(tournamentId, currentRound);
      const pendingPairings = pairings.filter(p => !p.isBye && !p.result);

      if (pendingPairings.length > 0) {
        return { 
          error: ERROR_CODES.ROUND_IN_PROGRESS, 
          message: `Current round ${currentRound} has ${pendingPairings.length} unfinished game(s).` 
        };
      }

      if (currentRound >= tournament.totalRounds) {
        return await this._finishTournamentLocked(tournamentId);
      }

      const nextRoundNumber = currentRound + 1;
      const entries = await getTournamentEntries(tournamentId);
      const activeEntries = entries.filter(e => !e.withdrawn);
      const allPastPairings = await getTournamentPairings(tournamentId);

      const res = await this._executeSwissRound(tournament, nextRoundNumber, activeEntries, allPastPairings);
      return { success: true, roundNumber: nextRoundNumber, pairings: res.pairings, bye: res.bye };
    });
  }

  /**
   * Internal executor for Swiss round pairing and game creation
   */
  async _executeSwissRound(tournament, roundNumber, entries, pastPairings) {
    // Check if this round was already created (idempotency guard)
    const existingRounds = await getTournamentRounds(tournament.id);
    if (existingRounds.some(r => r.roundNumber === roundNumber)) {
      const existingPairings = await getTournamentPairings(tournament.id, roundNumber);
      return { pairings: existingPairings, bye: null };
    }

    // Recalculate tiebreaks before pairing to ensure deterministic seed / bracket sorting
    const tiebreaks = calculateBuchholzTiebreaks(entries, pastPairings);
    for (const [userId, tb] of tiebreaks.entries()) {
      await updateTournamentEntryTiebreak(tournament.id, userId, tb);
    }
    const refreshedEntries = await getTournamentEntries(tournament.id);
    const activeRefreshed = refreshedEntries.filter(e => !e.withdrawn);

    const { pairings, bye } = SwissPairingEngine.generatePairings({
      entries: activeRefreshed,
      previousPairings: pastPairings,
      roundNumber
    });

    await createTournamentRound(tournament.id, roundNumber);
    await updateTournamentStatus(tournament.id, { currentRound: roundNumber });

    const createdPairings = [];

    // Handle Bye
    if (bye) {
      await addTournamentPairing({
        tournamentId: tournament.id,
        roundId: roundNumber,
        roundNumber,
        whiteUserId: bye.whiteUserId,
        blackUserId: null,
        gameId: null,
        isBye: true,
        result: '1-0'
      });

      await incrementUserBye(tournament.id, bye.whiteUserId, tournament.byePoints);
      createdPairings.push({ ...bye, isBye: true, points: tournament.byePoints !== undefined ? tournament.byePoints : 1.0 });
    }

    // Handle Match Pairings
    for (const p of pairings) {
      const match = await this._createTournamentMatch(tournament, p.whiteUserId, p.blackUserId, roundNumber);
      await addTournamentPairing({
        tournamentId: tournament.id,
        roundId: roundNumber,
        roundNumber,
        whiteUserId: p.whiteUserId,
        blackUserId: p.blackUserId,
        gameId: match.gameId,
        isBye: false,
        result: null
      });

      createdPairings.push({
        ...p,
        gameId: match.gameId,
        roomCode: match.roomCode
      });
    }

    await globalPubSubService.publishTournamentEvent(tournament.id, WS_EVENTS.TOURNAMENT_ROUND_STARTED, {
      tournamentId: tournament.id,
      roundNumber,
      pairings: createdPairings
    });

    return { pairings: createdPairings, bye };
  }

  /**
   * Process Arena continuous matchmaking
   */
  async processArenaPairings(tournamentId) {
    const lockKey = redisKeys.tournamentLock(tournamentId);

    return await withLock(lockKey, 5000, async () => {
      const tournament = await findTournamentById(tournamentId);
      if (!tournament || tournament.status !== 'running') return [];

      // Check if arena duration has expired
      if (tournament.endAt && Date.now() >= new Date(tournament.endAt).getTime()) {
        const games = await getTournamentGames(tournamentId);
        const activeGames = games.filter(g => g.status === 'ACTIVE' || g.status === 'WAITING');
        if (activeGames.length === 0) {
          await this._finishTournamentLocked(tournamentId);
        }
        return [];
      }

      const entries = await getTournamentEntries(tournamentId);
      const activeEntries = entries.filter(e => !e.withdrawn);
      const pastPairings = await getTournamentPairings(tournamentId);
      const allGames = await getTournamentGames(tournamentId);

      const activePlayerIds = new Set();
      for (const g of allGames) {
        if (g.status === 'ACTIVE' || g.status === 'WAITING') {
          if (g.whitePlayerId) activePlayerIds.add(g.whitePlayerId);
          if (g.blackPlayerId) activePlayerIds.add(g.blackPlayerId);
        }
      }

      return await this._executeArenaPairings(tournament, activeEntries, pastPairings, activePlayerIds);
    });
  }

  async _executeArenaPairings(tournament, entries, pastPairings, activePlayerIds) {
    const pairings = ArenaPairingEngine.generatePairings({
      entries,
      activePlayerIds,
      previousPairings: pastPairings
    });

    const createdGames = [];
    for (const p of pairings) {
      const match = await this._createTournamentMatch(tournament, p.whiteUserId, p.blackUserId, 1);
      await addTournamentPairing({
        tournamentId: tournament.id,
        roundId: 1,
        roundNumber: 1,
        whiteUserId: p.whiteUserId,
        blackUserId: p.blackUserId,
        gameId: match.gameId,
        isBye: false,
        result: null
      });

      createdGames.push(match);

      await globalPubSubService.publishTournamentEvent(tournament.id, WS_EVENTS.TOURNAMENT_PAIRING_CREATED, {
        tournamentId: tournament.id,
        pairing: {
          whiteUserId: p.whiteUserId,
          blackUserId: p.blackUserId,
          gameId: match.gameId,
          roomCode: match.roomCode
        }
      });
    }

    return createdGames;
  }

  /**
   * Authoritative GameSession match creator for tournament games.
   * Sets rated = false, initializes clocks, and links to TiDB.
   */
  async _createTournamentMatch(tournament, whiteId, blackId, roundNumber) {
    const room = globalRoomManager.createRoom({
      hostUser: { id: whiteId, username: 'White' },
      timeControl: tournament.timeControl,
      colorPreference: 'w'
    });

    room.whitePlayerId = whiteId;
    room.blackPlayerId = blackId;
    room.status = 'ACTIVE';
    room.rated = false; // Section 11: ALWAYS unrated Elo for tournament games
    room.tournamentId = tournament.id;

    globalRoomManager.joinRoom(room.roomCode, { id: blackId, username: 'Black' });

    const session = globalGameManager.getOrCreateSession(room);
    session.start();

    await createGame({
      id: room.id,
      roomCode: room.roomCode,
      whitePlayerId: whiteId,
      blackPlayerId: blackId,
      mode: 'ONLINE',
      status: 'ACTIVE',
      timeControl: tournament.timeControl,
      initialFen: session.game.getFen(),
      rated: false,
      tournamentId: tournament.id
    });

    await addTournamentGame(tournament.id, room.id, roundNumber);

    return {
      gameId: room.id,
      roomCode: room.roomCode,
      whitePlayerId: whiteId,
      blackPlayerId: blackId,
      roundNumber
    };
  }

  /**
   * Idempotent game conclusion hook called from gameService.
   */
  async handleTournamentGameEnd(tournamentId, gameId, result) {
    const lockKey = redisKeys.tournamentLock(tournamentId);

    return await withLock(lockKey, 5000, async () => {
      const tournament = await findTournamentById(tournamentId);
      if (!tournament) return;

      const pairing = await findPairingByGameId(tournamentId, gameId);
      // Idempotency: if pairing is already marked with a result, DO NOT score again!
      if (!pairing || pairing.result) {
        console.log(`[TournamentService] Game ${gameId} already scored (${pairing?.result}). Skipping duplicate.`);
        return;
      }

      await updateTournamentPairingResult(tournamentId, gameId, result);

      const game = await findGameById(gameId);
      if (!game || !game.whitePlayerId || !game.blackPlayerId) return;

      let whiteOutcome = 'draw';
      let blackOutcome = 'draw';
      let whitePoints = tournament.drawPoints;
      let blackPoints = tournament.drawPoints;

      if (result === '1-0') {
        whiteOutcome = 'win';
        blackOutcome = 'loss';
        whitePoints = tournament.winPoints;
        blackPoints = tournament.lossPoints;
      } else if (result === '0-1') {
        whiteOutcome = 'loss';
        blackOutcome = 'win';
        whitePoints = tournament.lossPoints;
        blackPoints = tournament.winPoints;
      }

      await updateTournamentEntryScore(tournamentId, game.whitePlayerId, whitePoints, whiteOutcome);
      await updateTournamentEntryScore(tournamentId, game.blackPlayerId, blackPoints, blackOutcome);

      // Recalculate Buchholz tiebreaks
      const entries = await getTournamentEntries(tournamentId);
      const pairings = await getTournamentPairings(tournamentId);
      const tiebreaks = calculateBuchholzTiebreaks(entries, pairings);

      for (const [userId, tb] of tiebreaks.entries()) {
        await updateTournamentEntryTiebreak(tournamentId, userId, tb);
      }

      const updatedEntries = await getTournamentEntries(tournamentId);
      await globalPubSubService.publishTournamentEvent(tournamentId, WS_EVENTS.TOURNAMENT_STANDINGS_UPDATED, {
        tournamentId,
        standings: updatedEntries
      });

      // Format-specific lifecycle transitions
      if (tournament.type === 'swiss') {
        const roundPairings = await getTournamentPairings(tournamentId, tournament.currentRound);
        const allCompleted = roundPairings.every(p => p.isBye || Boolean(p.result));

        if (allCompleted && roundPairings.length > 0) {
          await updateTournamentRoundStatus(tournamentId, tournament.currentRound, 'completed');
          await globalPubSubService.publishTournamentEvent(tournamentId, WS_EVENTS.TOURNAMENT_ROUND_COMPLETED, {
            tournamentId,
            roundNumber: tournament.currentRound
          });

          if (tournament.currentRound >= tournament.totalRounds) {
            await this._finishTournamentLocked(tournamentId);
          }
        }
      } else if (tournament.type === 'arena') {
        // In arena, check if duration expired
        if (tournament.endAt && Date.now() >= new Date(tournament.endAt).getTime()) {
          const games = await getTournamentGames(tournamentId);
          const activeGames = games.filter(g => g.status === 'ACTIVE' || g.status === 'WAITING');
          if (activeGames.length === 0) {
            await this._finishTournamentLocked(tournamentId);
          }
        } else {
          // Trigger opportunistic next pairing for freed up players
          this.processArenaPairings(tournamentId).catch(err => {
            console.warn('[TournamentService] Auto arena pairing error:', err.message);
          });
        }
      }
    });
  }
}

export const globalTournamentService = new TournamentService();
