import { getPool, isUsingMysql, inMemoryDb } from './index.js';

export const RATING_TYPES = ['bullet', 'blitz', 'rapid', 'classical'];

export function isValidRatingType(type) {
  return typeof type === 'string' && RATING_TYPES.includes(type.toLowerCase());
}

/**
 * Returns deterministic paginated leaderboard for a given ratingType.
 * Ordered by: rating DESC, games_played DESC, user_id ASC
 */
export async function getPaginatedLeaderboard(ratingType, options = {}) {
  const normalizedType = ratingType.toLowerCase();
  const parsedPage = parseInt(options.page, 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const parsedLimit = parseInt(options.limit, 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(100, parsedLimit) : 50;
  const offset = (page - 1) * limit;

  if (isUsingMysql()) {
    const pool = getPool();

    // Count total players in category
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM user_ratings WHERE rating_type = ?`,
      [normalizedType]
    );
    const total = countRows[0]?.total || 0;

    const [rows] = await pool.query(
      `SELECT ur.rating_type, ur.rating, ur.games_played, ur.wins, ur.losses, ur.draws,
              u.id AS user_id, u.username, u.avatar_url
       FROM user_ratings ur
       JOIN users u ON ur.user_id = u.id
       WHERE ur.rating_type = ?
       ORDER BY ur.rating DESC, ur.games_played DESC, ur.user_id ASC
       LIMIT ? OFFSET ?`,
      [normalizedType, limit, offset]
    );

    const players = rows.map((r, index) => ({
      rank: offset + index + 1,
      userId: r.user_id,
      username: r.username,
      avatarUrl: r.avatar_url,
      rating: r.rating,
      games: r.games_played,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws
    }));

    return {
      ratingType: normalizedType,
      players,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1
      }
    };
  } else {
    // In-Memory Fallback
    const matches = [];
    for (const [key, val] of inMemoryDb.userRatings.entries()) {
      if (val.ratingType === normalizedType) {
        const user = inMemoryDb.users.get(val.userId);
        if (user) {
          matches.push({
            userId: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl || null,
            rating: val.rating,
            games: val.gamesPlayed || 0,
            wins: val.wins || 0,
            losses: val.losses || 0,
            draws: val.draws || 0
          });
        }
      }
    }

    // Deterministic sorting: rating DESC, games DESC, userId ASC
    matches.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.games !== a.games) return b.games - a.games;
      return a.userId.localeCompare(b.userId);
    });

    const total = matches.length;
    const paged = matches.slice(offset, offset + limit).map((m, idx) => ({
      rank: offset + idx + 1,
      ...m
    }));

    return {
      ratingType: normalizedType,
      players: paged,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1
      }
    };
  }
}

/**
 * Returns rank info across all 4 rating categories for a user.
 */
export async function getUserRankings(userId) {
  const result = {};

  for (const cat of RATING_TYPES) {
    if (isUsingMysql()) {
      const pool = getPool();

      // Get user rating in cat
      const [userRows] = await pool.query(
        `SELECT rating, games_played FROM user_ratings WHERE user_id = ? AND rating_type = ?`,
        [userId, cat]
      );
      const userRating = userRows[0]?.rating || 1500;
      const gamesPlayed = userRows[0]?.games_played || 0;

      // Count total players in cat
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM user_ratings WHERE rating_type = ?`,
        [cat]
      );
      const totalPlayers = countRows[0]?.total || 0;

      // Rank = count of players with higher rating (or same rating with more games or lower userId) + 1
      const [rankRows] = await pool.query(
        `SELECT COUNT(*) AS higher_count FROM user_ratings
         WHERE rating_type = ? AND (
           rating > ? OR
           (rating = ? AND games_played > ?) OR
           (rating = ? AND games_played = ? AND user_id < ?)
         )`,
        [cat, userRating, userRating, gamesPlayed, userRating, gamesPlayed, userId]
      );

      const rank = (rankRows[0]?.higher_count || 0) + 1;

      result[cat] = {
        rating: userRating,
        gamesPlayed,
        rank: totalPlayers > 0 ? rank : 1,
        totalPlayers: totalPlayers > 0 ? totalPlayers : 1
      };
    } else {
      const userKey = `${userId}:${cat}`;
      const val = inMemoryDb.userRatings.get(userKey);
      const rating = val ? val.rating : 1500;
      const gamesPlayed = val ? val.gamesPlayed : 0;

      const catPlayers = [];
      for (const [key, r] of inMemoryDb.userRatings.entries()) {
        if (r.ratingType === cat && inMemoryDb.users.has(r.userId)) {
          catPlayers.push({
            userId: r.userId,
            rating: r.rating,
            games: r.gamesPlayed || 0
          });
        }
      }

      catPlayers.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        if (b.games !== a.games) return b.games - a.games;
        return a.userId.localeCompare(b.userId);
      });

      const totalPlayers = catPlayers.length;
      const foundIdx = catPlayers.findIndex(p => p.userId === userId);
      const rank = foundIdx >= 0 ? foundIdx + 1 : totalPlayers + 1;

      result[cat] = {
        rating,
        gamesPlayed,
        rank,
        totalPlayers: totalPlayers > 0 ? totalPlayers : Math.max(1, rank)
      };
    }
  }

  return result;
}

/**
 * Public user ranking lookup by username.
 */
export async function getPublicUserRankings(username) {
  let userId = null;
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT id FROM users WHERE username = ?`, [username]);
    if (rows.length > 0) userId = rows[0].id;
  } else {
    const user = inMemoryDb.usersByUsername.get(username);
    if (user) userId = user.id;
  }

  if (!userId) return null;
  return await getUserRankings(userId);
}
