import { test, describe } from 'node:test';
import assert from 'node:assert';
import { globalMatchmakingService } from '../../src/matchmaking/matchmakingService.js';
import { globalGameManager } from '../../src/games/gameManager.js';

describe('Matchmaking Service Integration Tests', () => {
  test('pairs two players joining the same queue time control', async () => {
    const messagesA = [];
    const messagesB = [];

    const mockSocketA = {
      id: 'sock_A',
      send: (data) => messagesA.push(JSON.parse(data))
    };

    const mockSocketB = {
      id: 'sock_B',
      send: (data) => messagesB.push(JSON.parse(data))
    };

    const userA = { id: 'user_mm_1', username: 'PlayerMM1' };
    const userB = { id: 'user_mm_2', username: 'PlayerMM2' };

    // Player A joins queue
    const resA = await globalMatchmakingService.joinQueue({
      user: userA,
      socket: mockSocketA,
      timeControl: '10+0'
    });

    assert.strictEqual(resA.matched, false);
    assert.strictEqual(resA.queued, true);

    // Player B joins queue
    const resB = await globalMatchmakingService.joinQueue({
      user: userB,
      socket: mockSocketB,
      timeControl: '10+0'
    });

    assert.strictEqual(resB.matched, true);
    assert.ok(resB.room);
    assert.ok(resB.session);

    // Verify events sent
    assert.strictEqual(messagesA.length, 2);
    assert.strictEqual(messagesB.length, 2);

    const initA = messagesA.find(m => m.event === 'game:init');
    const initB = messagesB.find(m => m.event === 'game:init');


    assert.ok(initA);
    assert.ok(initB);

    assert.notStrictEqual(initA.payload.color, initB.payload.color);
    assert.strictEqual(
      (initA.payload.color === 'w' && initB.payload.color === 'b') ||
      (initA.payload.color === 'b' && initB.payload.color === 'w'),
      true
    );

    // Cleanup game session
    globalGameManager.sessions.delete(resB.room.id);

  });

  test('prevents duplicate queue join', async () => {
    const user = { id: 'user_dup', username: 'DupPlayer' };
    const socket = { id: 'sock_dup', send: () => {} };

    const res1 = await globalMatchmakingService.joinQueue({ user, socket, timeControl: '5+0' });
    assert.strictEqual(res1.queued, true);

    const res2 = await globalMatchmakingService.joinQueue({ user, socket, timeControl: '5+0' });
    assert.ok(
      res2.error === 'ALREADY_IN_MATCHMAKING_QUEUE' || res2.error === 'ALREADY_IN_QUEUE',
      `Expected ALREADY_IN_MATCHMAKING_QUEUE or ALREADY_IN_QUEUE, got: ${res2.error}`
    );

    globalMatchmakingService.leaveQueue(user.id);
  });
});
