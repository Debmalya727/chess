import { getPool, isUsingMysql, inMemoryDb } from './index.js';

export async function createUser(user) {
  const id = user.id || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const role = user.role || 'PLAYER';
  const userWithRole = { ...user, id, role };
  if (isUsingMysql()) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, rating, role) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, user.username, user.email, user.passwordHash, user.rating || 1200, role]
    );
    return userWithRole;
  } else {
    inMemoryDb.users.set(id, userWithRole);
    inMemoryDb.usersByEmail.set(user.email.toLowerCase(), userWithRole);
    inMemoryDb.usersByUsername.set(user.username.toLowerCase(), userWithRole);

    // Cache user account in Redis for multi-instance consistency
    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const json = JSON.stringify(userWithRole);
        await client.set(`chess:user:account:${user.id}`, json, 'EX', 86400);
        await client.set(`chess:user:by_username:${user.username.toLowerCase()}`, json, 'EX', 86400);
        await client.set(`chess:user:by_email:${user.email.toLowerCase()}`, json, 'EX', 86400);
      }
    } catch {}

    return userWithRole;
  }
}

export async function findUserByEmail(email) {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM users WHERE LOWER(email) = ?`, [clean]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      passwordHash: r.password_hash,
      rating: r.rating,
      role: r.role || 'PLAYER',
      createdAt: r.created_at
    };
  } else {
    const u = inMemoryDb.usersByEmail.get(clean);
    if (u) return { ...u, role: u.role || 'PLAYER' };

    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const raw = await client.get(`chess:user:by_email:${clean}`);
        if (raw) {
          const userObj = JSON.parse(raw);
          inMemoryDb.users.set(userObj.id, userObj);
          inMemoryDb.usersByEmail.set(clean, userObj);
          return { ...userObj, role: userObj.role || 'PLAYER' };
        }
      }
    } catch {}

    return null;
  }
}

export async function findUserByUsername(username) {
  if (!username) return null;
  const clean = username.trim().toLowerCase();
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM users WHERE LOWER(username) = ?`, [clean]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      passwordHash: r.password_hash,
      rating: r.rating,
      role: r.role || 'PLAYER',
      createdAt: r.created_at
    };
  } else {
    const u = inMemoryDb.usersByUsername.get(clean);
    if (u) return { ...u, role: u.role || 'PLAYER' };

    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const raw = await client.get(`chess:user:by_username:${clean}`);
        if (raw) {
          const userObj = JSON.parse(raw);
          inMemoryDb.users.set(userObj.id, userObj);
          inMemoryDb.usersByUsername.set(clean, userObj);
          return { ...userObj, role: userObj.role || 'PLAYER' };
        }
      }
    } catch {}

    return null;
  }
}

export async function findUserById(id) {
  if (!id) return null;
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM users WHERE id = ?`, [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      username: r.username,
      email: r.email,
      passwordHash: r.password_hash,
      rating: r.rating,
      role: r.role || 'PLAYER',
      createdAt: r.created_at
    };
  } else {
    const u = inMemoryDb.users.get(id);
    if (u) return { ...u, role: u.role || 'PLAYER' };

    try {
      const { isRedisConnected, getRedisClient } = await import('../redis/redisClient.js');
      if (isRedisConnected()) {
        const client = getRedisClient();
        const raw = await client.get(`chess:user:account:${id}`);
        if (raw) {
          const userObj = JSON.parse(raw);
          inMemoryDb.users.set(userObj.id, userObj);
          return { ...userObj, role: userObj.role || 'PLAYER' };
        }
      }
    } catch {}

    return null;
  }
}

export async function updateUserRole(userId, newRole) {
  if (!userId || !newRole) return false;
  if (isUsingMysql()) {
    const pool = getPool();
    await pool.query(`UPDATE users SET role = ? WHERE id = ?`, [newRole, userId]);
    return true;
  } else {
    const u = inMemoryDb.users.get(userId);
    if (u) {
      u.role = newRole;
      return true;
    }
    return false;
  }
}
