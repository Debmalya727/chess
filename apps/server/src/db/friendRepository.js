import { getPool, isUsingMysql, inMemoryDb } from './index.js';
import { findUserById } from './userRepository.js';

export async function getFriendship(userIdA, userIdB) {
  if (!userIdA || !userIdB) return null;
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM friendships 
       WHERE (requester_id = ? AND recipient_id = ?) 
          OR (requester_id = ? AND recipient_id = ?)`,
      [userIdA, userIdB, userIdB, userIdA]
    );
    return rows.length > 0 ? rows[0] : null;
  } else {
    return inMemoryDb.friendships.find(f => 
      (f.requesterId === userIdA && f.recipientId === userIdB) ||
      (f.requesterId === userIdB && f.recipientId === userIdA)
    ) || null;
  }
}

export async function getFriendshipById(id) {
  if (!id) return null;
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM friendships WHERE id = ?`, [id]);
    return rows.length > 0 ? rows[0] : null;
  } else {
    return inMemoryDb.friendships.find(f => f.id === parseInt(id, 10) || f.id === id) || null;
  }
}

export async function isBlocked(userIdA, userIdB) {
  if (!userIdA || !userIdB) return false;
  const rel = await getFriendship(userIdA, userIdB);
  if (!rel) return false;
  return rel.status === 'blocked';
}

export async function sendFriendRequest(requesterId, recipientId) {
  if (requesterId === recipientId) {
    return { error: 'CANNOT_FRIEND_SELF', message: 'You cannot send a friend request to yourself.' };
  }

  const existing = await getFriendship(requesterId, recipientId);
  if (existing) {
    if (existing.status === 'blocked') {
      return { error: 'USER_BLOCKED', message: 'Unable to interact with this user.' };
    }
    if (existing.status === 'accepted') {
      return { error: 'ALREADY_FRIENDS', message: 'You are already friends with this user.' };
    }
    if (existing.status === 'pending') {
      return { error: 'FRIEND_REQUEST_PENDING', message: 'A friend request is already pending.' };
    }
  }

  const now = new Date();
  if (isUsingMysql()) {
    const pool = getPool();
    const [res] = await pool.query(
      `INSERT INTO friendships (requester_id, recipient_id, status, created_at, updated_at)
       VALUES (?, ?, 'pending', NOW(), NOW())
       ON DUPLICATE KEY UPDATE status = 'pending', requester_id = VALUES(requester_id), recipient_id = VALUES(recipient_id), updated_at = NOW()`,
      [requesterId, recipientId]
    );
    return { id: res.insertId, requesterId, recipientId, status: 'pending', createdAt: now.toISOString() };
  } else {
    if (existing) {
      existing.requesterId = requesterId;
      existing.recipientId = recipientId;
      existing.status = 'pending';
      existing.updatedAt = now.toISOString();
      return existing;
    }
    const newFriendship = {
      id: inMemoryDb.friendships.length + 1,
      requesterId,
      recipientId,
      status: 'pending',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    inMemoryDb.friendships.push(newFriendship);
    return newFriendship;
  }
}

export async function updateFriendshipStatus(id, status) {
  const now = new Date();
  if (isUsingMysql()) {
    const pool = getPool();
    await pool.query(
      `UPDATE friendships SET status = ?, updated_at = NOW() WHERE id = ?`,
      [status, id]
    );
    return true;
  } else {
    const f = inMemoryDb.friendships.find(item => item.id === parseInt(id, 10) || item.id === id);
    if (f) {
      f.status = status;
      f.updatedAt = now.toISOString();
      return true;
    }
    return false;
  }
}

export async function deleteFriendship(userIdA, userIdB) {
  if (isUsingMysql()) {
    const pool = getPool();
    await pool.query(
      `DELETE FROM friendships 
       WHERE (requester_id = ? AND recipient_id = ?) 
          OR (requester_id = ? AND recipient_id = ?)`,
      [userIdA, userIdB, userIdB, userIdA]
    );
    return true;
  } else {
    const idx = inMemoryDb.friendships.findIndex(f => 
      (f.requesterId === userIdA && f.recipientId === userIdB) ||
      (f.requesterId === userIdB && f.recipientId === userIdA)
    );
    if (idx !== -1) {
      inMemoryDb.friendships.splice(idx, 1);
      return true;
    }
    return false;
  }
}

export async function getFriendRequests(userId) {
  if (!userId) return { incoming: [], outgoing: [] };

  if (isUsingMysql()) {
    const pool = getPool();
    const [incomingRows] = await pool.query(
      `SELECT f.id, f.requester_id, f.created_at, u.username, u.avatar_url, u.rating 
       FROM friendships f 
       JOIN users u ON f.requester_id = u.id 
       WHERE f.recipient_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    const [outgoingRows] = await pool.query(
      `SELECT f.id, f.recipient_id, f.created_at, u.username, u.avatar_url, u.rating 
       FROM friendships f 
       JOIN users u ON f.recipient_id = u.id 
       WHERE f.requester_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    return {
      incoming: incomingRows.map(r => ({
        id: r.id,
        userId: r.requester_id,
        username: r.username,
        avatarUrl: r.avatar_url,
        rating: r.rating,
        createdAt: r.created_at
      })),
      outgoing: outgoingRows.map(r => ({
        id: r.id,
        userId: r.recipient_id,
        username: r.username,
        avatarUrl: r.avatar_url,
        rating: r.rating,
        createdAt: r.created_at
      }))
    };
  } else {
    const incoming = [];
    const outgoing = [];

    for (const f of inMemoryDb.friendships) {
      if (f.status === 'pending') {
        if (f.recipientId === userId) {
          const u = inMemoryDb.users.get(f.requesterId);
          if (u) {
            incoming.push({
              id: f.id,
              userId: u.id,
              username: u.username,
              avatarUrl: u.avatarUrl,
              rating: u.rating,
              createdAt: f.createdAt
            });
          }
        } else if (f.requesterId === userId) {
          const u = inMemoryDb.users.get(f.recipientId);
          if (u) {
            outgoing.push({
              id: f.id,
              userId: u.id,
              username: u.username,
              avatarUrl: u.avatarUrl,
              rating: u.rating,
              createdAt: f.createdAt
            });
          }
        }
      }
    }

    return { incoming, outgoing };
  }
}

export async function getFriends(userId) {
  if (!userId) return [];

  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT f.id, f.created_at as friendship_date,
              CASE WHEN f.requester_id = ? THEN f.recipient_id ELSE f.requester_id END as friend_id,
              u.username, u.avatar_url, u.rating
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.recipient_id ELSE f.requester_id END
       WHERE (f.requester_id = ? OR f.recipient_id = ?) AND f.status = 'accepted'
       ORDER BY u.username ASC`,
      [userId, userId, userId, userId]
    );

    return rows.map(r => ({
      friendshipId: r.id,
      userId: r.friend_id,
      username: r.username,
      avatarUrl: r.avatar_url,
      rating: r.rating,
      friendshipDate: r.friendship_date
    }));
  } else {
    const friends = [];
    for (const f of inMemoryDb.friendships) {
      if (f.status === 'accepted') {
        let friendId = null;
        if (f.requesterId === userId) friendId = f.recipientId;
        else if (f.recipientId === userId) friendId = f.requesterId;

        if (friendId) {
          const u = inMemoryDb.users.get(friendId);
          if (u) {
            friends.push({
              friendshipId: f.id,
              userId: u.id,
              username: u.username,
              avatarUrl: u.avatarUrl,
              rating: u.rating,
              friendshipDate: f.createdAt
            });
          }
        }
      }
    }
    return friends.sort((a, b) => a.username.localeCompare(b.username));
  }
}

export async function blockUser(userId, targetUserId) {
  if (userId === targetUserId) {
    return { error: 'CANNOT_BLOCK_SELF', message: 'You cannot block yourself.' };
  }

  const existing = await getFriendship(userId, targetUserId);
  const now = new Date();

  if (isUsingMysql()) {
    const pool = getPool();
    if (existing) {
      await pool.query(
        `UPDATE friendships SET requester_id = ?, recipient_id = ?, status = 'blocked', updated_at = NOW() WHERE id = ?`,
        [userId, targetUserId, existing.id]
      );
    } else {
      await pool.query(
        `INSERT INTO friendships (requester_id, recipient_id, status, created_at, updated_at) VALUES (?, ?, 'blocked', NOW(), NOW())`,
        [userId, targetUserId]
      );
    }
    return { success: true };
  } else {
    if (existing) {
      existing.requesterId = userId;
      existing.recipientId = targetUserId;
      existing.status = 'blocked';
      existing.updatedAt = now.toISOString();
    } else {
      inMemoryDb.friendships.push({
        id: inMemoryDb.friendships.length + 1,
        requesterId: userId,
        recipientId: targetUserId,
        status: 'blocked',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      });
    }
    return { success: true };
  }
}

export async function unblockUser(userId, targetUserId) {
  const existing = await getFriendship(userId, targetUserId);
  if (!existing || existing.status !== 'blocked') {
    return { error: 'NOT_BLOCKED', message: 'User is not blocked.' };
  }

  // Only the blocking user can unblock
  const isBlocker = (existing.requester_id || existing.requesterId) === userId;
  if (!isBlocker) {
    return { error: 'NOT_BLOCKED', message: 'User is not blocked by you.' };
  }

  return deleteFriendship(userId, targetUserId);
}

export async function getBlockedUsers(userId) {
  if (!userId) return [];
  if (isUsingMysql()) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT f.id, f.recipient_id, f.updated_at, u.username, u.avatar_url
       FROM friendships f
       JOIN users u ON f.recipient_id = u.id
       WHERE f.requester_id = ? AND f.status = 'blocked'`,
      [userId]
    );
    return rows.map(r => ({
      id: r.id,
      userId: r.recipient_id,
      username: r.username,
      avatarUrl: r.avatar_url,
      blockedAt: r.updated_at
    }));
  } else {
    const list = [];
    for (const f of inMemoryDb.friendships) {
      if (f.requesterId === userId && f.status === 'blocked') {
        const u = inMemoryDb.users.get(f.recipientId);
        if (u) {
          list.push({
            id: f.id,
            userId: u.id,
            username: u.username,
            avatarUrl: u.avatarUrl,
            blockedAt: f.updatedAt
          });
        }
      }
    }
    return list;
  }
}
