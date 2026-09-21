import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { RefreshCw, RotateCcw, RotateCw, Copy, Check, Bot, Users, Swords, Search } from 'lucide-react';
import { GAME_MODES, DIFFICULTY_LEVELS } from '../features/mode/GameModeContext.jsx';

// Convert UCI PV moves to a readable SAN string like "1. e4 e5 2. Nf3"
function formatPvLine(fen, pvMoves) {
  if (!pvMoves || pvMoves.length === 0) return '';
  try {
    const tempChess = new Chess(fen);
    const fenParts = fen.split(' ');
    let moveNum = parseInt(fenParts[5] || '1', 10);
    let isBlackTurn = fenParts[1] === 'b';
    const tokens = [];

    for (const uci of pvMoves) {
      if (!uci || uci.length < 4) break;
      if (!isBlackTurn) {
        tokens.push(`${moveNum}.`);
      } else if (tokens.length === 0) {
        tokens.push(`${moveNum}...`);
      }
      const result = tempChess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
      if (!result) break;
      tokens.push(result.san);
      if (isBlackTurn) { moveNum++; isBlackTurn = false; }
      else { isBlackTurn = true; }
    }
    return tokens.join(' ');
  } catch { return ''; }
}

export function AnalysisPanel({ 
  fen, lines = [], isAnalyzing, turn,
  canUndo, canRedo, onUndo, onRedo, onReset, onFlip, onLoadFen,
  moveHistory = [], historyIndex, onGoToMove,
  activeMode = GAME_MODES.ANALYSIS,
  difficulty = 'MEDIUM', onDifficultyChange,
  computerColor = 'b', isGameOver = false, gameStatus = null,
  depth = 20, multipv = 3, onDepthChange, onMultiPVChange
}) {
  const [copied, setCopied] = useState(false);
  const [inputFen, setInputFen] = useState(fen);

  const isAnalysisMode = activeMode === GAME_MODES.ANALYSIS;
  const isComputerMode = activeMode === GAME_MODES.COMPUTER;
  const isLocalMode = activeMode === GAME_MODES.LOCAL;

  // Sync FEN input whenever the board position changes
  useEffect(() => { setInputFen(fen); }, [fen]);

  const topLine = lines[0];
  let formattedEval = '0.00';
  if (topLine) {
    if (topLine.mate != null) {
      formattedEval = `M${Math.abs(topLine.mate)}`;
    } else if (topLine.score) {
      const v = topLine.score.value / 100;
      formattedEval = `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    }
  }

  const handleCopyFen = () => {
    navigator.clipboard.writeText(fen);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFenSubmit = (e) => {
    e.preventDefault();
    onLoadFen(inputFen);
  };

  // Build move history table rows
  const moveRows = [];
  for (let i = 0; i < moveHistory.length; i++) {
    const mv = moveHistory[i];
    if (mv.color === 'w') {
      moveRows.push({ moveNumber: mv.moveNumber, white: { san: mv.san, idx: i + 1 }, black: null });
    } else {
      if (moveRows.length > 0 && moveRows[moveRows.length - 1].black === null) {
        moveRows[moveRows.length - 1].black = { san: mv.san, idx: i + 1 };
      } else {
        moveRows.push({ moveNumber: mv.moveNumber, white: null, black: { san: mv.san, idx: i + 1 } });
      }
    }
  }

  const isComputerThinking = isComputerMode && turn === computerColor && !isGameOver;

  return (
    <div className="analysis-panel">

      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isAnalysisMode ? (
              <><Search size={20} color="#818cf8" /> Position Analysis</>
            ) : isComputerMode ? (
              <><Bot size={20} color="#34d399" /> Play vs Computer</>
            ) : (
              <><Users size={20} color="#60a5fa" /> Local 2-Player</>
            )}
          </h2>
          <span className="turn-label" style={{ display: 'block', marginTop: '0.2rem' }}>
            {isAnalysisMode
              ? (turn === 'w' ? '⬜ White to move' : '⬛ Black to move')
              : isComputerMode
              ? 'Fair play mode • Engine assistance disabled'
              : 'Pass and play on this board'}
          </span>
        </div>
      </div>

      {/* MATCH STATUS / OPPONENT INFO (Game Modes vs Opponents) */}
      {!isAnalysisMode && (
        <div className="game-match-card">
          <div className="match-status-row">
            <span className="match-status-title">Match Status</span>
            {isGameOver ? (
              <span className="match-badge game-over">Game Over</span>
            ) : isComputerThinking ? (
              <span className="match-badge thinking analyzing-pulse">🤖 Thinking...</span>
            ) : (
              <span className="match-badge active-turn">
                {turn === 'w' ? '⬜ White to move' : '⬛ Black to move'}
              </span>
            )}
          </div>

          {isComputerMode && (
            <div className="match-difficulty-control" style={{ marginTop: '0.75rem' }}>
              <label className="setting-item" style={{ width: '100%' }}>
                <span className="setting-label">Difficulty Level</span>
                <select
                  className="setting-select"
                  value={difficulty}
                  onChange={(e) => onDifficultyChange?.(e.target.value)}
                  style={{ width: '100%', marginTop: '0.25rem' }}
                >
                  {Object.entries(DIFFICULTY_LEVELS).map(([key, lvl]) => (
                    <option key={key} value={key}>
                      {lvl.name} (Level {lvl.skillLevel} • Depth {lvl.depth})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      {/* STOCKFISH ENGINE ANALYSIS TOOLS (ONLY in Analysis Mode) */}
      {isAnalysisMode && (
        <>
          {/* Eval Score Hero */}
          <div className="eval-score-hero">
            <span className="score-display">{formattedEval}</span>
            <span className="depth-tag">
              Depth: {topLine?.depth ?? 0} {isAnalyzing && <span className="analyzing-pulse">⚡ Analyzing...</span>}
            </span>
          </div>

          {/* Multi-PV Lines with SAN notation */}
          <div className="pv-list">
            {lines.length === 0 ? (
              <div className="pv-card pv-card-empty">
                <span>{isAnalyzing ? '⚡ Calculating engine lines...' : 'Waiting for engine...'}</span>
              </div>
            ) : (
              lines.map((line, idx) => {
                let lineScore = '0.00';
                if (line.mate != null) {
                  lineScore = `M${Math.abs(line.mate)}`;
                } else if (line.score) {
                  const v = line.score.value / 100;
                  lineScore = `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
                }
                const pvFormatted = formatPvLine(fen, line.pv);
                return (
                  <div key={idx} className="pv-card" style={{ borderLeftColor: ['#10b981','#3b82f6','#a855f7','#f59e0b','#ef4444'][idx] }}>
                    <div className="pv-card-header">
                      <span className="pv-rank">PV #{line.multipv || idx + 1}</span>
                      <span className="pv-score">{lineScore}</span>
                    </div>
                    <div className="pv-san-line">{pvFormatted || line.bestMove || '—'}</div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Move History */}
      <div className="move-history" style={{ flex: isAnalysisMode ? 'initial' : '1', minHeight: isAnalysisMode ? '140px' : '220px' }}>
        <div className="move-history-header">Move History {moveHistory.length > 0 && `(${moveHistory.length} moves)`}</div>
        <div className="move-history-scroll" style={{ maxHeight: isAnalysisMode ? '160px' : '260px' }}>
          {moveRows.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              No moves played yet.
            </div>
          ) : (
            <table className="move-table">
              <tbody>
                {moveRows.map((row, i) => (
                  <tr key={i} className="move-row">
                    <td className="move-num">{row.moveNumber}.</td>
                    <td>
                      {row.white
                        ? <button className={`move-san${historyIndex === row.white.idx ? ' active' : ''}`} onClick={() => onGoToMove(row.white.idx)}>{row.white.san}</button>
                        : <span className="move-san-empty">...</span>}
                    </td>
                    <td>
                      {row.black
                        ? <button className={`move-san${historyIndex === row.black.idx ? ' active' : ''}`} onClick={() => onGoToMove(row.black.idx)}>{row.black.san}</button>
                        : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* FEN Box (Analysis Mode Only) */}
      {isAnalysisMode && (
        <form onSubmit={handleFenSubmit} className="fen-box">
          <input
            type="text"
            className="fen-input"
            value={inputFen}
            onChange={e => setInputFen(e.target.value)}
            placeholder="Paste FEN position..."
            aria-label="FEN Position String"
          />
          <button type="submit" className="btn btn-secondary fen-btn" title="Load FEN">Load</button>
          <button type="button" className="btn btn-secondary fen-btn" onClick={handleCopyFen} title="Copy FEN">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </form>
      )}

      {/* Settings Row (Analysis Mode Only) */}
      {isAnalysisMode && (
        <div className="settings-row">
          <label className="setting-item">
            <span className="setting-label">Depth</span>
            <select className="setting-select" value={depth} onChange={e => onDepthChange?.(Number(e.target.value))}>
              {[5,10,15,20,25].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="setting-item">
            <span className="setting-label">Lines</span>
            <select className="setting-select" value={multipv} onChange={e => onMultiPVChange?.(Number(e.target.value))}>
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}

      {/* Board Controls */}
      <div className="controls-bar">
        <button className="btn" onClick={onUndo} disabled={!canUndo} aria-label="Undo move">
          <RotateCcw size={15} /> Undo
        </button>
        <button className="btn" onClick={onRedo} disabled={!canRedo} aria-label="Redo move">
          <RotateCw size={15} /> Redo
        </button>
        <button className="btn" onClick={onFlip} aria-label="Flip board">
          <RefreshCw size={15} /> Flip
        </button>
        <button className="btn btn-primary" onClick={onReset}>
          {isAnalysisMode ? 'Reset' : 'New Game'}
        </button>
      </div>

    </div>
  );
}
