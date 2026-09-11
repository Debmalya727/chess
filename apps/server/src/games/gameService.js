import { ChessGame } from '@chess/core';
import { ClockService } from '../clock/clockService.js';
import { createMove } from '../db/moveRepository.js';
import { updateGameStatus } from '../db/gameRepository.js';
import { applyGameRatings } from '../ratings/ratingService.js';
import { getPool, isUsingMysql } from '../db/index.js';
import { recordGameEvent } from '../db/gameEventRepository.js';
import { globalRoomManager } from '../rooms/roomManager.js';

export async function getActiveGameForUser(userId) {
  if (!userId) return null;
  const rooms = Array.from(globalRoomManager.roomsById.values());
  const activeRoom = rooms.find(r => 
    (r.whitePlayerId === userId || r.blackPlayerId === userId) &&
    (r.status === 'ACTIVE' || r.status === 'READY')
  );
  if (activeRoom) return activeRoom;

  try {
    const { findActiveGameByUserId } = await import('../db/gameRepository.js');
    const dbGame = await findActiveGameByUserId(userId);
    if (dbGame) {
      return globalRoomManager.rehydrateRoomFromDb(dbGame);
    }
  } catch {}

  return null;
}

export class ActiveGameSession {
  constructor(room) {
    this.room = room;
    this.game = new ChessGame(room.initialFen || undefined);
    this.clock = new ClockService(room.timeControl || '10+0');
    this.processedClientMoveIds = new Map(); // clientMoveId -> moveResult
    this.drawOfferUser = null; // userId who currently offered a draw
    this.isEnded = false;
    this.result = null; // "1-0" | "0-1" | "1/2-1/2"
    this.termination = null; // "checkmate" | "stalemate" | "insufficient_material" | "threefold_repetition" | "fifty_move_rule" | "agreement" | "resignation" | "timeout" | "aborted"
    this.stateVersion = 1;
    this.ratingChanges = null;
  }

  start() {
    this.clock.startTurn('w');
    recordGameEvent({
      gameId: this.room.id,
      eventType: 'GAME_STARTED',
      userId: this.room.whitePlayerId
    }).catch(err => console.warn('[GameEvent] Error recording GAME_STARTED:', err.message));
  }

  async processMove({ user, from, to, promotion, clientMoveId, expectedStateVersion }) {
    if (this.isEnded) {
      return { error: 'GAME_FINISHED', message: 'Game has already ended.' };
    }

    // 1. Check stale state version
    if (expectedStateVersion !== undefined && expectedStateVersion !== null && expectedStateVersion < this.stateVersion) {
      return { error: 'STALE_STATE', message: 'Stale state version.', stateVersion: this.stateVersion };
    }

    // 2. Idempotency Check
    if (clientMoveId && this.processedClientMoveIds.has(clientMoveId)) {
      const cached = this.processedClientMoveIds.get(clientMoveId);
      return { 
        success: true, 
        isDuplicate: true, 
        ...cached
      };
    }

    // 3. Turn Validation
    const turn = this.game.getTurn();
    const expectedUserId = turn === 'w' ? this.room.whitePlayerId : this.room.blackPlayerId;

    if (user.id !== expectedUserId) {
      return { error: 'NOT_YOUR_TURN', message: 'It is not your turn.' };
    }

    // 4. Authoritative Clock Check
    const clockState = this.clock.getTimes();
    if (clockState.isTimeout) {
      this._endGame(
        clockState.timeoutColor === 'w' ? '0-1' : '1-0',
        'timeout'
      );
      return { error: 'EXPIRED_TIME', message: 'Time has expired.', clockState, stateVersion: this.stateVersion };
    }

    // 5. Validate and apply move via @chess/core
    const moveResult = this.game.move(from, to, promotion || null);

    if (!moveResult) {
      return { error: 'INVALID_MOVE', message: 'Illegal move.' };
    }

    // 6. Persist Ply to Database (Awaited with transaction rollback safety)
    try {
      console.log('[ProcessMove] Storing move in DB for ply:', moveResult.ply);
      await createMove({
        gameId: this.room.id,
        ply: moveResult.ply,
        playerId: user.id,
        from: moveResult.from,
        to: moveResult.to,
        promotion: moveResult.promotion,
        san: moveResult.san,
        fenAfter: moveResult.fenAfter
      });
      console.log('[ProcessMove] Move stored, recording game event...');

      // Record authoritative game event
      await recordGameEvent({
        gameId: this.room.id,
        eventType: 'MOVE_PLAYED',
        userId: user.id,
        ply: moveResult.ply,
        metadata: { san: moveResult.san, from, to }
      });
      console.log('[ProcessMove] Game event recorded successfully');
    } catch (dbErr) {
      console.error('[ProcessMove] Error during DB persistence:', dbErr);
      // Roll back in-memory move on persistence failure
      this.game.undo();
      throw dbErr;
    }

    // 7. Increment stateVersion ONLY after successful persistence
    this.stateVersion++;

    // 8. Update Clock & Turn
    const nextTurn = this.game.getTurn();
    const updatedClock = this.clock.recordMove(nextTurn);

    // 9. Check Game Termination from Chess Engine State
    const status = this.game.getStatus();
    if (status.isCheckmate) {
      this._endGame(status.winner === 'w' ? '1-0' : '0-1', 'checkmate');
    } else if (status.isStalemate) {
      this._endGame('1/2-1/2', 'stalemate');
    } else if (status.isDraw) {
      let term = 'agreement';
      if (status.isThreefoldRepetition) term = 'threefold_repetition';
      else if (status.isInsufficientMaterial) term = 'insufficient_material';
      else if (status.isFiftyMoveRule) term = 'fifty_move_rule';
      this._endGame('1/2-1/2', term);
    }

    const fullResult = {
      success: true,
      moveResult,
      fen: this.game.getFen(),
      history: this.game.getHistory(),
      status,
      clockState: updatedClock,
      stateVersion: this.stateVersion,
      isEnded: this.isEnded,
      result: this.result,
      termination: this.termination,
      ratingChanges: this.ratingChanges
    };

    // Cache moveResult for idempotency
    if (clientMoveId) {
      this.processedClientMoveIds.set(clientMoveId, fullResult);
    }

    return fullResult;
  }

  offerDraw(user) {
    if (this.isEnded) return { error: 'GAME_FINISHED', message: 'Game has already ended.' };
    this.drawOfferUser = user.id;
    recordGameEvent({
      gameId: this.room.id,
      eventType: 'DRAW_OFFERED',
      userId: user.id
    }).catch(err => console.warn('[GameEvent] Error recording DRAW_OFFERED:', err.message));
    return { success: true, stateVersion: this.stateVersion };
  }

  respondDraw(user, accept) {
    if (this.isEnded) return { error: 'GAME_FINISHED', message: 'Game has already ended.' };
    if (!this.drawOfferUser || this.drawOfferUser === user.id) {
      return { error: 'INVALID_DRAW_RESPONSE', message: 'No active draw offer from opponent.' };
    }

    this.drawOfferUser = null;
    recordGameEvent({
      gameId: this.room.id,
      eventType: accept ? 'DRAW_ACCEPTED' : 'DRAW_DECLINED',
      userId: user.id
    }).catch(err => console.warn('[GameEvent] Error recording DRAW_RESPONSE:', err.message));

    if (accept) {
      this.stateVersion++;
      this._endGame('1/2-1/2', 'agreement');
      return { 
        success: true, 
        accepted: true, 
        stateVersion: this.stateVersion,
        result: this.result,
        termination: this.termination,
        ratingChanges: this.ratingChanges
      };
    }
    return { success: true, accepted: false, stateVersion: this.stateVersion };
  }

  resign(user) {
    if (this.isEnded) return { error: 'GAME_FINISHED', message: 'Game has already ended.' };
    this.stateVersion++;
    recordGameEvent({
      gameId: this.room.id,
      eventType: 'RESIGNED',
      userId: user.id
    }).catch(err => console.warn('[GameEvent] Error recording RESIGNED:', err.message));

    const winnerResult = user.id === this.room.whitePlayerId ? '0-1' : '1-0';
    this._endGame(winnerResult, 'resignation');
    return { 
      success: true, 
      result: this.result, 
      termination: this.termination,
      stateVersion: this.stateVersion,
      ratingChanges: this.ratingChanges
    };
  }

  _endGame(result, termination) {
    if (this.isEnded) return; // Ensure single completion execution
    this.isEnded = true;
    this.result = result;
    this.termination = termination;
    this.clock.stop();

    // Mark room as finished so matchmaking guard allows players to re-queue
    if (this.room) {
      this.room.status = 'FINISHED';
    }

    // Asynchronously trigger fair-play analysis
    import('../fairplay/fairPlayService.js').then(({ globalFairPlayService }) => {
      globalFairPlayService.analyzeGame(this.room.id).catch(err => console.warn('[FairPlay] Error analyzing game:', err.message));
    }).catch(() => {});

    // Update presence: players no longer in game
    import('../presence/presenceService.js').then(({ globalPresenceService }) => {
      if (this.room.whitePlayerId) globalPresenceService.setUserPlaying(this.room.whitePlayerId, false);
      if (this.room.blackPlayerId) globalPresenceService.setUserPlaying(this.room.blackPlayerId, false);
    }).catch(() => {});

    // Asynchronously calculate ratings & update database inside transaction
    (async () => {
      let connection = null;
      try {
        if (isUsingMysql()) {
          const pool = getPool();
          connection = await pool.getConnection();
          await connection.beginTransaction();

          // Concurrency guard: check if game was already marked FINISHED by another instance/thread
          const [rows] = await connection.query('SELECT status FROM games WHERE id = ? FOR UPDATE', [this.room.id]);
          if (rows.length > 0 && rows[0].status === 'FINISHED') {
            console.log('[EndGame] Game already finalized in TiDB, skipping duplicate finish.');
            await connection.rollback();
            return;
          }
        }

        const isRatedGame = this.room.rated !== false;

        if (isRatedGame) {
          const ratingResult = await applyGameRatings({
            gameId: this.room.id,
            timeControl: this.room.timeControl || '10+0',
            whiteUserId: this.room.whitePlayerId,
            blackUserId: this.room.blackPlayerId,
            result: result,
            connection
          });
          this.ratingChanges = ratingResult;
        }

        const pgnText = this.game.getPGN({
          Event: isRatedGame ? 'Online Rated Game' : 'Tournament Game (Unrated)',
          Site: 'Chess Platform',
          White: this.room.whiteUsername || this.room.whitePlayerId || 'White',
          Black: this.room.blackUsername || this.room.blackPlayerId || 'Black',
          Result: result,
          TimeControl: this.room.timeControl || '10+0',
          Termination: termination
        });

        await updateGameStatus(this.room.id, {
          status: 'FINISHED',
          finalFen: this.game.getFen(),
          pgn: pgnText,
          result,
          termination,
          endedAt: new Date().toISOString()
        }, connection);

        // Record authoritative GAME_FINISHED event atomically
        await recordGameEvent({
          gameId: this.room.id,
          eventType: 'GAME_FINISHED',
          metadata: { result, termination },
          connection
        });

        if (connection) {
          await connection.commit();
        }

        // Trigger Tournament hook if applicable
        if (this.room.tournamentId) {
          import('../tournaments/tournamentService.js').then(({ globalTournamentService }) => {
            globalTournamentService.handleTournamentGameEnd(this.room.tournamentId, this.room.id, result)
              .catch(err => console.warn('[GameService] Tournament hook error:', err.message));
          });
        }
      } catch (err) {
        if (connection) {
          try { await connection.rollback(); } catch (rbErr) {}
        }
        console.error('[GameService] Error during _endGame transaction:', err);
      } finally {
        if (connection) {
          connection.release();
        }
      }
    })();
  }
}
