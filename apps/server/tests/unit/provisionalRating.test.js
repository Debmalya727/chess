import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVISIONAL_GAMES_THRESHOLD, isProvisional, enrichRatingWithProvisional } from '../../src/ratings/provisionalService.js';

test('Provisional Rating Unit Tests', async (t) => {
  await t.test('Threshold constant is 20', () => {
    assert.equal(PROVISIONAL_GAMES_THRESHOLD, 20);
  });

  await t.test('Correctly identifies provisional vs established boundaries', () => {
    assert.equal(isProvisional(0), true);
    assert.equal(isProvisional(1), true);
    assert.equal(isProvisional(19), true);
    assert.equal(isProvisional(20), false);
    assert.equal(isProvisional(21), false);
    assert.equal(isProvisional(100), false);
  });

  await t.test('Enriches rating object with provisional metadata', () => {
    const newPlayerRating = { rating: 1500, gamesPlayed: 5 };
    const enrichedNew = enrichRatingWithProvisional(newPlayerRating);
    assert.equal(enrichedNew.isProvisional, true);
    assert.equal(enrichedNew.status, 'provisional');

    const seasonedRating = { rating: 1840, gamesPlayed: 45 };
    const enrichedSeasoned = enrichRatingWithProvisional(seasonedRating);
    assert.equal(enrichedSeasoned.isProvisional, false);
    assert.equal(enrichedSeasoned.status, 'established');
  });
});
