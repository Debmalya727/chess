import { getPool, isUsingMysql, inMemoryDb } from './index.js';

export async function recordGameEvent({ gameId, eventType, userId = null, ply = null, metadata = null, connection = null }) {
  if (!gameId || !eventType) return null;
  const now = new Date();

  if (isUsingMysql()) {
    const executor = connection || getPool();
    const metaJson = metadata ? JSON.stringify(metadata) : null;
    const [res] = await executor.query(
      `INSERT INTO game_events (game_id, event_type, user_id, ply, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [gameId, eventType, userId, ply, metaJson]
    );
    return {
      id: res.insertId,
      gameId,
      eventType,
      userId,
      ply,
      metadata,
      createdAt: now.toISOString()
    };
  } else {
    const ev = {
      id: inMemoryDb.gameEvents.length + 1,
      gameId,
      eventType,
      userId,
      ply,
      metadata,
      createdAt: now.toISOString()
    };
    inMemoryDb.gameEvents.push(ev);
    return ev;
  }
}

export async function getGameEvents(gameId) {
  if (!gameId) return [];

  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM game_events WHERE game_id = ? ORDER BY id ASC`,
      [gameId]
    );
    return rows.map(r => ({
      id: r.id,
      gameId: r.game_id,
      eventType: r.event_type,
      userId: r.user_id,
      ply: r.ply,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      createdAt: r.created_at
    }));
  } else {
    return inMemoryDb.gameEvents
      .filter(e => e.gameId === gameId)
      .sort((a, b) => a.id - b.id);
  }
}
