import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../../src/db/index.js';
import { createUser } from '../../src/db/userRepository.js';
import { blockUser } from '../../src/db/friendRepository.js';
import { ChallengeService } from '../../src/challenges/challengeService.js';
import { getChallengeById } from '../../src/db/challengeRepository.js';

test('Direct Challenges Unit Tests', async (t) => {
  process.env.DB_MODE = 'memory';
  await initDb();

  const challengeService = new ChallengeService();

  const challenger = await createUser({ id: 'u_chal_1', username: 'Challenger1', email: 'ch1@test.com', passwordHash: 'hash', rating: 1500 });
  const challenged = await createUser({ id: 'u_chal_2', username: 'Challenged2', email: 'ch2@test.com', passwordHash: 'hash', rating: 1520 });
  const blockedUser = await createUser({ id: 'u_chal_3', username: 'Blocked3', email: 'ch3@test.com', passwordHash: 'hash', rating: 1400 });

  await blockUser(challenger.id, blockedUser.id);

  await t.test('Cannot challenge self', async () => {
    const res = await challengeService.createDirectChallenge({
      challenger,
      targetUsername: challenger.username,
      timeControl: '5+0'
    });
    assert.equal(res.error, 'CANNOT_CHALLENGE_SELF');
  });

  await t.test('Cannot challenge blocked user', async () => {
    const res = await challengeService.createDirectChallenge({
      challenger,
      targetUsername: blockedUser.username,
      timeControl: '5+0'
    });
    assert.equal(res.error, 'USER_BLOCKED');
  });

  let createdChallenge = null;

  await t.test('Successfully creates challenge to valid user', async () => {
    const res = await challengeService.createDirectChallenge({
      challenger,
      targetUsername: challenged.username,
      timeControl: '5+0',
      colorPreference: 'w'
    });
    assert.ok(!res.error);
    assert.ok(res.id);
    assert.equal(res.status, 'pending');
    assert.equal(res.ratingType, 'blitz');
    createdChallenge = res;
  });

  await t.test('Challenged user accepts challenge -> creates game and room', async () => {
    const acceptRes = await challengeService.acceptChallenge(createdChallenge.id, challenged);
    assert.ok(acceptRes.success);
    assert.ok(acceptRes.gameId);
    assert.ok(acceptRes.roomCode);

    const updated = await getChallengeById(createdChallenge.id);
    assert.equal(updated.status, 'accepted');
    assert.equal(updated.gameId, acceptRes.gameId);
  });

  await t.test('Accepting already resolved challenge fails gracefully', async () => {
    const res = await challengeService.acceptChallenge(createdChallenge.id, challenged);
    assert.equal(res.error, 'CHALLENGE_ALREADY_RESOLVED');
  });

  await t.test('Declining a challenge updates status to declined', async () => {
    // Clear active room from previous accepted match
    const { globalRoomManager } = await import('../../src/rooms/roomManager.js');
    const { inMemoryDb } = await import('../../src/db/index.js');
    globalRoomManager.roomsById.clear();
    globalRoomManager.roomsByCode.clear();
    inMemoryDb.games.clear();

    const freshChal = await challengeService.createDirectChallenge({
      challenger,
      targetUsername: challenged.username,
      timeControl: '3+0'
    });
    assert.ok(freshChal.id);

    const decRes = await challengeService.declineChallenge(freshChal.id, challenged);
    assert.equal(decRes.success, true);

    const updated = await getChallengeById(freshChal.id);
    assert.equal(updated.status, 'declined');
  });
});
