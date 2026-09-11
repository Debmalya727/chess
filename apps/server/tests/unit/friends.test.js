import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, inMemoryDb } from '../../src/db/index.js';
import { createUser } from '../../src/db/userRepository.js';
import {
  sendFriendRequest,
  getFriendRequests,
  getFriendshipById,
  updateFriendshipStatus,
  getFriends,
  deleteFriendship,
  blockUser,
  unblockUser,
  isBlocked,
  getBlockedUsers
} from '../../src/db/friendRepository.js';

test('Social Graph & Friends Unit Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();

  const userA = await createUser({ id: 'u_fa_1', username: 'PlayerA', email: 'pa@test.com', passwordHash: 'hash', rating: 1500 });
  const userB = await createUser({ id: 'u_fb_2', username: 'PlayerB', email: 'pb@test.com', passwordHash: 'hash', rating: 1550 });
  const userC = await createUser({ id: 'u_fc_3', username: 'PlayerC', email: 'pc@test.com', passwordHash: 'hash', rating: 1600 });

  await t.test('Prevents sending friend request to self', async () => {
    const res = await sendFriendRequest(userA.id, userA.id);
    assert.ok(res.error);
    assert.equal(res.error, 'CANNOT_FRIEND_SELF');
  });

  let requestId = null;

  await t.test('User A sends friend request to User B', async () => {
    const res = await sendFriendRequest(userA.id, userB.id);
    assert.ok(!res.error, `Unexpected error: ${res.error}`);
    assert.equal(res.status, 'pending');
    requestId = res.id;

    const requestsB = await getFriendRequests(userB.id);
    assert.equal(requestsB.incoming.length, 1);
    assert.equal(requestsB.incoming[0].username, 'PlayerA');

    const requestsA = await getFriendRequests(userA.id);
    assert.equal(requestsA.outgoing.length, 1);
    assert.equal(requestsA.outgoing[0].username, 'PlayerB');
  });

  await t.test('Prevents duplicate pending friend request', async () => {
    const res = await sendFriendRequest(userA.id, userB.id);
    assert.ok(res.error);
    assert.equal(res.error, 'FRIEND_REQUEST_PENDING');
  });

  await t.test('User B accepts friend request from User A', async () => {
    const updateSuccess = await updateFriendshipStatus(requestId, 'accepted');
    assert.equal(updateSuccess, true);

    const friendsA = await getFriends(userA.id);
    const friendsB = await getFriends(userB.id);

    assert.equal(friendsA.length, 1);
    assert.equal(friendsA[0].username, 'PlayerB');
    assert.equal(friendsB.length, 1);
    assert.equal(friendsB[0].username, 'PlayerA');
  });

  await t.test('User A removes User B from friends', async () => {
    const delSuccess = await deleteFriendship(userA.id, userB.id);
    assert.equal(delSuccess, true);

    const friendsA = await getFriends(userA.id);
    assert.equal(friendsA.length, 0);
  });

  await t.test('Blocking prevents social interaction', async () => {
    const blockRes = await blockUser(userA.id, userC.id);
    assert.ok(!blockRes.error);

    const blockedAC = await isBlocked(userA.id, userC.id);
    const blockedCA = await isBlocked(userC.id, userA.id);
    assert.equal(blockedAC, true);
    assert.equal(blockedCA, true);

    // C tries to friend A -> rejected due to block
    const friendRes = await sendFriendRequest(userC.id, userA.id);
    assert.equal(friendRes.error, 'USER_BLOCKED');

    // Check blocked list
    const blockedList = await getBlockedUsers(userA.id);
    assert.equal(blockedList.length, 1);
    assert.equal(blockedList[0].username, 'PlayerC');

    // Unblock
    const unblockRes = await unblockUser(userA.id, userC.id);
    assert.equal(unblockRes, true);

    const afterUnblock = await isBlocked(userA.id, userC.id);
    assert.equal(afterUnblock, false);
  });
});
