import { createAnalysis, updateAnalysis, getAnalysis, listAnalyses } from '../db/fairPlayRepository.js';
import { findMovesByGameId } from '../db/moveRepository.js';
import { findGameById } from '../db/gameRepository.js';

/**
 * Base FairPlayAnalyzer Provider Interface.
 * Allows Phase 7 or future deeper engine integrations (e.g. StockfishServerAnalyzer).
 */
export class FairPlayAnalyzer {
  async analyze(gameId) {
    throw new Error('Not implemented');
  }
}

/**
 * BasicAnalyzer: Analyzes move timing patterns, regularity, and game length without fabricating engine evals.
 */
export class BasicAnalyzer extends FairPlayAnalyzer {
  async analyze(gameId) {
    const game = await findGameById(gameId);
    const moves = await findMovesByGameId(gameId);

    if (!game || !moves || moves.length < 6) {
      return {
        status: 'complete',
        engineCorrelation: null,
        averageCentipawnLoss: null,
        accuracyScore: null,
        timingScore: 0.1,
        complexityScore: 0.2,
        suspicionScore: 0.05,
        signals: []
      };
    }

    const whiteMoveTimes = [];
    const blackMoveTimes = [];

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const timeMs = m.moveTimeMs || m.move_time_ms || 0;
      if (i % 2 === 0) {
        whiteMoveTimes.push(timeMs);
      } else {
        blackMoveTimes.push(timeMs);
      }
    }

    const evaluateTimes = (times) => {
      if (times.length < 4) return { mean: 0, stdDev: 0, regularity: 0 };
      const nonZero = times.filter(t => t > 0);
      if (nonZero.length < 4) return { mean: 0, stdDev: 0, regularity: 0 };

      const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
      const variance = nonZero.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / nonZero.length;
      const stdDev = Math.sqrt(variance);

      // Coefficient of variation: lower stdDev relative to mean means higher unnatural regularity
      const cv = mean > 0 ? stdDev / mean : 1;
      const regularity = Math.max(0, Math.min(1, 1 - cv));
      return { mean, stdDev, regularity };
    };

    const whiteStats = evaluateTimes(whiteMoveTimes);
    const blackStats = evaluateTimes(blackMoveTimes);

    const signals = [];
    let suspicionScore = 0.05;

    // Check for bot-like move timing regularity (e.g. constant move intervals with near-zero deviation)
    if (whiteStats.regularity > 0.85 && whiteMoveTimes.length >= 10) {
      signals.push('MOVE_TIME_REGULARITY_WHITE');
      suspicionScore = Math.max(suspicionScore, 0.65);
    }
    if (blackStats.regularity > 0.85 && blackMoveTimes.length >= 10) {
      signals.push('MOVE_TIME_REGULARITY_BLACK');
      suspicionScore = Math.max(suspicionScore, 0.65);
    }

    // Check for instantaneous tactical moves deep in game
    const fastLateMovesWhite = whiteMoveTimes.slice(10).filter(t => t > 0 && t < 250).length;
    const fastLateMovesBlack = blackMoveTimes.slice(10).filter(t => t > 0 && t < 250).length;

    if (fastLateMovesWhite > 4) {
      signals.push('UNNATURAL_FAST_PLAY_WHITE');
      suspicionScore = Math.min(1.0, suspicionScore + 0.15);
    }
    if (fastLateMovesBlack > 4) {
      signals.push('UNNATURAL_FAST_PLAY_BLACK');
      suspicionScore = Math.min(1.0, suspicionScore + 0.15);
    }

    const maxRegularity = Math.max(whiteStats.regularity, blackStats.regularity);
    const timingScore = parseFloat(maxRegularity.toFixed(2));
    const complexityScore = parseFloat((Math.min(moves.length, 60) / 60).toFixed(2));

    return {
      status: 'complete',
      engineCorrelation: null, // Server-side engine eval not available in this tier - null rather than fake
      averageCentipawnLoss: null,
      accuracyScore: null,
      timingScore,
      complexityScore,
      suspicionScore: parseFloat(suspicionScore.toFixed(2)),
      signals
    };
  }
}

export class FairPlayService {
  constructor(analyzer = new BasicAnalyzer()) {
    this.analyzer = analyzer;
  }

  async analyzeGame(gameId) {
    if (!gameId) return null;
    try {
      await createAnalysis(gameId);
      const analysisResult = await this.analyzer.analyze(gameId);
      return await updateAnalysis(gameId, analysisResult);
    } catch (err) {
      console.warn(`[FairPlayService] Analysis error for game ${gameId}:`, err.message);
      return await updateAnalysis(gameId, { status: 'failed' });
    }
  }

  async getGameAnalysis(gameId) {
    return getAnalysis(gameId);
  }

  async listAnalyses(filter) {
    return listAnalyses(filter);
  }
}

export const globalFairPlayService = new FairPlayService();
