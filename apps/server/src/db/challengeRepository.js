import { getPool, isUsingMysql, inMemoryDb } from './index.js';

export async function createChallenge({ id, challengerId, challengedId, ratingType = 'blitz', timeControl = '5+0', colorPreference = 'random', expiresAt }) {
  const now = new Date();
  const exp = expiresAt || new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes default

  const challengeObj = {
    id,
    challengerId,
    challengedId,
    ratingType,
    timeControl,
    colorPreference,
    status: 'pending',
    gameId: null,
    expiresAt: exp.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  if (isUsingMysql()) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO challenges (id, challenger_id, challenged_id, rating_type, time_control, color_preference, status, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
      [id, challengerId, challengedId, ratingType, timeControl, colorPreference, exp]
    );
  } else {
    inMemoryDb.challenges.set(id, challengeObj);
    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        await client.set(`chess:challenge:meta:${id}`, JSON.stringify(challengeObj), 'EX', 3600);
      }
    } catch {}
  }

  return challengeObj;
}

export async function getChallengeById(id) {
  if (!id) return null;
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM challenges WHERE id = ?`, [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      challengerId: r.challenger_id,
      challengedId: r.challenged_id,
      ratingType: r.rating_type,
      timeControl: r.time_control,
      colorPreference: r.color_preference,
      status: r.status,
      gameId: r.game_id,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  } else {
    const c = inMemoryDb.challenges.get(id);
    if (c) return c;

    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const raw = await client.get(`chess:challenge:meta:${id}`);
        if (raw) {
          const obj = JSON.parse(raw);
          inMemoryDb.challenges.set(id, obj);
          return obj;
        }
      }
    } catch {}

    return null;
  }
}

export async function updateChallenge(id, updates = {}) {
  if (!id) return null;
  const existing = await getChallengeById(id);
  if (!existing) return null;

  const now = new Date();
  const newStatus = updates.status || existing.status;
  const newGameId = updates.gameId !== undefined ? updates.gameId : existing.gameId;

  if (isUsingMysql()) {
    const pool = getPool();
    await pool.query(
      `UPDATE challenges SET status = ?, game_id = ?, updated_at = NOW() WHERE id = ?`,
      [newStatus, newGameId, id]
    );
  } else {
    const record = inMemoryDb.challenges.get(id);
    if (record) {
      record.status = newStatus;
      record.gameId = newGameId;
      record.updatedAt = now.toISOString();
    }
    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const updated = { ...existing, status: newStatus, gameId: newGameId, updatedAt: now.toISOString() };
        await client.set(`chess:challenge:meta:${id}`, JSON.stringify(updated), 'EX', 3600);
      }
    } catch {}
  }

  return { ...existing, status: newStatus, gameId: newGameId, updatedAt: now.toISOString() };
}

export async function listChallenges(userId) {
  if (!userId) return { incoming: [], outgoing: [] };

  if (isUsingMysql()) {
    const pool = getPool();
    const [incomingRows] = await pool.query(
      `SELECT c.*, u.username as challenger_username, u.avatar_url as challenger_avatar, u.rating as challenger_rating
       FROM challenges c
       JOIN users u ON c.challenger_id = u.id
       WHERE c.challenged_id = ? AND c.status = 'pending' AND c.expires_at > NOW()
       ORDER BY c.created_at DESC`,
      [userId]
    );

    const [outgoingRows] = await pool.query(
      `SELECT c.*, u.username as challenged_username, u.avatar_url as challenged_avatar, u.rating as challenged_rating
       FROM challenges c
       JOIN users u ON c.challenged_id = u.id
       WHERE c.challenger_id = ? AND c.status = 'pending' AND c.expires_at > NOW()
       ORDER BY c.created_at DESC`,
      [userId]
    );

    return {
      incoming: incomingRows.map(r => ({
        id: r.id,
        challengerId: r.challenger_id,
        challengerUsername: r.challenger_username,
        challengerAvatar: r.challenger_avatar,
        challengerRating: r.challenger_rating,
        challengedId: r.challenged_id,
        ratingType: r.rating_type,
        timeControl: r.time_control,
        colorPreference: r.color_preference,
        status: r.status,
        expiresAt: r.expires_at,
        createdAt: r.created_at
      })),
      outgoing: outgoingRows.map(r => ({
        id: r.id,
        challengerId: r.challenger_id,
        challengedId: r.challenged_id,
        challengedUsername: r.challenged_username,
        challengedAvatar: r.challenged_avatar,
        challengedRating: r.challenged_rating,
        ratingType: r.rating_type,
        timeControl: r.time_control,
        colorPreference: r.color_preference,
        status: r.status,
        expiresAt: r.expires_at,
        createdAt: r.created_at
      }))
    };
  } else {
    const now = Date.now();
    const incoming = [];
    const outgoing = [];

    for (const c of inMemoryDb.challenges.values()) {
      const exp = new Date(c.expiresAt).getTime();
      if (c.status === 'pending' && exp > now) {
        if (c.challengedId === userId) {
          const challenger = inMemoryDb.users.get(c.challengerId);
          incoming.push({
            id: c.id,
            challengerId: c.challengerId,
            challengerUsername: challenger?.username || 'Unknown',
            challengerAvatar: challenger?.avatarUrl,
            challengerRating: challenger?.rating || 1500,
            challengedId: c.challengedId,
            ratingType: c.ratingType,
            timeControl: c.timeControl,
            colorPreference: c.colorPreference,
            status: c.status,
            expiresAt: c.expiresAt,
            createdAt: c.createdAt
          });
        } else if (c.challengerId === userId) {
          const challenged = inMemoryDb.users.get(c.challengedId);
          outgoing.push({
            id: c.id,
            challengerId: c.challengerId,
            challengedId: c.challengedId,
            challengedUsername: challenged?.username || 'Unknown',
            challengedAvatar: challenged?.avatarUrl,
            challengedRating: challenged?.rating || 1500,
            ratingType: c.ratingType,
            timeControl: c.timeControl,
            colorPreference: c.colorPreference,
            status: c.status,
            expiresAt: c.expiresAt,
            createdAt: c.createdAt
          });
        }
      }
    }

    return { incoming, outgoing };
  }
}
