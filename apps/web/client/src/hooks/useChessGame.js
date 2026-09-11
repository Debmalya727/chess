import { useState, useCallback, useMemo } from 'react';
import { ChessGame, INITIAL_FEN } from '@chess/core';

export function useChessGame(initialFen = INITIAL_FEN) {
  const [game] = useState(() => new ChessGame(initialFen));

  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [revision, setRevision] = useState(0); // Trigger re-render when game mutates


  const fen = useMemo(() => game.getFen(), [game, historyIndex, revision]);


  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setLegalMoves([]);
  }, []);

  const syncState = useCallback(() => {
    setHistoryIndex(game.historyIndex);
    const history = game.getHistory();
    const lastM = history[history.length - 1];
    setLastMove(lastM ? { from: lastM.from, to: lastM.to } : null);
    clearSelection();
    setRevision(r => r + 1);
  }, [game, clearSelection]);

  const selectSquare = useCallback((sq) => {
    if (!sq) { clearSelection(); return; }

    const turn = game.getTurn();

    if (selectedSquare) {
      const moves = game.getLegalMoves(selectedSquare);
      const target = moves.find(m => m.to === sq);
      if (target) {
        if (target.flags && target.flags.includes('p')) {
          setPendingPromotion({ from: selectedSquare, to: sq });
          return;
        }
        const result = game.move(selectedSquare, sq);
        if (result) {
          syncState();
          return;
        }
      }
    }

    const piece = game.chess.get(sq);
    if (piece && piece.color === turn) {
      setSelectedSquare(sq);
      setLegalMoves(game.getLegalMoves(sq));
    } else {
      clearSelection();
    }
  }, [game, selectedSquare, clearSelection, syncState]);

  const makeMove = useCallback((from, to, promotion = 'q') => {
    const result = game.move(from, to, promotion);
    if (result) {
      syncState();
      return result;
    }
    return null;
  }, [game, syncState]);

  const completePromotion = useCallback((piece) => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    const result = game.move(from, to, piece);
    if (result) syncState();
    setPendingPromotion(null);
  }, [game, pendingPromotion, syncState]);

  const loadFen = useCallback((newFen) => {
    const success = game.loadFen(newFen);
    if (success) syncState();
    return success;
  }, [game, syncState]);

  const goToMove = useCallback((index) => {
    const success = game.goToMove(index);
    if (success) syncState();
  }, [game, syncState]);

  const undoMove = useCallback(() => goToMove(game.historyIndex - 1), [game, goToMove]);
  const redoMove = useCallback(() => goToMove(game.historyIndex + 1), [game, goToMove]);

  const resetBoard = useCallback(() => {
    game.reset();
    syncState();
  }, [game, syncState]);

  const toggleFlip = useCallback(() => setIsFlipped(p => !p), []);

  const status = useMemo(() => game.getStatus(), [game, fen, revision]);

  const moveHistory = useMemo(() => game.getHistory(), [game, fen]);

  const kingSquare = useMemo(() => {
    if (!status.isCheck) return null;
    const board = game.chess.board();
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === status.turn)
          return String.fromCharCode(97 + c) + (8 - r);
      }
    return null;
  }, [game, fen, status]);

  return {
    chess: game.chess,
    fen,
    turn: status.turn,
    selectedSquare,
    legalMoves,
    lastMove,
    kingSquare,
    isFlipped,
    pendingPromotion,
    isCheck: status.isCheck,
    isCheckmate: status.isCheckmate,
    isDraw: status.isDraw,
    isStalemate: status.isStalemate,
    isGameOver: status.isGameOver,
    moveHistory,
    historyIndex: game.historyIndex,
    selectSquare,
    makeMove,
    completePromotion,
    loadFen,
    goToMove,
    undoMove,
    redoMove,
    resetBoard,
    toggleFlip,
    canUndo: game.historyIndex > 0,
    canRedo: game.historyIndex < game.history.length - 1,
    getPGN: (headers) => game.getPGN(headers)
  };
}
