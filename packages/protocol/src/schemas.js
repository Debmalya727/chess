export function validateMoveSubmitPayload(payload = {}) {
  const forbiddenKeys = ['fen', 'clock', 'clocks', 'result', 'winner', 'rating', 'color', 'turn', 'status'];
  for (const k of forbiddenKeys) {
    if (k in payload) {
      return { isValid: false, error: 'UNAUTHORIZED_FIELD', message: `Field '${k}' cannot be submitted by client.` };
    }
  }

  const { gameId, from, to, promotion, clientMoveId, expectedStateVersion } = payload;
  if (!gameId || typeof gameId !== 'string') {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Valid gameId string is required.' };
  }
  if (!from || typeof from !== 'string' || !/^[a-h][1-8]$/.test(from)) {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Valid from square (e.g. e2) is required.' };
  }
  if (!to || typeof to !== 'string' || !/^[a-h][1-8]$/.test(to)) {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Valid to square (e.g. e4) is required.' };
  }
  if (promotion && !['q', 'r', 'b', 'n'].includes(promotion.toLowerCase())) {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Promotion piece must be q, r, b, or n.' };
  }

  const parsedVersion = typeof expectedStateVersion === 'number' ? expectedStateVersion : (expectedStateVersion ? parseInt(expectedStateVersion, 10) : undefined);

  return {
    isValid: true,
    sanitized: {
      gameId,
      from,
      to,
      promotion: promotion ? promotion.toLowerCase() : null,
      clientMoveId: clientMoveId || `mov_${Date.now()}`,
      expectedStateVersion: Number.isFinite(parsedVersion) ? parsedVersion : undefined
    }
  };
}

export function validateRoomCreatePayload(payload = {}) {
  const { timeControl = '10+0', colorPreference = 'random' } = payload;
  const validTCs = ['1+0', '3+0', '3+2', '5+0', '5+3', '10+0', '15+10', '30+0'];
  const validColors = ['w', 'b', 'random'];

  if (!validTCs.includes(timeControl)) {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Invalid time control format.' };
  }
  if (!validColors.includes(colorPreference)) {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Invalid color preference.' };
  }

  return { isValid: true, sanitized: { timeControl, colorPreference } };
}

export function validateQueueJoinPayload(payload = {}) {
  const { timeControl = '10+0' } = payload;
  const validTCs = ['1+0', '3+0', '3+2', '5+0', '5+3', '10+0', '15+10', '30+0'];

  if (!validTCs.includes(timeControl)) {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Invalid time control format for matchmaking.' };
  }

  return { isValid: true, sanitized: { timeControl } };
}

export function validateRoomJoinPayload(payload = {}) {
  const { roomCode, gameId } = payload;
  const identifier = roomCode || gameId;
  if (!identifier || typeof identifier !== 'string') {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Room code or Game ID is required.' };
  }
  return { isValid: true, sanitized: { roomCode: roomCode ? roomCode.toUpperCase() : null, gameId } };
}

export function validateDrawRespondPayload(payload = {}) {
  const { gameId, accept } = payload;
  if (!gameId || typeof gameId !== 'string') {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Game ID is required.' };
  }
  if (typeof accept !== 'boolean') {
    return { isValid: false, error: 'INVALID_INPUT', message: 'Accept must be a boolean.' };
  }
  return { isValid: true, sanitized: { gameId, accept } };
}
