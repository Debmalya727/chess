import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WS_EVENTS,
  ERROR_CODES,
  validateRematchPayload,
  validateRematchRespondPayload,
  validateRematchCancelPayload
} from '../src/index.js';

test('Protocol Rematch Constants & Schemas Tests', async (t) => {
  await t.test('WS_EVENTS contains all required rematch events', () => {
    assert.equal(WS_EVENTS.GAME_REMATCH, 'game:rematch');
    assert.equal(WS_EVENTS.REMATCH_RESPOND, 'game:rematch:respond');
    assert.equal(WS_EVENTS.REMATCH_CANCEL, 'game:rematch:cancel');
    assert.equal(WS_EVENTS.REMATCH_OFFERED, 'rematch:offered');
    assert.equal(WS_EVENTS.REMATCH_DECLINED, 'rematch:declined');
    assert.equal(WS_EVENTS.REMATCH_CANCELLED, 'rematch:cancelled');
    assert.equal(WS_EVENTS.GAME_INIT, 'game:init');
  });

  await t.test('WS_EVENTS has no duplicate event string values', () => {
    const values = Object.values(WS_EVENTS);
    const unique = new Set(values);
    assert.equal(values.length, unique.size, 'Duplicate event values found in WS_EVENTS');
  });

  await t.test('ERROR_CODES contains all required rematch error codes', () => {
    assert.equal(ERROR_CODES.GAME_NOT_FINISHED, 'GAME_NOT_FINISHED');
    assert.equal(ERROR_CODES.TOURNAMENT_REMATCH_NOT_ALLOWED, 'TOURNAMENT_REMATCH_NOT_ALLOWED');
    assert.equal(ERROR_CODES.REMATCH_ALREADY_PENDING, 'REMATCH_ALREADY_PENDING');
    assert.equal(ERROR_CODES.REMATCH_ALREADY_RESOLVED, 'REMATCH_ALREADY_RESOLVED');
    assert.equal(ERROR_CODES.REMATCH_NOT_FOUND, 'REMATCH_NOT_FOUND');
    assert.equal(ERROR_CODES.REMATCH_EXPIRED, 'REMATCH_EXPIRED');
  });

  await t.test('ERROR_CODES has no duplicate string values', () => {
    const values = Object.values(ERROR_CODES);
    const unique = new Set(values);
    assert.equal(values.length, unique.size, 'Duplicate error code values found in ERROR_CODES');
  });

  await t.test('validateRematchPayload validates gameId correctly', () => {
    assert.equal(validateRematchPayload().isValid, false);
    assert.equal(validateRematchPayload({}).isValid, false);
    assert.equal(validateRematchPayload({ gameId: 123 }).isValid, false);
    assert.equal(validateRematchPayload({ gameId: '' }).isValid, false);

    const valid = validateRematchPayload({ gameId: 'g_123' });
    assert.equal(valid.isValid, true);
    assert.equal(valid.sanitized.gameId, 'g_123');
  });

  await t.test('validateRematchRespondPayload validates gameId and accept boolean', () => {
    assert.equal(validateRematchRespondPayload().isValid, false);
    assert.equal(validateRematchRespondPayload({ gameId: 'g_123' }).isValid, false);
    assert.equal(validateRematchRespondPayload({ gameId: 'g_123', accept: 'yes' }).isValid, false);
    assert.equal(validateRematchRespondPayload({ accept: true }).isValid, false);

    const validAccept = validateRematchRespondPayload({ gameId: 'g_123', accept: true });
    assert.equal(validAccept.isValid, true);
    assert.equal(validAccept.sanitized.gameId, 'g_123');
    assert.equal(validAccept.sanitized.accept, true);

    const validDecline = validateRematchRespondPayload({ gameId: 'g_123', accept: false });
    assert.equal(validDecline.isValid, true);
    assert.equal(validDecline.sanitized.accept, false);
  });

  await t.test('validateRematchCancelPayload validates gameId correctly', () => {
    assert.equal(validateRematchCancelPayload().isValid, false);
    assert.equal(validateRematchCancelPayload({}).isValid, false);

    const valid = validateRematchCancelPayload({ gameId: 'g_123' });
    assert.equal(valid.isValid, true);
    assert.equal(valid.sanitized.gameId, 'g_123');
  });
});
