import { Chess } from 'chess.js';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class ChessGame {
  constructor(initialFen = INITIAL_FEN) {
    this.chess = new Chess(initialFen);
    this.initialFen = initialFen;
    this.history = [{ fen: this.chess.fen(), move: null }];
    this.historyIndex = 0;
  }

  getFen() {
    return this.history[this.historyIndex]?.fen || this.chess.fen();
  }

  getTurn() {
    return this.chess.turn();
  }

  getHistory() {
    return this.history.slice(1, this.historyIndex + 1).map(h => h.move).filter(Boolean);
  }

  getLegalMoves(square = null) {
    try {
      if (square) {
        return this.chess.moves({ square, verbose: true });
      }
      return this.chess.moves({ verbose: true });
    } catch {
      return [];
    }
  }

  getStatus() {
    const fen = this.getFen();
    const isCheck = this.chess.inCheck();
    const isCheckmate = this.chess.isCheckmate();
    const isDraw = this.chess.isDraw();
    const isStalemate = this.chess.isStalemate();
    const isThreefoldRepetition = this.chess.isThreefoldRepetition();
    const isInsufficientMaterial = this.chess.isInsufficientMaterial();
    const isGameOver = isCheckmate || isDraw;

    let winner = null;
    if (isCheckmate) {
      winner = this.chess.turn() === 'w' ? 'b' : 'w';
    }

    return {
      fen,
      turn: this.chess.turn(),
      isCheck,
      isCheckmate,
      isDraw,
      isStalemate,
      isThreefoldRepetition,
      isInsufficientMaterial,
      isGameOver,
      winner
    };
  }

  move(from, to, promotion = null) {
    try {
      const piece = this.chess.get(from);
      const isPawn = piece && piece.type === 'p';
      const promoOption = isPawn ? (promotion || 'q') : undefined;
      const result = this.chess.move({ from, to, promotion: promoOption });
      if (!result) return null;


      const newFen = this.chess.fen();
      const moveData = {
        san: result.san,
        from: result.from,
        to: result.to,
        color: result.color,
        flags: result.flags || '',
        piece: result.piece,
        captured: result.captured || null,
        promotion: result.promotion || null,
        fenAfter: newFen,
        ply: this.historyIndex + 1
      };

      const truncated = this.history.slice(0, this.historyIndex + 1);
      this.history = [...truncated, { fen: newFen, move: moveData }];
      this.historyIndex += 1;

      return moveData;
    } catch (e) {
      return null;
    }
  }

  loadFen(fen) {
    try {
      const valid = this.chess.load(fen);
      if (valid) {
        this.history = [{ fen: this.chess.fen(), move: null }];
        this.historyIndex = 0;
        return true;
      }
    } catch {}
    return false;
  }

  goToMove(index) {
    if (index < 0 || index >= this.history.length) return false;
    this.chess.load(this.history[index].fen);
    this.historyIndex = index;
    return true;
  }

  undo() {
    return this.goToMove(this.historyIndex - 1);
  }

  redo() {
    return this.goToMove(this.historyIndex + 1);
  }

  reset() {
    this.chess.reset();
    this.history = [{ fen: this.chess.fen(), move: null }];
    this.historyIndex = 0;
  }

  getPGN(headers = {}) {
    const tempChess = new Chess(this.initialFen);
    for (const item of this.history.slice(1, this.historyIndex + 1)) {
      if (item.move) {
        tempChess.move({ from: item.move.from, to: item.move.to, promotion: item.move.promotion });
      }
    }
    for (const [key, val] of Object.entries(headers)) {
      try { tempChess.header(key, String(val)); } catch {}
    }
    return tempChess.pgn();
  }

  loadPGN(pgn) {
    try {
      const tempChess = new Chess(this.initialFen);
      tempChess.loadPgn(pgn);
      const history = tempChess.history({ verbose: true });
      this.chess = new Chess(this.initialFen);
      this.history = [{ fen: this.chess.fen(), move: null }];
      this.historyIndex = 0;

      for (const m of history) {
        const res = this.chess.move(m);
        if (!res) return false;
        const fenAfter = this.chess.fen();
        const moveData = {
          san: res.san,
          from: res.from,
          to: res.to,
          color: res.color,
          flags: res.flags || '',
          piece: res.piece,
          captured: res.captured || null,
          promotion: res.promotion || null,
          fenAfter: fenAfter,
          ply: this.historyIndex + 1
        };
        this.history.push({ fen: fenAfter, move: moveData });
        this.historyIndex++;
      }
      return true;
    } catch {
      return false;
    }
  }

}

