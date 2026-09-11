import React from 'react';
import { Chess } from 'chess.js';
import { renderPieceSvg } from '../utils/chessSvgPieces.jsx';

export function ChessBoard({ 
  chess, fen, selectedSquare, legalMoves = [], lastMove, kingSquare,
  isFlipped, orientation, pendingPromotion, engineBestMove,
  onSquareSelect, onPromotionComplete 
}) {
  let activeChess = chess;
  if (!activeChess && fen) {
    try {
      activeChess = new Chess(fen);
    } catch {
      activeChess = new Chess();
    }
  } else if (activeChess && activeChess.chess) {
    activeChess = activeChess.chess;
  }

  const board = activeChess ? activeChess.board() : new Chess().board();
  const flipped = isFlipped || orientation === 'black';
  const rows = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
  const cols = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

  return (
    <div className="board-wrapper">
      <div className="chessboard">
        {rows.map(r => cols.map(c => {
          const sqName = String.fromCharCode(97 + c) + (8 - r);
          const isLight = (r + c) % 2 === 0;
          const piece = board[r][c];

          const isSelected = selectedSquare === sqName;
          const isLegalTarget = (legalMoves || []).some(m => m.to === sqName);
          const isCapture = isLegalTarget && piece !== null;
          const isLastMove = lastMove && (lastMove.from === sqName || lastMove.to === sqName);
          const isInCheck = kingSquare === sqName;
          const isBestFrom = engineBestMove?.from === sqName;
          const isBestTo = engineBestMove?.to === sqName;

          let cls = `square ${isLight ? 'light' : 'dark'}`;
          if (isLastMove) cls += ' last-move';
          if (isBestFrom) cls += ' engine-best-from';
          if (isBestTo) cls += ' engine-best-to';
          if (isSelected) cls += ' selected';
          if (isInCheck) cls += ' in-check';

          return (
            <div
              key={sqName}
              data-square={sqName}
              className={cls}
              onClick={() => onSquareSelect?.(sqName)}
              style={{ cursor: onSquareSelect ? 'pointer' : 'default' }}
            >

              {c === (flipped ? 7 : 0) && (
                <span className="square-coord rank">{8 - r}</span>
              )}
              {r === (flipped ? 0 : 7) && (
                <span className="square-coord file">{String.fromCharCode(97 + c)}</span>
              )}
              {isLegalTarget && !isCapture && <div className="move-hint" />}
              {isLegalTarget && isCapture && <div className="capture-hint" />}
              {piece && renderPieceSvg(piece.color, piece.type)}
            </div>
          );
        }))}
      </div>

      {pendingPromotion && (
        <div className="promotion-modal-overlay">
          <div className="promotion-box">
            <p className="promo-title">Promote pawn to:</p>
            <div className="promo-pieces">
              {['q','r','b','n'].map(pt => (
                <button key={pt} className="promo-piece-btn" onClick={() => onPromotionComplete?.(pt)}>
                  {renderPieceSvg(activeChess ? activeChess.turn() : 'w', pt)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
