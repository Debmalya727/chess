import { useState, useEffect, useRef, useCallback } from 'react';
import { StockfishClient } from '../engine/StockfishClient.js';

export function useStockfishAnalysis(fen, options = {}) {
  const { depth = 20, multipv = 3, enabled = true } = options;

  const [engineStatus, setEngineStatus] = useState('initializing');
  const [engineAvailable, setEngineAvailable] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lines, setLines] = useState([]);
  const [bestMove, setBestMove] = useState(null);

  const clientRef = useRef(null);
  const optionsRef = useRef({ depth, multipv });
  optionsRef.current = { depth, multipv };

  useEffect(() => {
    const client = new StockfishClient('/engine/stockfish.js');
    clientRef.current = client;

    const unbindStatus = client.onStatusChange(({ status, available }) => {
      setEngineStatus(status);
      setEngineAvailable(available);
    });

    const unbindUpdate = client.onUpdate((updatedLines) => {
      setLines(updatedLines);
      setIsAnalyzing(true);
    });

    const unbindComplete = client.onComplete(({ bestMove: bMove, lines: finalLines }) => {
      setIsAnalyzing(false);
      setLines(finalLines);
      if (bMove && bMove !== '(none)') {
        setBestMove(bMove);
      }
    });

    client.init();

    return () => {
      unbindStatus();
      unbindUpdate();
      unbindComplete();
      client.terminate();
    };
  }, []);

  useEffect(() => {
    if (clientRef.current && fen && enabled) {
      setIsAnalyzing(true);
      clientRef.current.startAnalysis(fen, optionsRef.current);
    } else if (clientRef.current && !enabled) {
      clientRef.current.stopAnalysis();
      setIsAnalyzing(false);
      setLines([]);
      setBestMove(null);
    }
  }, [fen, depth, multipv, enabled]);

  const startAnalysis = useCallback((targetFen) => {
    if (clientRef.current) {
      setIsAnalyzing(true);
      clientRef.current.startAnalysis(targetFen || fen, optionsRef.current);
    }
  }, [fen]);

  const stopAnalysis = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.stopAnalysis();
      setIsAnalyzing(false);
    }
  }, []);

  return {
    engineStatus,
    engineAvailable,
    isAnalyzing,
    lines,
    bestMove,
    startAnalysis,
    stopAnalysis
  };
}
