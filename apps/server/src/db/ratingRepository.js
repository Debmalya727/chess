import { getPool, isUsingMysql, inMemoryDb } from './index.js';
import { config } from '../config/env.js';

export async function getUserRating(userId, ratingType) {
  const defaultRating = config.ratings?.initial || 1500;
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM user_ratings WHERE user_id = ? AND rating_type = ?`,
      [userId, ratingType]
    );
    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        ratingType: r.rating_type,
        rating: r.rating,
        gamesPlayed: r.games_played,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws
      };
    }
  } else {
    const key = `${userId}:${ratingType}`;
    if (inMemoryDb.userRatings.has(key)) {
      return { ...inMemoryDb.userRatings.get(key) };
    }
  }

  return {
    userId,
    ratingType,
    rating: defaultRating,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0
  };
}

export async function getUserRatings(userId) {
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM user_ratings WHERE user_id = ?`,
      [userId]
    );
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      ratingType: r.rating_type,
      rating: r.rating,
      gamesPlayed: r.games_played,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws
    }));
  } else {
    const ratings = [];
    for (const [key, val] of inMemoryDb.userRatings.entries()) {
      if (val.userId === userId) {
        ratings.push({ ...val });
      }
    }
    return ratings;
  }
}

/**
 * Updates a user's rating atomically and logs history.
 * @param {string} userId
 * @param {string} ratingType
 * @param {number} oldRating
 * @param {number} newRating
 * @param {'win'|'loss'|'draw'} outcome
 * @param {string} gameId
 * @param {object} [connection] Optional MySQL connection for transaction support
 */
export async function updateRatingTransaction({ userId, ratingType, oldRating, newRating, outcome, gameId, connection = null }) {
  const ratingChange = newRating - oldRating;
  const isWin = outcome === 'win' ? 1 : 0;
  const isLoss = outcome === 'loss' ? 1 : 0;
  const isDraw = outcome === 'draw' ? 1 : 0;

  if (isUsingMysql()) {
    const executor = connection || getPool();
    
    // Upsert into user_ratings
    await executor.query(
      `INSERT INTO user_ratings (user_id, rating_type, rating, games_played, wins, losses, draws)
       VALUES (?, ?, ?, 1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         rating = ?,
         games_played = games_played + 1,
         wins = wins + ?,
         losses = losses + ?,
         draws = draws + ?`,
      [
        userId, ratingType, newRating, isWin, isLoss, isDraw,
        newRating, isWin, isLoss, isDraw
      ]
    );

    // Also sync overall user rating in users table if desired
    await executor.query(
      `UPDATE users SET rating = ? WHERE id = ?`,
      [newRating, userId]
    );

    // Record rating history
    await executor.query(
      `INSERT INTO rating_history (user_id, game_id, rating_type, old_rating, new_rating, rating_change)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, gameId, ratingType, oldRating, newRating, ratingChange]
    );
  } else {
    const key = `${userId}:${ratingType}`;
    const current = inMemoryDb.userRatings.get(key) || {
      userId,
      ratingType,
      rating: oldRating,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0
    };

    current.rating = newRating;
    current.gamesPlayed += 1;
    if (outcome === 'win') current.wins += 1;
    else if (outcome === 'loss') current.losses += 1;
    else if (outcome === 'draw') current.draws += 1;

    inMemoryDb.userRatings.set(key, current);

    // Update base user rating in inMemoryDb
    if (inMemoryDb.users.has(userId)) {
      const u = inMemoryDb.users.get(userId);
      u.rating = newRating;
    }

    inMemoryDb.ratingHistory.push({
      id: inMemoryDb.ratingHistory.length + 1,
      userId,
      gameId,
      ratingType,
      oldRating,
      newRating,
      ratingChange,
      createdAt: new Date().toISOString()
    });
  }

  return { userId, ratingType, oldRating, newRating, ratingChange };
}

export async function getRatingHistory(userId) {
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM rating_history WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      gameId: r.game_id,
      ratingType: r.rating_type,
      oldRating: r.old_rating,
      newRating: r.new_rating,
      ratingChange: r.rating_change,
      createdAt: r.created_at
    }));
  } else {
    return inMemoryDb.ratingHistory
      .filter(h => h.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export async function hasRatingBeenAppliedForGame(gameId, connection = null) {
  if (!gameId) return false;
  if (isUsingMysql()) {
    const executor = connection || getPool();
    const [rows] = await executor.query(
      `SELECT id FROM rating_history WHERE game_id = ? LIMIT 1`,
      [gameId]
    );
    return rows.length > 0;
  } else {
    return inMemoryDb.ratingHistory.some(h => h.gameId === gameId);
  }
}

export async function getRatingHistoryByType(userId, ratingType, limit = 50) {
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit || '50', 10)));
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM rating_history WHERE user_id = ? AND rating_type = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, ratingType, safeLimit]
    );
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      gameId: r.game_id,
      ratingType: r.rating_type,
      oldRating: r.old_rating,
      newRating: r.new_rating,
      ratingChange: r.rating_change,
      createdAt: r.created_at
    }));
  } else {
    return inMemoryDb.ratingHistory
      .filter(h => h.userId === userId && h.ratingType === ratingType)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, safeLimit);
  }
}
