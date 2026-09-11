import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { RefreshCw, RotateCcw, RotateCw, Copy, Check, Bot, User } from 'lucide-react';

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
  fen, lines, isAnalyzing, turn,
  canUndo, canRedo, onUndo, onRedo, onReset, onFlip, onLoadFen,
  moveHistory, historyIndex, onGoToMove,
  vsComputer, onToggleVsComputer,
  depth, multipv, onDepthChange, onMultiPVChange
}) {
  const [copied, setCopied] = useState(false);
  const [inputFen, setInputFen] = useState(fen);

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

  return (
    <div className="analysis-panel">

      {/* Header */}
      <div className="panel-header">
        <h2 className="panel-title">Position Evaluation</h2>
        <span className="turn-label">{turn === 'w' ? '⬜ White to move' : '⬛ Black to move'}</span>
      </div>

      {/* Eval Score */}
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

      {/* Move History */}
      {moveRows.length > 0 && (
        <div className="move-history">
          <div className="move-history-header">Move History</div>
          <div className="move-history-scroll">
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
          </div>
        </div>
      )}

      {/* FEN Box */}
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

      {/* Settings Row */}
      <div className="settings-row">
        <label className="setting-item">
          <span className="setting-label">Depth</span>
          <select className="setting-select" value={depth} onChange={e => onDepthChange(Number(e.target.value))}>
            {[5,10,15,20,25].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="setting-item">
          <span className="setting-label">Lines</span>
          <select className="setting-select" value={multipv} onChange={e => onMultiPVChange(Number(e.target.value))}>
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

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
        <button className="btn btn-primary" onClick={onReset}>Reset</button>
      </div>

      {/* vs Computer Toggle */}
      <button
        className={`btn vs-computer-btn${vsComputer ? ' active' : ''}`}
        onClick={onToggleVsComputer}
      >
        {vsComputer
          ? <><Bot size={16} /> Playing vs Stockfish — Click to Stop</>
          : <><User size={16} /> Play vs Stockfish (you play White)</>}
      </button>
    </div>
  );
}
