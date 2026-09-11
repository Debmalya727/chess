import { getPool, isUsingMysql, inMemoryDb } from './index.js';

export async function createAnalysis(gameId) {
  if (!gameId) return null;
  const now = new Date();
  const initial = {
    gameId,
    status: 'pending',
    engineCorrelation: null,
    averageCentipawnLoss: null,
    accuracyScore: null,
    timingScore: null,
    complexityScore: null,
    suspicionScore: null,
    signals: [],
    analysisVersion: '1.0',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  if (isUsingMysql()) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO fair_play_analyses (game_id, status, analysis_version, created_at, updated_at)
       VALUES (?, 'pending', '1.0', NOW(), NOW())
       ON DUPLICATE KEY UPDATE updated_at = NOW()`,
      [gameId]
    );
  } else {
    inMemoryDb.fairPlayAnalyses.set(gameId, initial);
  }
  return initial;
}

export async function updateAnalysis(gameId, data = {}) {
  if (!gameId) return null;
  const now = new Date();

  if (isUsingMysql()) {
    const pool = getPool();
    const signalsJson = data.signals ? JSON.stringify(data.signals) : null;
    await pool.query(
      `UPDATE fair_play_analyses SET
         status = COALESCE(?, status),
         engine_correlation = ?,
         average_centipawn_loss = ?,
         accuracy_score = ?,
         timing_score = ?,
         complexity_score = ?,
         suspicion_score = ?,
         signals = ?,
         updated_at = NOW()
       WHERE game_id = ?`,
      [
        data.status || 'complete',
        data.engineCorrelation ?? null,
        data.averageCentipawnLoss ?? null,
        data.accuracyScore ?? null,
        data.timingScore ?? null,
        data.complexityScore ?? null,
        data.suspicionScore ?? null,
        signalsJson,
        gameId
      ]
    );
    return getAnalysis(gameId);
  } else {
    const existing = inMemoryDb.fairPlayAnalyses.get(gameId) || { gameId, createdAt: now.toISOString() };
    const updated = {
      ...existing,
      ...data,
      signals: data.signals || existing.signals || [],
      updatedAt: now.toISOString()
    };
    inMemoryDb.fairPlayAnalyses.set(gameId, updated);
    return updated;
  }
}

export async function getAnalysis(gameId) {
  if (!gameId) return null;

  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM fair_play_analyses WHERE game_id = ?`,
      [gameId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      gameId: r.game_id,
      status: r.status,
      engineCorrelation: r.engine_correlation,
      averageCentipawnLoss: r.average_centipawn_loss,
      accuracyScore: r.accuracy_score,
      timingScore: r.timing_score,
      complexityScore: r.complexity_score,
      suspicionScore: r.suspicion_score,
      signals: typeof r.signals === 'string' ? JSON.parse(r.signals) : (r.signals || []),
      analysisVersion: r.analysis_version,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  } else {
    return inMemoryDb.fairPlayAnalyses.get(gameId) || null;
  }
}

export async function listAnalyses({ status, limit = 50 } = {}) {
  const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);

  if (isUsingMysql()) {
    const pool = getPool();
    let query = `SELECT * FROM fair_play_analyses`;
    const params = [];
    if (status) {
      query += ` WHERE status = ?`;
      params.push(status);
    }
    query += ` ORDER BY updated_at DESC LIMIT ?`;
    params.push(parsedLimit);

    const [rows] = await pool.query(query, params);
    return rows.map(r => ({
      id: r.id,
      gameId: r.game_id,
      status: r.status,
      engineCorrelation: r.engine_correlation,
      averageCentipawnLoss: r.average_centipawn_loss,
      accuracyScore: r.accuracy_score,
      timingScore: r.timing_score,
      complexityScore: r.complexity_score,
      suspicionScore: r.suspicion_score,
      signals: typeof r.signals === 'string' ? JSON.parse(r.signals) : (r.signals || []),
      analysisVersion: r.analysis_version,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  } else {
    let items = Array.from(inMemoryDb.fairPlayAnalyses.values());
    if (status) {
      items = items.filter(a => a.status === status);
    }
    return items.slice(0, parsedLimit);
  }
}
