import { getPool, isUsingMysql, inMemoryDb } from './index.js';

function getExecutor(conn) {
  return conn || getPool();
}

const formatSqlDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof d === 'string' && d.includes('T')) return d.slice(0, 19).replace('T', ' ');
  return d;
};

export async function createTournament(data, conn = null) {
  const tournament = {
    id: data.id || `tourn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    name: data.name,
    description: data.description || null,
    organizerId: data.organizerId || null,
    type: data.type || 'arena', // 'arena' | 'swiss'
    status: data.status || 'registration', // 'scheduled' | 'registration' | 'running' | 'finished' | 'cancelled'
    ratingType: data.ratingType || 'rapid',
    timeControl: data.timeControl || '10+0',
    durationMinutes: data.durationMinutes !== undefined ? parseInt(data.durationMinutes, 10) : 60,
    rated: data.rated !== undefined ? Boolean(data.rated) : false,
    maxPlayers: data.maxPlayers !== undefined ? parseInt(data.maxPlayers, 10) : 64,
    minPlayers: data.minPlayers !== undefined ? parseInt(data.minPlayers, 10) : 2,
    winPoints: data.winPoints !== undefined ? Number(data.winPoints) : 1.0,
    drawPoints: data.drawPoints !== undefined ? Number(data.drawPoints) : 0.5,
    lossPoints: data.lossPoints !== undefined ? Number(data.lossPoints) : 0.0,
    byePoints: data.byePoints !== undefined ? Number(data.byePoints) : 1.0,
    totalRounds: data.totalRounds !== undefined ? parseInt(data.totalRounds, 10) : 3,
    currentRound: data.currentRound !== undefined ? parseInt(data.currentRound, 10) : 0,
    startAt: data.startAt || new Date().toISOString(),
    endAt: data.endAt || null,
    createdAt: new Date().toISOString()
  };

  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `INSERT INTO tournaments 
       (id, name, description, organizer_id, type, status, rating_type, time_control, duration_minutes, rated, max_players, min_players, win_points, draw_points, loss_points, bye_points, total_rounds, current_round, start_at, end_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tournament.id, tournament.name, tournament.description, tournament.organizerId,
        tournament.type, tournament.status, tournament.ratingType, tournament.timeControl,
        tournament.durationMinutes, tournament.rated, tournament.maxPlayers, tournament.minPlayers,
        tournament.winPoints, tournament.drawPoints, tournament.lossPoints, tournament.byePoints,
        tournament.totalRounds, tournament.currentRound, formatSqlDate(tournament.startAt), formatSqlDate(tournament.endAt)
      ]
    );
  } else {
    inMemoryDb.tournaments.set(tournament.id, tournament);
  }

  return tournament;
}

export async function findTournamentById(id, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    const [rows] = await executor.query(`SELECT * FROM tournaments WHERE id = ?`, [id]);
    if (rows.length === 0) return null;
    return mapTournamentRow(rows[0]);
  } else {
    return inMemoryDb.tournaments.get(id) || null;
  }
}

export async function findTournaments(options = {}, conn = null) {
  const parsedLimit = parseInt(options.limit, 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(100, parsedLimit) : 50;
  const parsedOffset = parseInt(options.offset, 10);
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const status = options.status;
  const type = options.type;
  const organizerId = options.organizerId;

  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    let query = `SELECT * FROM tournaments`;
    const where = [];
    const params = [];

    if (status) {
      where.push(`status = ?`);
      params.push(status);
    }
    if (type) {
      where.push(`type = ?`);
      params.push(type);
    }
    if (organizerId) {
      where.push(`organizer_id = ?`);
      params.push(organizerId);
    }

    if (where.length > 0) {
      query += ` WHERE ${where.join(' AND ')}`;
    }
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await executor.query(query, params);
    return rows.map(mapTournamentRow);
  } else {
    let list = Array.from(inMemoryDb.tournaments.values());
    if (status) list = list.filter(t => t.status === status);
    if (type) list = list.filter(t => t.type === type);
    if (organizerId) list = list.filter(t => t.organizerId === organizerId);
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list.slice(offset, offset + limit);
  }
}

export async function updateTournamentStatus(id, updateFields, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    const setClause = [];
    const values = [];

    if (updateFields.status !== undefined) { setClause.push('status = ?'); values.push(updateFields.status); }
    if (updateFields.currentRound !== undefined) { setClause.push('current_round = ?'); values.push(updateFields.currentRound); }
    if (updateFields.totalRounds !== undefined) { setClause.push('total_rounds = ?'); values.push(updateFields.totalRounds); }
    if (updateFields.startAt !== undefined) { setClause.push('start_at = ?'); values.push(formatSqlDate(updateFields.startAt)); }
    if (updateFields.endAt !== undefined) { setClause.push('end_at = ?'); values.push(formatSqlDate(updateFields.endAt)); }

    if (setClause.length === 0) return;
    values.push(id);

    await executor.query(`UPDATE tournaments SET ${setClause.join(', ')} WHERE id = ?`, values);
  } else {
    const t = inMemoryDb.tournaments.get(id);
    if (t) Object.assign(t, updateFields);
  }
}

export async function registerUserForTournament(tournamentId, userId, seed = null, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `INSERT INTO tournament_entries (tournament_id, user_id, score, tiebreak_score, wins, draws, losses, games_played, byes_count, withdrawn, seed)
       VALUES (?, ?, 0.0, 0.0, 0, 0, 0, 0, 0, FALSE, ?)`,
      [tournamentId, userId, seed]
    );
  } else {
    const key = `${tournamentId}:${userId}`;
    const existing = inMemoryDb.tournamentEntries.get(key);
    if (existing && !existing.withdrawn) {
      const err = new Error('User already registered.');
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }
    inMemoryDb.tournamentEntries.set(key, {
      tournamentId,
      userId,
      score: 0.0,
      tiebreakScore: 0.0,
      wins: 0,
      draws: 0,
      losses: 0,
      gamesPlayed: 0,
      byesCount: 0,
      withdrawn: false,
      seed,
      joinedAt: new Date().toISOString()
    });
  }
}

export async function withdrawUserFromTournament(tournamentId, userId, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `UPDATE tournament_entries SET withdrawn = TRUE WHERE tournament_id = ? AND user_id = ?`,
      [tournamentId, userId]
    );
  } else {
    const key = `${tournamentId}:${userId}`;
    const entry = inMemoryDb.tournamentEntries.get(key);
    if (entry) {
      entry.withdrawn = true;
    }
  }
}

export async function removeUserFromTournament(tournamentId, userId, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `DELETE FROM tournament_entries WHERE tournament_id = ? AND user_id = ?`,
      [tournamentId, userId]
    );
  } else {
    const key = `${tournamentId}:${userId}`;
    inMemoryDb.tournamentEntries.delete(key);
  }
}

export async function getTournamentEntries(tournamentId, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    const [rows] = await executor.query(
      `SELECT te.*, u.username, u.avatar_url
       FROM tournament_entries te
       JOIN users u ON te.user_id = u.id
       WHERE te.tournament_id = ?
       ORDER BY te.score DESC, te.tiebreak_score DESC, te.wins DESC, te.games_played ASC, te.user_id ASC`,
      [tournamentId]
    );
    return rows.map((r, idx) => ({
      rank: idx + 1,
      tournamentId: r.tournament_id,
      userId: r.user_id,
      username: r.username,
      avatarUrl: r.avatar_url,
      score: r.score,
      tiebreakScore: r.tiebreak_score || 0.0,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      gamesPlayed: r.games_played,
      byesCount: r.byes_count || 0,
      withdrawn: Boolean(r.withdrawn),
      seed: r.seed,
      joinedAt: r.joined_at
    }));
  } else {
    const entries = [];
    for (const [key, val] of inMemoryDb.tournamentEntries.entries()) {
      if (val.tournamentId === tournamentId) {
        const user = inMemoryDb.users.get(val.userId);
        if (user) {
          entries.push({
            userId: val.userId,
            username: user.username,
            avatarUrl: user.avatarUrl || null,
            score: val.score || 0.0,
            tiebreakScore: val.tiebreakScore || 0.0,
            wins: val.wins || 0,
            draws: val.draws || 0,
            losses: val.losses || 0,
            gamesPlayed: val.gamesPlayed || 0,
            byesCount: val.byesCount || 0,
            withdrawn: Boolean(val.withdrawn),
            seed: val.seed !== undefined ? val.seed : null,
            joinedAt: val.joinedAt
          });
        }
      }
    }

    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.tiebreakScore !== a.tiebreakScore) return b.tiebreakScore - a.tiebreakScore;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
      return a.userId.localeCompare(b.userId);
    });

    return entries.map((e, idx) => ({ rank: idx + 1, tournamentId, ...e }));
  }
}

export async function updateTournamentEntryScore(tournamentId, userId, points, outcome, conn = null) {
  const isWin = outcome === 'win' ? 1 : 0;
  const isDraw = outcome === 'draw' ? 1 : 0;
  const isLoss = outcome === 'loss' ? 1 : 0;

  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `UPDATE tournament_entries 
       SET score = score + ?,
           games_played = games_played + 1,
           wins = wins + ?,
           draws = draws + ?,
           losses = losses + ?
       WHERE tournament_id = ? AND user_id = ?`,
      [points, isWin, isDraw, isLoss, tournamentId, userId]
    );
  } else {
    const key = `${tournamentId}:${userId}`;
    const entry = inMemoryDb.tournamentEntries.get(key);
    if (entry) {
      entry.score = (entry.score || 0.0) + points;
      entry.gamesPlayed = (entry.gamesPlayed || 0) + 1;
      if (outcome === 'win') entry.wins = (entry.wins || 0) + 1;
      else if (outcome === 'draw') entry.draws = (entry.draws || 0) + 1;
      else if (outcome === 'loss') entry.losses = (entry.losses || 0) + 1;
    }
  }
}

export async function updateTournamentEntryTiebreak(tournamentId, userId, tiebreakScore, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `UPDATE tournament_entries 
       SET tiebreak_score = ?
       WHERE tournament_id = ? AND user_id = ?`,
      [tiebreakScore, tournamentId, userId]
    );
  } else {
    const key = `${tournamentId}:${userId}`;
    const entry = inMemoryDb.tournamentEntries.get(key);
    if (entry) {
      entry.tiebreakScore = tiebreakScore;
    }
  }
}

export async function incrementUserBye(tournamentId, userId, points, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `UPDATE tournament_entries 
       SET score = score + ?,
           byes_count = byes_count + 1
       WHERE tournament_id = ? AND user_id = ?`,
      [points, tournamentId, userId]
    );
  } else {
    const key = `${tournamentId}:${userId}`;
    const entry = inMemoryDb.tournamentEntries.get(key);
    if (entry) {
      entry.score = (entry.score || 0.0) + points;
      entry.byesCount = (entry.byesCount || 0) + 1;
    }
  }
}

export async function setTournamentEntrySeed(tournamentId, userId, seed, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `UPDATE tournament_entries SET seed = ? WHERE tournament_id = ? AND user_id = ?`,
      [seed, tournamentId, userId]
    );
  } else {
    const key = `${tournamentId}:${userId}`;
    const entry = inMemoryDb.tournamentEntries.get(key);
    if (entry) {
      entry.seed = seed;
    }
  }
}

export async function addTournamentGame(tournamentId, gameId, roundNumber = 1, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `INSERT INTO tournament_games (tournament_id, game_id, round_number)
       VALUES (?, ?, ?)`,
      [tournamentId, gameId, roundNumber]
    );
  } else {
    inMemoryDb.tournamentGames.push({ tournamentId, gameId, roundNumber });
  }
}

export async function getTournamentGames(tournamentId, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    const [rows] = await executor.query(
      `SELECT tg.*, g.white_player_id, g.black_player_id, g.result, g.status, g.created_at AS game_created
       FROM tournament_games tg
       JOIN games g ON tg.game_id = g.id
       WHERE tg.tournament_id = ?
       ORDER BY tg.round_number ASC, tg.created_at DESC`,
      [tournamentId]
    );
    return rows.map(r => ({
      tournamentId: r.tournament_id,
      gameId: r.game_id,
      roundNumber: r.round_number,
      whitePlayerId: r.white_player_id,
      blackPlayerId: r.black_player_id,
      result: r.result,
      status: r.status,
      createdAt: r.created_at
    }));
  } else {
    const games = [];
    for (const tg of inMemoryDb.tournamentGames) {
      if (tg.tournamentId === tournamentId) {
        const game = inMemoryDb.games.get(tg.gameId);
        if (game) {
          games.push({
            tournamentId,
            gameId: tg.gameId,
            roundNumber: tg.roundNumber,
            whitePlayerId: game.whitePlayerId,
            blackPlayerId: game.blackPlayerId,
            result: game.result,
            status: game.status,
            createdAt: game.createdAt
          });
        }
      }
    }
    return games;
  }
}

export async function createTournamentRound(tournamentId, roundNumber, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `INSERT INTO tournament_rounds (tournament_id, round_number, status, started_at)
       VALUES (?, ?, 'active', CURRENT_TIMESTAMP)`,
      [tournamentId, roundNumber]
    );
  } else {
    const key = `${tournamentId}:${roundNumber}`;
    inMemoryDb.tournamentRounds.set(key, {
      tournamentId,
      roundNumber,
      status: 'active',
      startedAt: new Date().toISOString(),
      finishedAt: null
    });
  }
}

export async function updateTournamentRoundStatus(tournamentId, roundNumber, status, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `UPDATE tournament_rounds SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE tournament_id = ? AND round_number = ?`,
      [status, tournamentId, roundNumber]
    );
  } else {
    const key = `${tournamentId}:${roundNumber}`;
    const r = inMemoryDb.tournamentRounds.get(key);
    if (r) {
      r.status = status;
      r.finishedAt = new Date().toISOString();
    }
  }
}

export async function getTournamentRounds(tournamentId, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    const [rows] = await executor.query(
      `SELECT * FROM tournament_rounds WHERE tournament_id = ? ORDER BY round_number ASC`,
      [tournamentId]
    );
    return rows.map(r => ({
      id: r.id,
      tournamentId: r.tournament_id,
      roundNumber: r.round_number,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      createdAt: r.created_at
    }));
  } else {
    const rounds = [];
    for (const [key, val] of inMemoryDb.tournamentRounds.entries()) {
      if (val.tournamentId === tournamentId) {
        rounds.push({ ...val });
      }
    }
    rounds.sort((a, b) => a.roundNumber - b.roundNumber);
    return rounds;
  }
}

export async function addTournamentPairing(pairingData, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    const [result] = await executor.query(
      `INSERT INTO tournament_pairings (tournament_id, round_id, round_number, white_user_id, black_user_id, game_id, is_bye, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pairingData.tournamentId, pairingData.roundId || 0, pairingData.roundNumber,
        pairingData.whiteUserId, pairingData.blackUserId || null, pairingData.gameId || null,
        pairingData.isBye ? 1 : 0, pairingData.result || null
      ]
    );
    return result.insertId;
  } else {
    const id = inMemoryDb.tournamentPairings.length + 1;
    const pairing = { id, ...pairingData, isBye: Boolean(pairingData.isBye) };
    inMemoryDb.tournamentPairings.push(pairing);
    return id;
  }
}

export async function getTournamentPairings(tournamentId, roundNumber = null, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    let query = `
      SELECT tp.*, 
             uw.username AS white_username,
             ub.username AS black_username
      FROM tournament_pairings tp
      LEFT JOIN users uw ON tp.white_user_id = uw.id
      LEFT JOIN users ub ON tp.black_user_id = ub.id
      WHERE tp.tournament_id = ?
    `;
    const params = [tournamentId];
    if (roundNumber !== null && roundNumber !== undefined) {
      query += ` AND tp.round_number = ?`;
      params.push(roundNumber);
    }
    query += ` ORDER BY tp.round_number ASC, tp.id ASC`;

    const [rows] = await executor.query(query, params);
    return rows.map(r => ({
      id: r.id,
      tournamentId: r.tournament_id,
      roundId: r.round_id,
      roundNumber: r.round_number,
      whiteUserId: r.white_user_id,
      whiteUsername: r.white_username || null,
      blackUserId: r.black_user_id,
      blackUsername: r.black_username || null,
      gameId: r.game_id,
      isBye: Boolean(r.is_bye),
      result: r.result,
      createdAt: r.created_at
    }));
  } else {
    let pairings = inMemoryDb.tournamentPairings.filter(p => p.tournamentId === tournamentId);
    if (roundNumber !== null && roundNumber !== undefined) {
      pairings = pairings.filter(p => p.roundNumber === Number(roundNumber));
    }
    return pairings.map(p => {
      const white = inMemoryDb.users.get(p.whiteUserId);
      const black = p.blackUserId ? inMemoryDb.users.get(p.blackUserId) : null;
      return {
        ...p,
        whiteUsername: white ? white.username : null,
        blackUsername: black ? black.username : null
      };
    });
  }
}

export async function findPairingByGameId(tournamentId, gameId, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    const [rows] = await executor.query(
      `SELECT * FROM tournament_pairings WHERE tournament_id = ? AND game_id = ? LIMIT 1`,
      [tournamentId, gameId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      tournamentId: r.tournament_id,
      roundId: r.round_id,
      roundNumber: r.round_number,
      whiteUserId: r.white_user_id,
      blackUserId: r.black_user_id,
      gameId: r.game_id,
      isBye: Boolean(r.is_bye),
      result: r.result,
      createdAt: r.created_at
    };
  } else {
    const p = inMemoryDb.tournamentPairings.find(x => x.tournamentId === tournamentId && x.gameId === gameId);
    return p ? { ...p } : null;
  }
}

export async function updateTournamentPairingResult(tournamentId, gameId, result, conn = null) {
  if (isUsingMysql()) {
    const executor = getExecutor(conn);
    await executor.query(
      `UPDATE tournament_pairings SET result = ? WHERE tournament_id = ? AND game_id = ?`,
      [result, tournamentId, gameId]
    );
  } else {
    const p = inMemoryDb.tournamentPairings.find(x => x.tournamentId === tournamentId && x.gameId === gameId);
    if (p) {
      p.result = result;
    }
  }
}

function mapTournamentRow(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    organizerId: r.organizer_id,
    type: r.type,
    status: r.status,
    ratingType: r.rating_type,
    timeControl: r.time_control,
    durationMinutes: r.duration_minutes !== undefined ? r.duration_minutes : 60,
    rated: Boolean(r.rated),
    maxPlayers: r.max_players,
    minPlayers: r.min_players !== undefined ? r.min_players : 2,
    winPoints: r.win_points,
    drawPoints: r.draw_points,
    lossPoints: r.loss_points,
    byePoints: r.bye_points,
    totalRounds: r.total_rounds,
    currentRound: r.current_round,
    startAt: r.start_at,
    endAt: r.end_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}
