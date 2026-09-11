import crypto from 'crypto';

export class RoomManager {
  constructor() {
    this.roomsByCode = new Map(); // roomCode -> room object
    this.roomsById = new Map();   // roomId -> room object
  }

  generateRoomCode() {
    return 'ROOM_' + crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  createRoom({ hostUser, timeControl = '10+0', colorPreference = 'random' }) {
    const roomId = `game_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let roomCode = this.generateRoomCode();
    while (this.roomsByCode.has(roomCode)) {
      roomCode = this.generateRoomCode();
    }

    let whitePlayerId = null;
    let blackPlayerId = null;

    if (colorPreference === 'w') {
      whitePlayerId = hostUser.id;
    } else if (colorPreference === 'b') {
      blackPlayerId = hostUser.id;
    } else {
      if (Math.random() < 0.5) whitePlayerId = hostUser.id;
      else blackPlayerId = hostUser.id;
    }

    const room = {
      id: roomId,
      roomCode,
      hostUserId: hostUser.id,
      whitePlayerId,
      blackPlayerId,
      timeControl,
      status: 'WAITING', // WAITING -> READY -> ACTIVE -> FINISHED -> CANCELLED
      players: new Map([[hostUser.id, hostUser]]),
      connectedSockets: new Map(), // userId -> socket
      createdAt: new Date().toISOString()
    };

    this.roomsByCode.set(roomCode, room);
    this.roomsById.set(roomId, room);

    import('../db/gameEventRepository.js').then(({ recordGameEvent }) => {
      recordGameEvent({
        gameId: room.id,
        eventType: 'GAME_CREATED',
        userId: hostUser.id,
        metadata: { roomCode, timeControl }
      }).catch(() => {});
    }).catch(() => {});

    return room;
  }

  joinRoom(roomCode, joinUser) {
    const room = this.roomsByCode.get(roomCode);
    if (!room) {
      return { error: 'ROOM_NOT_FOUND', message: 'Room not found.' };
    }

    if (room.status === 'FINISHED' || room.status === 'CANCELLED') {
      return { error: 'GAME_FINISHED', message: 'Game has already ended.' };
    }

    if (room.players.has(joinUser.id)) {
      // Rejoining room
      return { room, color: room.whitePlayerId === joinUser.id ? 'w' : 'b' };
    }

    if (room.players.size >= 2) {
      return { error: 'ROOM_FULL', message: 'Room is full.' };
    }

    room.players.set(joinUser.id, joinUser);

    if (!room.whitePlayerId) {
      room.whitePlayerId = joinUser.id;
    } else if (!room.blackPlayerId) {
      room.blackPlayerId = joinUser.id;
    }

    room.status = 'ACTIVE';

    import('../db/gameEventRepository.js').then(({ recordGameEvent }) => {
      recordGameEvent({
        gameId: room.id,
        eventType: 'PLAYER_JOINED',
        userId: joinUser.id
      }).catch(() => {});
    }).catch(() => {});

    import('../presence/presenceService.js').then(({ globalPresenceService }) => {
      if (room.whitePlayerId) globalPresenceService.setUserPlaying(room.whitePlayerId, true);
      if (room.blackPlayerId) globalPresenceService.setUserPlaying(room.blackPlayerId, true);
    }).catch(() => {});

    const color = room.whitePlayerId === joinUser.id ? 'w' : 'b';
    return { room, color };
  }

  getRoomById(roomId) {
    return this.roomsById.get(roomId) || null;
  }

  getRoomByCode(roomCode) {
    return this.roomsByCode.get(roomCode) || null;
  }

  rehydrateRoomFromDb(dbGame) {
    if (!dbGame) return null;
    let room = this.roomsById.get(dbGame.id) || this.roomsByCode.get(dbGame.roomCode);
    if (room) return room;

    room = {
      id: dbGame.id,
      roomCode: dbGame.roomCode,
      hostUserId: dbGame.whitePlayerId || dbGame.blackPlayerId,
      whitePlayerId: dbGame.whitePlayerId,
      blackPlayerId: dbGame.blackPlayerId,
      timeControl: dbGame.timeControl || '10+0',
      status: dbGame.status || 'ACTIVE',
      initialFen: dbGame.initialFen,
      players: new Map(),
      connectedSockets: new Map(),
      createdAt: dbGame.createdAt || new Date().toISOString()
    };

    if (dbGame.whitePlayerId) {
      room.players.set(dbGame.whitePlayerId, { id: dbGame.whitePlayerId, username: dbGame.whiteUsername || 'White' });
    }
    if (dbGame.blackPlayerId) {
      room.players.set(dbGame.blackPlayerId, { id: dbGame.blackPlayerId, username: dbGame.blackUsername || 'Black' });
    }

    this.roomsByCode.set(room.roomCode, room);
    this.roomsById.set(room.id, room);
    return room;
  }
}

export const globalRoomManager = new RoomManager();
