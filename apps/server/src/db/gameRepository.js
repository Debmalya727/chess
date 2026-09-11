import { getPool, isUsingMysql, inMemoryDb } from './index.js';

export async function createGame(gameData) {
  if (!gameData.id) {
    gameData.id = `game_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
  if (isUsingMysql()) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO games (id, room_code, white_player_id, black_player_id, mode, status, time_control, initial_fen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gameData.id,
        gameData.roomCode,
        gameData.whitePlayerId || null,
        gameData.blackPlayerId || null,
        gameData.mode || 'ONLINE',
        gameData.status || 'WAITING',
        gameData.timeControl || '10+0',
        gameData.initialFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      ]
    );
    return gameData;
  } else {
    inMemoryDb.games.set(gameData.id, gameData);
    inMemoryDb.gamesByRoomCode.set(gameData.roomCode, gameData);

    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      const { redisKeys } = await import('../redis/redisKeys.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const json = JSON.stringify(gameData);
        await client.set(redisKeys.gameMeta(gameData.id), json, 'EX', 7200);
        await client.set(redisKeys.gameMeta(gameData.roomCode), json, 'EX', 7200);
      }
    } catch {}

    return gameData;
  }
}

export async function findGameById(id) {
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM games WHERE id = ?`, [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return mapGameRow(r);
  } else {
    let game = inMemoryDb.games.get(id);
    if (!game) {
      try {
        const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
        const { redisKeys } = await import('../redis/redisKeys.js');
        if (isRedisConnected()) {
          const client = getRedisClient();
          const raw = await client.get(redisKeys.gameMeta(id));
          if (raw) {
            game = JSON.parse(raw);
            inMemoryDb.games.set(id, game);
            if (game.roomCode) inMemoryDb.gamesByRoomCode.set(game.roomCode, game);
          }
        }
      } catch {}
    }
    return game || null;
  }
}

export async function findGameByRoomCode(roomCode) {
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM games WHERE room_code = ?`, [roomCode]);
    if (rows.length === 0) return null;
    return mapGameRow(rows[0]);
  } else {
    let game = inMemoryDb.gamesByRoomCode.get(roomCode);
    if (!game) {
      try {
        const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
        const { redisKeys } = await import('../redis/redisKeys.js');
        if (isRedisConnected()) {
          const client = getRedisClient();
          const raw = await client.get(redisKeys.gameMeta(roomCode));
          if (raw) {
            game = JSON.parse(raw);
            inMemoryDb.gamesByRoomCode.set(roomCode, game);
            if (game.id) inMemoryDb.games.set(game.id, game);
          }
        }
      } catch {}
    }
    return game || null;
  }
}

export async function updateGameStatus(id, updateFields, connection = null) {
  if (isUsingMysql()) {
    const executor = connection || getPool();
    const setClause = [];
    const values = [];

    const formatSqlDate = (d) => {
      if (!d) return null;
      if (d instanceof Date) return d.toISOString().slice(0, 19).replace('T', ' ');
      if (typeof d === 'string' && d.includes('T')) return d.slice(0, 19).replace('T', ' ');
      return d;
    };

    if (updateFields.whitePlayerId !== undefined) { setClause.push('white_player_id = ?'); values.push(updateFields.whitePlayerId); }
    if (updateFields.blackPlayerId !== undefined) { setClause.push('black_player_id = ?'); values.push(updateFields.blackPlayerId); }
    if (updateFields.status !== undefined) { setClause.push('status = ?'); values.push(updateFields.status); }
    if (updateFields.finalFen !== undefined) { setClause.push('final_fen = ?'); values.push(updateFields.finalFen); }
    if (updateFields.pgn !== undefined) { setClause.push('pgn = ?'); values.push(updateFields.pgn); }
    if (updateFields.result !== undefined) { setClause.push('result = ?'); values.push(updateFields.result); }
    if (updateFields.termination !== undefined) { setClause.push('termination = ?'); values.push(updateFields.termination); }
    if (updateFields.startedAt !== undefined) { setClause.push('started_at = ?'); values.push(formatSqlDate(updateFields.startedAt)); }
    if (updateFields.endedAt !== undefined) { setClause.push('ended_at = ?'); values.push(formatSqlDate(updateFields.endedAt)); }

    if (setClause.length === 0) return;
    values.push(id);

    await executor.query(`UPDATE games SET ${setClause.join(', ')} WHERE id = ?`, values);
  } else {
    const game = inMemoryDb.games.get(id);
    if (game) {
      Object.assign(game, updateFields);
    }
    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      const { redisKeys } = await import('../redis/redisKeys.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const raw = await client.get(redisKeys.gameMeta(id));
        if (raw) {
          const parsed = JSON.parse(raw);
          Object.assign(parsed, updateFields);
          const updated = JSON.stringify(parsed);
          await client.set(redisKeys.gameMeta(id), updated, 'EX', 7200);
          if (parsed.roomCode) await client.set(redisKeys.gameMeta(parsed.roomCode), updated, 'EX', 7200);
        }
      }
    } catch {}
  }
}

export async function findGamesByUserId(userId) {
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM games WHERE white_player_id = ? OR black_player_id = ? ORDER BY created_at DESC LIMIT 50`,
      [userId, userId]
    );
    return rows.map(mapGameRow);
  } else {
    const list = Array.from(inMemoryDb.games.values());
    return list.filter(g => g.whitePlayerId === userId || g.blackPlayerId === userId);
  }
}

export async function findActiveGameByUserId(userId) {
  if (!userId) return null;
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM games 
       WHERE (white_player_id = ? OR black_player_id = ?) 
         AND status IN ('WAITING', 'READY', 'ACTIVE') 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, userId]
    );
    if (rows.length === 0) return null;
    return mapGameRow(rows[0]);
  } else {
    const list = Array.from(inMemoryDb.games.values());
    return list.find(g => 
      (g.whitePlayerId === userId || g.blackPlayerId === userId) && 
      ['WAITING', 'READY', 'ACTIVE'].includes(g.status)
    ) || null;
  }
}

export async function findPaginatedGamesByUserId(userId, options = {}) {
  const parsedPage = parseInt(options.page, 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const parsedLimit = parseInt(options.limit, 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(100, parsedLimit) : 20;
  const offset = (page - 1) * limit;
  const ratingType = options.ratingType;
  const result = options.result;

  if (isUsingMysql()) {
    const pool = getPool();
    const whereClauses = [`(g.white_player_id = ? OR g.black_player_id = ?)`, `g.status = 'FINISHED'`];
    const queryParams = [userId, userId];

    if (result) {
      whereClauses.push('g.result = ?');
      queryParams.push(result);
    }

    const whereSql = whereClauses.join(' AND ');

    // Count query
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM games g WHERE ${whereSql}`,
      queryParams
    );
    const total = countRows[0]?.total || 0;

    // Data query with username joins
    const dataParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(
      `SELECT g.*, 
              w.username AS white_username, 
              b.username AS black_username
       FROM games g
       LEFT JOIN users w ON g.white_player_id = w.id
       LEFT JOIN users b ON g.black_player_id = b.id
       WHERE ${whereSql}
       ORDER BY COALESCE(g.ended_at, g.created_at) DESC
       LIMIT ? OFFSET ?`,
      dataParams
    );

    const games = rows.map(r => ({
      ...mapGameRow(r),
      whiteUsername: r.white_username || (r.white_player_id ? 'Player' : 'Guest'),
      blackUsername: r.black_username || (r.black_player_id ? 'Player' : 'Guest')
    }));

    // Filter by ratingType if specified
    let filteredGames = games;
    if (ratingType) {
      filteredGames = games.filter(g => {
        const parts = (g.timeControl || '10+0').split('+');
        const baseMins = parseFloat(parts[0]) || 10;
        let cat = 'rapid';
        if (baseMins < 3) cat = 'bullet';
        else if (baseMins <= 5) cat = 'blitz';
        else if (baseMins < 30) cat = 'rapid';
        else cat = 'classical';
        return cat === ratingType;
      });
    }

    return {
      games: filteredGames,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  } else {
    let list = Array.from(inMemoryDb.games.values())
      .filter(g => (g.whitePlayerId === userId || g.blackPlayerId === userId) && g.status === 'FINISHED');

    if (result) {
      list = list.filter(g => g.result === result);
    }

    if (ratingType) {
      list = list.filter(g => {
        const parts = (g.timeControl || '10+0').split('+');
        const baseMins = parseFloat(parts[0]) || 10;
        let cat = 'rapid';
        if (baseMins < 3) cat = 'bullet';
        else if (baseMins <= 5) cat = 'blitz';
        else if (baseMins < 30) cat = 'rapid';
        else cat = 'classical';
        return cat === ratingType;
      });
    }

    list.sort((a, b) => new Date(b.endedAt || b.createdAt) - new Date(a.endedAt || a.createdAt));

    const total = list.length;
    const paged = list.slice(offset, offset + limit).map(g => {
      const whiteUser = inMemoryDb.users.get(g.whitePlayerId);
      const blackUser = inMemoryDb.users.get(g.blackPlayerId);
      return {
        ...g,
        whiteUsername: whiteUser ? whiteUser.username : (g.whitePlayerId ? 'Player' : 'Guest'),
        blackUsername: blackUser ? blackUser.username : (g.blackPlayerId ? 'Player' : 'Guest')
      };
    });

    return {
      games: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

function mapGameRow(r) {
  return {
    id: r.id,
    roomCode: r.room_code,
    whitePlayerId: r.white_player_id,
    blackPlayerId: r.black_player_id,
    mode: r.mode,
    status: r.status,
    timeControl: r.time_control,
    initialFen: r.initial_fen,
    finalFen: r.final_fen,
    pgn: r.pgn,
    result: r.result,
    termination: r.termination,
    createdAt: r.created_at,
    startedAt: r.started_at,
    endedAt: r.ended_at
  };
}
