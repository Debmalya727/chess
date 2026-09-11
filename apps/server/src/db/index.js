import mysql from 'mysql2/promise';
import { config } from '../config/env.js';

let pool = null;
let isMysqlConnected = false;

// Fallback in-memory data store if MySQL service is unreachable
export const inMemoryDb = {
  users: new Map(),           // id -> user
  usersByEmail: new Map(),    // email -> user
  usersByUsername: new Map(), // username -> user
  userRatings: new Map(),     // "userId:ratingType" -> ratingObj
  games: new Map(),           // id -> game
  gamesByRoomCode: new Map(), // roomCode -> game
  gameMoves: new Map(),       // gameId -> array of move objects
  ratingHistory: [],
  tournaments: new Map(),      // id -> tournament
  tournamentEntries: new Map(),// "tournamentId:userId" -> entry
  tournamentGames: [],        // array of { tournamentId, gameId, roundNumber }
  tournamentRounds: new Map(), // "tournamentId:roundNumber" -> round
  tournamentPairings: [],     // array of pairing objects
  // Phase 6C Social, Challenges, Game Events & Fair-Play
  friendships: [],            // array of { id, requesterId, recipientId, status, createdAt, updatedAt }
  challenges: new Map(),      // id -> challenge
  gameEvents: [],             // array of { id, gameId, eventType, userId, ply, metadata, createdAt }
  fairPlayAnalyses: new Map() // gameId -> analysis
};

export async function initDb() {
  if (process.env.DB_MODE === 'memory') {
    console.log('[Database] DB_MODE=memory forced. Utilizing isolated In-Memory DB Store.');
    isMysqlConnected = false;
    return;
  }

  try {
    const connConfig = {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password
    };
    if (config.db.ssl) {
      connConfig.ssl = config.db.ssl;
    }

    const tempConn = await mysql.createConnection(connConfig);
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\`;`);
    await tempConn.end();

    const poolConfig = {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };
    if (config.db.ssl) {
      poolConfig.ssl = config.db.ssl;
    }

    pool = mysql.createPool(poolConfig);

    await runMigrations(pool);
    isMysqlConnected = true;
    console.log('[Database] TiDB Cloud / MySQL pool initialized successfully.');
  } catch (err) {
    console.warn('[Database] Database connection failed. Utilizing isolated In-Memory DB Store:', err.message);
    isMysqlConnected = false;
  }
}

async function runMigrations(dbPool) {
  const tableQueries = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(32) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      avatar_url VARCHAR(512),
      rating INT NOT NULL DEFAULT 1500,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS user_ratings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      rating_type VARCHAR(16) NOT NULL,
      rating INT NOT NULL DEFAULT 1500,
      games_played INT NOT NULL DEFAULT 0,
      wins INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      draws INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_rating (user_id, rating_type)
    );`,
    `CREATE TABLE IF NOT EXISTS games (
      id VARCHAR(36) PRIMARY KEY,
      room_code VARCHAR(16) NOT NULL UNIQUE,
      white_player_id VARCHAR(36),
      black_player_id VARCHAR(36),
      mode VARCHAR(16) NOT NULL DEFAULT 'ONLINE',
      status VARCHAR(16) NOT NULL DEFAULT 'WAITING',
      time_control VARCHAR(32) NOT NULL DEFAULT '10+0',
      initial_fen VARCHAR(128) NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      final_fen VARCHAR(128),
      pgn TEXT,
      result VARCHAR(16) NOT NULL DEFAULT '*',
      termination VARCHAR(32) NULL,
      rated BOOLEAN NOT NULL DEFAULT TRUE,
      tournament_id VARCHAR(36) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP NULL,
      ended_at TIMESTAMP NULL
    );`,
    `CREATE TABLE IF NOT EXISTS game_moves (
      id INT AUTO_INCREMENT PRIMARY KEY,
      game_id VARCHAR(36) NOT NULL,
      ply INT NOT NULL,
      player_id VARCHAR(36) NULL,
      from_square VARCHAR(4) NOT NULL,
      to_square VARCHAR(4) NOT NULL,
      promotion VARCHAR(1) NULL,
      san VARCHAR(12) NOT NULL,
      fen_after VARCHAR(128) NOT NULL,
      move_time_ms INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS rating_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      game_id VARCHAR(36) NOT NULL,
      rating_type VARCHAR(16) NOT NULL,
      old_rating INT NOT NULL,
      new_rating INT NOT NULL,
      rating_change INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS tournaments (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      description TEXT NULL,
      organizer_id VARCHAR(36) NULL,
      type VARCHAR(16) NOT NULL DEFAULT 'arena',
      status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
      rating_type VARCHAR(16) NOT NULL DEFAULT 'rapid',
      time_control VARCHAR(32) NOT NULL DEFAULT '10+0',
      duration_minutes INT NOT NULL DEFAULT 60,
      rated BOOLEAN NOT NULL DEFAULT FALSE,
      max_players INT NOT NULL DEFAULT 64,
      min_players INT NOT NULL DEFAULT 2,
      win_points FLOAT NOT NULL DEFAULT 1.0,
      draw_points FLOAT NOT NULL DEFAULT 0.5,
      loss_points FLOAT NOT NULL DEFAULT 0.0,
      bye_points FLOAT NOT NULL DEFAULT 1.0,
      total_rounds INT NOT NULL DEFAULT 3,
      current_round INT NOT NULL DEFAULT 0,
      start_at TIMESTAMP NULL,
      end_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS tournament_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tournament_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      score FLOAT NOT NULL DEFAULT 0.0,
      tiebreak_score FLOAT NOT NULL DEFAULT 0.0,
      wins INT NOT NULL DEFAULT 0,
      draws INT NOT NULL DEFAULT 0,
      losses INT NOT NULL DEFAULT 0,
      games_played INT NOT NULL DEFAULT 0,
      byes_count INT NOT NULL DEFAULT 0,
      withdrawn BOOLEAN NOT NULL DEFAULT FALSE,
      seed INT NULL,
      \`rank\` INT NULL,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_tournament_user (tournament_id, user_id)
    );`,
    `CREATE TABLE IF NOT EXISTS tournament_games (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tournament_id VARCHAR(36) NOT NULL,
      game_id VARCHAR(36) NOT NULL,
      round_number INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_tournament_game (tournament_id, game_id)
    );`,
    `CREATE TABLE IF NOT EXISTS tournament_rounds (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tournament_id VARCHAR(36) NOT NULL,
      round_number INT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      started_at TIMESTAMP NULL,
      finished_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_tournament_round (tournament_id, round_number)
    );`,
    `CREATE TABLE IF NOT EXISTS tournament_pairings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tournament_id VARCHAR(36) NOT NULL,
      round_id INT NOT NULL,
      round_number INT NOT NULL,
      white_user_id VARCHAR(36) NOT NULL,
      black_user_id VARCHAR(36) NULL,
      game_id VARCHAR(36) NULL,
      is_bye BOOLEAN NOT NULL DEFAULT FALSE,
      result VARCHAR(16) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS friendships (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requester_id VARCHAR(36) NOT NULL,
      recipient_id VARCHAR(36) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_friend_pair (requester_id, recipient_id)
    );`,
    `CREATE TABLE IF NOT EXISTS challenges (
      id VARCHAR(36) PRIMARY KEY,
      challenger_id VARCHAR(36) NOT NULL,
      challenged_id VARCHAR(36) NOT NULL,
      rating_type VARCHAR(16) NOT NULL DEFAULT 'blitz',
      time_control VARCHAR(32) NOT NULL DEFAULT '5+0',
      color_preference VARCHAR(8) NOT NULL DEFAULT 'random',
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      game_id VARCHAR(36) NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS game_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      game_id VARCHAR(36) NOT NULL,
      event_type VARCHAR(32) NOT NULL,
      user_id VARCHAR(36) NULL,
      ply INT NULL,
      metadata JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS fair_play_analyses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      game_id VARCHAR(36) NOT NULL UNIQUE,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      engine_correlation FLOAT NULL,
      average_centipawn_loss FLOAT NULL,
      accuracy_score FLOAT NULL,
      timing_score FLOAT NULL,
      complexity_score FLOAT NULL,
      suspicion_score FLOAT NULL,
      signals JSON NULL,
      analysis_version VARCHAR(16) NOT NULL DEFAULT '1.0',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );`
  ];

  for (const q of tableQueries) {
    await dbPool.query(q);
  }

  // Column addition check for existing games, users, tournaments & entries tables
  try {
    await dbPool.query(`ALTER TABLE games ADD COLUMN rated BOOLEAN NOT NULL DEFAULT TRUE;`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE games ADD COLUMN tournament_id VARCHAR(36) NULL;`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'PLAYER';`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE tournaments ADD COLUMN organizer_id VARCHAR(36) NULL;`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE tournaments ADD COLUMN description TEXT NULL;`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE tournaments ADD COLUMN duration_minutes INT NOT NULL DEFAULT 60;`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE tournaments ADD COLUMN min_players INT NOT NULL DEFAULT 2;`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE tournament_entries ADD COLUMN withdrawn BOOLEAN NOT NULL DEFAULT FALSE;`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE tournament_entries ADD COLUMN tiebreak_score FLOAT NOT NULL DEFAULT 0.0;`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE tournament_entries ADD COLUMN byes_count INT NOT NULL DEFAULT 0;`);
  } catch {}
  try {
    await dbPool.query(`ALTER TABLE tournament_entries ADD COLUMN seed INT NULL;`);
  } catch {}

  // Idempotent Index Creation
  const indexQueries = [
    `CREATE INDEX idx_games_white ON games (white_player_id);`,
    `CREATE INDEX idx_games_black ON games (black_player_id);`,
    `CREATE INDEX idx_games_status ON games (status);`,
    `CREATE INDEX idx_games_rated ON games (rated);`,
    `CREATE INDEX idx_games_tournament ON games (tournament_id);`,
    `CREATE INDEX idx_rating_history_user ON rating_history (user_id);`,
    `CREATE INDEX idx_rating_history_game ON rating_history (game_id);`,
    `CREATE INDEX idx_moves_game_ply ON game_moves (game_id, ply);`,
    `CREATE INDEX idx_user_ratings_leaderboard ON user_ratings (rating_type, rating DESC, games_played DESC, user_id ASC);`,
    `CREATE INDEX idx_tournament_entries_tourn ON tournament_entries (tournament_id, score DESC);`,
    `CREATE INDEX idx_tournaments_organizer ON tournaments (organizer_id);`,
    `CREATE INDEX idx_tournaments_status ON tournaments (status);`,
    `CREATE INDEX idx_games_tournament ON games (tournament_id);`,
    `CREATE INDEX idx_rating_history_user ON rating_history (user_id);`,
    `CREATE INDEX idx_rating_history_game ON rating_history (game_id);`,
    `CREATE INDEX idx_moves_game_ply ON game_moves (game_id, ply);`,
    `CREATE INDEX idx_user_ratings_leaderboard ON user_ratings (rating_type, rating DESC, games_played DESC, user_id ASC);`,
    `CREATE INDEX idx_tournament_entries_tourn ON tournament_entries (tournament_id, score DESC);`,
    `CREATE INDEX idx_users_role ON users (role);`,
    `CREATE INDEX idx_friendships_requester ON friendships (requester_id, status);`,
    `CREATE INDEX idx_friendships_recipient ON friendships (recipient_id, status);`,
    `CREATE INDEX idx_challenges_challenger ON challenges (challenger_id, status);`,
    `CREATE INDEX idx_challenges_challenged ON challenges (challenged_id, status);`,
    `CREATE INDEX idx_game_events_game ON game_events (game_id, created_at);`,
    `CREATE INDEX idx_fair_play_game ON fair_play_analyses (game_id);`
  ];

  for (const idxQ of indexQueries) {
    try {
      await dbPool.query(idxQ);
    } catch (err) {
      if (err.errno !== 1061 && !err.message.includes('Duplicate key') && !err.message.includes('already exists')) {
        console.warn('[Database] Index migration notice:', err.message);
      }
    }
  }
}

export function getPool() {
  return pool;
}

export function isUsingMysql() {
  return isMysqlConnected;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    isMysqlConnected = false;
  }
}

export function _setPoolForTesting(mockPool, mockConnected = true) {
  pool = mockPool;
  isMysqlConnected = mockConnected;
}

