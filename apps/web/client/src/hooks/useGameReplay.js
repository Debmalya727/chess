import { useState, useEffect, useCallback, useRef } from 'react';
import { ChessGame } from '@chess/core';
import { apiFetch } from '../services/api';

export function useGameReplay(gameId) {
  const [gameMeta, setGameMeta] = useState(null);
  const [moves, setMoves] = useState([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Cached positions array: index 0 is initial FEN, index 1 is FEN after move 1, etc.
  const [positions, setPositions] = useState([]);
  const autoPlayRef = useRef(null);

  // Load game metadata & moves from backend
  useEffect(() => {
    if (!gameId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    async function loadReplayData() {
      try {
        const [metaData, movesData] = await Promise.all([
          apiFetch(`/games/${gameId}`),
          apiFetch(`/games/${gameId}/moves`)
        ]);

        if (!isMounted) return;

        setGameMeta(metaData);
        const moveList = movesData.moves || [];
        setMoves(moveList);

        // Reconstruct position for each ply using @chess/core
        const engine = new ChessGame(metaData.initialFen || undefined);
        const posList = [{ fen: engine.getFen(), lastMove: null, ply: 0 }];

        for (const m of moveList) {
          engine.move(m.from, m.to, m.promotion || undefined);
          posList.push({
            fen: engine.getFen(),
            lastMove: { from: m.from, to: m.to, san: m.san },
            ply: m.ply
          });
        }

        setPositions(posList);
        setCurrentPly(0);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadReplayData();

    return () => {
      isMounted = false;
    };
  }, [gameId]);

  const maxPly = positions.length > 0 ? positions.length - 1 : 0;

  const goToPly = useCallback((ply) => {
    const safePly = Math.max(0, Math.min(maxPly, ply));
    setCurrentPly(safePly);
  }, [maxPly]);

  const first = useCallback(() => goToPly(0), [goToPly]);
  const prev = useCallback(() => goToPly(currentPly - 1), [goToPly, currentPly]);
  const next = useCallback(() => goToPly(currentPly + 1), [goToPly, currentPly]);
  const last = useCallback(() => goToPly(maxPly), [goToPly, maxPly]);

  const toggleAutoPlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  // Handle Auto-Play timer
  useEffect(() => {
    if (isPlaying) {
      if (currentPly >= maxPly) {
        setIsPlaying(false);
        return;
      }
      autoPlayRef.current = setTimeout(() => {
        setCurrentPly(p => {
          if (p >= maxPly) {
            setIsPlaying(false);
            return p;
          }
          return p + 1;
        });
      }, 1000);
    } else {
      if (autoPlayRef.current) clearTimeout(autoPlayRef.current);
    }

    return () => {
      if (autoPlayRef.current) clearTimeout(autoPlayRef.current);
    };
  }, [isPlaying, currentPly, maxPly]);

  // Keyboard navigation (Left / Right Arrow)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'Home') {
        e.preventDefault();
        first();
      } else if (e.key === 'End') {
        e.preventDefault();
        last();
      } else if (e.key === ' ') {
        e.preventDefault();
        toggleAutoPlay();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prev, next, first, last, toggleAutoPlay]);

  const currentPos = positions[currentPly] || {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    lastMove: null,
    ply: 0
  };

  return {
    gameMeta,
    moves,
    currentPly,
    maxPly,
    currentPos,
    loading,
    error,
    isPlaying,
    isBeginning: currentPly === 0,
    isEnd: currentPly === maxPly,
    first,
    prev,
    next,
    last,
    goToPly,
    toggleAutoPlay
  };
}
