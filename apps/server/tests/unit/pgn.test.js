import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ChessGame } from '@chess/core';

describe('PGN Reproducibility Unit Tests', () => {
  test('replays PGN moves and matches authoritative final FEN for Fool\'s Mate (checkmate)', () => {
    const game = new ChessGame();
    game.move('f2', 'f3');
    game.move('e7', 'e5');
    game.move('g2', 'g4');
    game.move('d8', 'h4');

    const status = game.getStatus();
    assert.strictEqual(status.isCheckmate, true);
    assert.strictEqual(status.winner, 'b');

    const expectedFinalFen = game.getFen();
    const pgn = game.getPGN({
      Event: 'PGN Reproducibility Test',
      Site: 'Local Workspace',
      White: 'Player A',
      Black: 'Player B',
      Result: '0-1',
      Termination: 'checkmate'
    });

    // Replay PGN in a clean game instance
    const replayedGame = new ChessGame();
    const loadSuccess = replayedGame.loadPGN(pgn);

    assert.strictEqual(loadSuccess, true, 'PGN loading should succeed');
    assert.strictEqual(replayedGame.getFen(), expectedFinalFen, 'Replayed FEN must match server final FEN');
    assert.strictEqual(replayedGame.getStatus().isCheckmate, true);
  });

  test('replays PGN moves for Scholar\'s Mate', () => {
    const game = new ChessGame();
    game.move('e2', 'e4');
    game.move('e7', 'e5');
    game.move('f1', 'c4');
    game.move('b8', 'c6');
    game.move('d1', 'h5');
    game.move('g8', 'f6');
    game.move('h5', 'f7');

    const expectedFinalFen = game.getFen();
    const pgn = game.getPGN({
      Event: 'Scholar Mate Test',
      Result: '1-0',
      Termination: 'checkmate'
    });

    const replayedGame = new ChessGame();
    const loadSuccess = replayedGame.loadPGN(pgn);

    assert.strictEqual(loadSuccess, true);
    assert.strictEqual(replayedGame.getFen(), expectedFinalFen);
  });

  test('replays PGN moves for Stalemate position', () => {
    const game = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    const expectedFen = game.getFen();
    const status = game.getStatus();
    assert.strictEqual(status.isStalemate, true);

    const pgn = game.getPGN({ Result: '1/2-1/2', Termination: 'stalemate' });
    const replayedGame = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    replayedGame.loadPGN(pgn);
    assert.strictEqual(replayedGame.getFen(), expectedFen);
  });
});
