import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getRatingCategory, calculateElo } from '../../src/ratings/ratingService.js';

describe('Rating Service Unit Tests', () => {
  test('categorizes time controls correctly', () => {
    assert.strictEqual(getRatingCategory('1+0'), 'bullet');
    assert.strictEqual(getRatingCategory('2+1'), 'bullet');
    assert.strictEqual(getRatingCategory('3+0'), 'blitz');
    assert.strictEqual(getRatingCategory('5+0'), 'blitz');
    assert.strictEqual(getRatingCategory('10+0'), 'rapid');
    assert.strictEqual(getRatingCategory('15+10'), 'rapid');
    assert.strictEqual(getRatingCategory('30+0'), 'classical');
  });

  test('calculates Elo correctly for equal ratings on white win', () => {
    const res = calculateElo(1500, 1500, 1, 32);
    assert.strictEqual(res.playerA.oldRating, 1500);
    assert.strictEqual(res.playerA.newRating, 1516);
    assert.strictEqual(res.playerA.change, 16);

    assert.strictEqual(res.playerB.oldRating, 1500);
    assert.strictEqual(res.playerB.newRating, 1484);
    assert.strictEqual(res.playerB.change, -16);
  });

  test('calculates Elo correctly for equal ratings on draw', () => {
    const res = calculateElo(1500, 1500, 0.5, 32);
    assert.strictEqual(res.playerA.newRating, 1500);
    assert.strictEqual(res.playerB.newRating, 1500);
    assert.strictEqual(res.playerA.change, 0);
    assert.strictEqual(res.playerB.change, 0);
  });

  test('calculates Elo correctly for higher rated player winning', () => {
    const res = calculateElo(1600, 1400, 1, 32);
    // Expected White score = 1 / (1 + 10^(-200/400)) = 1 / (1 + 10^-0.5) = 1 / (1 + 0.316) ~ 0.76
    // Change = 32 * (1 - 0.76) = 7.68 -> rounded to +8
    assert.strictEqual(res.playerA.newRating, 1608);
    assert.strictEqual(res.playerB.newRating, 1392);
  });

  test('calculates Elo correctly for lower rated player upsetting higher rated player', () => {
    const res = calculateElo(1400, 1600, 1, 32);
    // Expected White score ~ 0.24
    // Change = 32 * (1 - 0.24) = 24.32 -> rounded to +24
    assert.strictEqual(res.playerA.newRating, 1424);
    assert.strictEqual(res.playerB.newRating, 1576);
  });
});
