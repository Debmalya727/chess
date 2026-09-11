import assert from 'assert';
import { MatchmakingService } from '../../src/matchmaking/matchmakingService.js';
import { globalRoomManager } from '../../src/rooms/roomManager.js';
import { inMemoryDb } from '../../src/db/index.js';

async function runMatchmakingAdvancedTests() {
  console.log('--- ADVANCED MATCHMAKING UNIT TESTS ---');

  const mm = new MatchmakingService();
  const user1 = { id: 'u1', username: 'Player1' };
  const user2 = { id: 'u2', username: 'Player2' };

  inMemoryDb.users.set('u1', user1);
  inMemoryDb.users.set('u2', user2);

  // Test 1: Single Queue Entry Constraint (Duplicate Rejection)
  const res1 = await mm.joinQueue({ user: user1, timeControl: '10+0' });
  assert.strictEqual(res1.queued, true);

  const resDuplicate = await mm.joinQueue({ user: user1, timeControl: '5+0' });
  assert.strictEqual(resDuplicate.error, 'ALREADY_IN_MATCHMAKING_QUEUE');
  console.log('✓ Duplicate queue entry rejection passed');

  // Test 2: Queue Status & Range Expansion
  const status = mm.getQueueStatus('u1');
  assert.strictEqual(status.inQueue, true);
  assert.strictEqual(status.timeControl, '10+0');
  assert.ok(status.minRating <= 1500 && status.maxRating >= 1500);
  console.log('✓ Queue status and rating range expansion passed');

  // Test 3: Active Game Prevention
  const room = globalRoomManager.createRoom({ hostUser: user2, timeControl: '10+0' });
  room.status = 'ACTIVE';
  room.whitePlayerId = 'u2';

  const resInGame = await mm.joinQueue({ user: user2, timeControl: '10+0' });
  assert.strictEqual(resInGame.error, 'PLAYER_ALREADY_IN_GAME');
  console.log('✓ Active game queue prevention passed');

  // Test 4: Queue Cancellation (Idempotent)
  const leave1 = mm.leaveQueue('u1');
  assert.strictEqual(leave1.success, true);
  const leave2 = mm.leaveQueue('u1');
  assert.strictEqual(leave2.error, 'NOT_IN_QUEUE');
  console.log('✓ Idempotent queue cancellation passed');

  room.status = 'FINISHED'; // cleanup test room

  console.log('=== ADVANCED MATCHMAKING TESTS PASSED ===\n');
}

runMatchmakingAdvancedTests().catch(err => {
  console.error('Matchmaking tests failed:', err);
  process.exit(1);
});
