import { globalRoomManager } from '../rooms/roomManager.js';
import { globalGameManager } from '../games/gameManager.js';
import { createGame, findGameById, findGameByRoomCode, findPaginatedGamesByUserId } from '../db/gameRepository.js';
import { findMovesByGameId } from '../db/moveRepository.js';
import { findUserById } from '../db/userRepository.js';
import { authenticateRequest } from '../auth/authMiddleware.js';

export async function gameRoutes(fastify) {
  // GET /api/games/history — Authenticated User's Game History
  fastify.get('/api/games/history', { preHandler: authenticateRequest }, async (request, reply) => {
    const user = request.user;
    const { page = '1', limit = '20', ratingType, result } = request.query || {};

    const historyResult = await findPaginatedGamesByUserId(user.id, {
      page,
      limit,
      ratingType,
      result
    });

    const formattedGames = historyResult.games.map(g => {
      const parts = (g.timeControl || '10+0').split('+');
      const baseMins = parseFloat(parts[0]) || 10;
      let cat = 'rapid';
      if (baseMins < 3) cat = 'bullet';
      else if (baseMins <= 5) cat = 'blitz';
      else if (baseMins < 30) cat = 'rapid';
      else cat = 'classical';

      return {
        id: g.id,
        roomCode: g.roomCode,
        white: {
          id: g.whitePlayerId,
          username: g.whiteUsername || 'White'
        },
        black: {
          id: g.blackPlayerId,
          username: g.blackUsername || 'Black'
        },
        result: g.result,
        termination: g.termination,
        timeControl: g.timeControl,
        ratingType: cat,
        initialFen: g.initialFen,
        finalFen: g.finalFen,
        playedAt: g.endedAt || g.createdAt
      };
    });

    return reply.send({
      games: formattedGames,
      pagination: historyResult.pagination
    });
  });

  // Create Game
  fastify.post('/api/games', { preHandler: authenticateRequest }, async (request, reply) => {
    const { timeControl = '10+0', colorPreference = 'random' } = request.body || {};
    const user = request.user;

    const room = globalRoomManager.createRoom({ hostUser: user, timeControl, colorPreference });

    await createGame({
      id: room.id,
      roomCode: room.roomCode,
      whitePlayerId: room.whitePlayerId,
      blackPlayerId: room.blackPlayerId,
      timeControl: room.timeControl,
      status: room.status,
      initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    });

    return reply.status(201).send({
      gameId: room.id,
      roomCode: room.roomCode,
      status: room.status,
      whitePlayerId: room.whitePlayerId,
      blackPlayerId: room.blackPlayerId
    });
  });

  // Join Game
  fastify.post('/api/games/:identifier/join', { preHandler: authenticateRequest }, async (request, reply) => {
    const { identifier } = request.params;
    const user = request.user;

    let room = globalRoomManager.getRoomByCode(identifier);
    if (!room) {
      room = globalRoomManager.getRoomById(identifier);
    }

    if (!room) {
      const dbGame = await findGameByRoomCode(identifier) || await findGameById(identifier);
      if (!dbGame) {
        return reply.status(404).send({ error: 'GAME_NOT_FOUND', message: 'Game not found.' });
      }
      return reply.status(400).send({ error: 'GAME_FINISHED', message: 'Game is no longer active.' });
    }

    const joinResult = globalRoomManager.joinRoom(room.roomCode, user);
    if (joinResult.error) {
      return reply.status(400).send(joinResult);
    }

    if (room.status === 'ACTIVE') {
      const session = globalGameManager.getOrCreateSession(room);
      session.start();
    }

    return reply.send({
      gameId: room.id,
      roomCode: room.roomCode,
      status: room.status,
      color: joinResult.color,
      whitePlayerId: room.whitePlayerId,
      blackPlayerId: room.blackPlayerId
    });
  });

  // Get Single Game Info
  fastify.get('/api/games/:gameId', async (request, reply) => {
    const { gameId } = request.params;
    const game = await findGameById(gameId);
    if (!game) {
      return reply.status(404).send({ error: 'GAME_NOT_FOUND', message: 'Game not found.' });
    }

    const whiteUser = game.whitePlayerId ? await findUserById(game.whitePlayerId) : null;
    const blackUser = game.blackPlayerId ? await findUserById(game.blackPlayerId) : null;

    const moves = await findMovesByGameId(gameId);

    return reply.send({
      ...game,
      whiteUsername: whiteUser ? whiteUser.username : (game.whitePlayerId ? 'Player' : 'Guest'),
      blackUsername: blackUser ? blackUser.username : (game.blackPlayerId ? 'Player' : 'Guest'),
      moveCount: moves.length
    });
  });

  // Get Game Moves (Authoritative Sequence)
  fastify.get('/api/games/:gameId/moves', async (request, reply) => {
    const { gameId } = request.params;
    const game = await findGameById(gameId);
    if (!game) {
      return reply.status(404).send({ error: 'GAME_NOT_FOUND', message: 'Game not found.' });
    }

    const moves = await findMovesByGameId(gameId);
    return reply.send({
      gameId,
      moves: moves.map(m => ({
        ply: m.ply,
        san: m.san,
        from: m.from,
        to: m.to,
        promotion: m.promotion || null,
        fenAfter: m.fenAfter,
        moveTimeMs: m.moveTimeMs || 0
      }))
    });
  });

  // Get Game PGN
  fastify.get('/api/games/:gameId/pgn', async (request, reply) => {
    const { gameId } = request.params;
    const game = await findGameById(gameId);
    if (!game) {
      return reply.status(404).send({ error: 'GAME_NOT_FOUND', message: 'Game not found.' });
    }
    reply.header('Content-Type', 'application/x-chess-pgn');
    reply.header('Content-Disposition', `attachment; filename="game_${gameId}.pgn"`);
    if (game.pgn) {
      return reply.send(game.pgn);
    }
    const moves = await findMovesByGameId(gameId);
    const pgnMoves = [];
    for (let i = 0; i < moves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteSan = moves[i].san;
      const blackSan = moves[i + 1] ? moves[i + 1].san : '';
      pgnMoves.push(`${moveNum}. ${whiteSan}${blackSan ? ' ' + blackSan : ''}`);
    }
    const dynamicPgn = `[Event "Online Match"]\n[Site "Chess Platform"]\n[Date "${new Date().toISOString().split('T')[0]}"]\n\n${pgnMoves.join(' ')}`;
    return reply.send(dynamicPgn);
  });

  // GET /api/games/:gameId/events — Internal/Audit events for a game (participants, ADMIN, TOURNAMENT_ORGANIZER)
  fastify.get('/api/games/:gameId/events', { preHandler: authenticateRequest }, async (request, reply) => {
    const { gameId } = request.params;
    const user = request.user;
    const game = await findGameById(gameId);
    if (!game) {
      return reply.status(404).send({ error: 'GAME_NOT_FOUND', message: 'Game not found.' });
    }

    const isParticipant = game.whitePlayerId === user.id || game.blackPlayerId === user.id;
    const isStaff = user.role === 'ADMIN' || user.role === 'TOURNAMENT_ORGANIZER';

    if (!isParticipant && !isStaff) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'You do not have permission to view audit events for this game.' });
    }

    const { getGameEvents } = await import('../db/gameEventRepository.js');
    const events = await getGameEvents(gameId);
    return reply.send({ gameId, events });
  });
}
