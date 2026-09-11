import React, { useState } from 'react';
import { useGameReplay } from '../hooks/useGameReplay';
import { ChessBoard } from './ChessBoard';
import { ReplayControls } from './ReplayControls';
import { ArrowLeft, Download, Copy, FileText, Check, Trophy, Clock, Flag, Award } from 'lucide-react';

export function GameReplay({ gameId, onClose }) {
  const {
    gameMeta,
    moves,
    currentPly,
    maxPly,
    currentPos,
    loading,
    error,
    isPlaying,
    isBeginning,
    isEnd,
    first,
    prev,
    next,
    last,
    goToPly,
    toggleAutoPlay
  } = useGameReplay(gameId);

  const [showPgnModal, setShowPgnModal] = useState(false);
  const [copiedPgn, setCopiedPgn] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px] text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-3"></div>
      </div>
    );
  }

  if (error || !gameMeta) {
    return (
      <div className="glass-panel p-8 rounded-xl text-center border border-red-500/20 max-w-lg mx-auto my-8 text-white">
        <h3 className="text-xl font-bold text-red-400 mb-2">Replay Error</h3>
        <p className="text-slate-300 text-sm">{error || 'Game record not found.'}</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-semibold">
          Return to History
        </button>
      </div>
    );
  }

  const whiteName = gameMeta.whiteUsername || 'White';
  const blackName = gameMeta.blackUsername || 'Black';
  const isDraw = gameMeta.result === '1/2-1/2';
  const whiteWon = gameMeta.result === '1-0';
  const blackWon = gameMeta.result === '0-1';

  const handleCopyPgn = () => {
    if (gameMeta.pgn) {
      navigator.clipboard.writeText(gameMeta.pgn);
      setCopiedPgn(true);
      setTimeout(() => setCopiedPgn(false), 2000);
    }
  };

  const handleDownloadPgn = () => {
    window.location.href = `/api/games/${gameId}/pgn`;
  };

  // Group moves into pairs (turn 1: white, black)
  const movePairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNum: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null
    });
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 text-white">
      {/* Header & Back Action */}
      <div className="flex items-center justify-between glass-panel p-4 px-6 rounded-2xl border border-white/10">
        <button
          onClick={onClose}
          className="flex items-center space-x-2 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 p-2 px-3 rounded-xl transition-colors font-semibold text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to History</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowPgnModal(true)}
            className="flex items-center space-x-1.5 p-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition-colors"
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>View PGN</span>
          </button>
          <button
            onClick={handleDownloadPgn}
            className="flex items-center space-x-1.5 p-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download PGN</span>
          </button>
        </div>
      </div>

      {/* Result Summary Banner */}
      <div className="glass-panel p-4 rounded-xl border border-white/10 bg-gradient-to-r from-slate-900/90 via-slate-800/80 to-slate-900/90 text-center flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3 text-left">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-lg font-black text-white">
              {whiteWon ? `${whiteName} won!` : blackWon ? `${blackName} won!` : 'Match drawn'}
            </div>
            <div className="text-xs text-slate-400 flex items-center space-x-2">
              <span>Result: {gameMeta.result}</span>
              <span>•</span>
              <span className="capitalize">Termination: {gameMeta.termination || 'completed'}</span>
              <span>•</span>
              <span>TC: {gameMeta.timeControl}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-6 text-sm">
          <div className="text-center">
            <div className="font-bold text-white">♔ {whiteName}</div>
            <div className="text-xs text-emerald-400">{whiteWon ? 'Winner (+16)' : isDraw ? 'Draw (0)' : 'Loss (-16)'}</div>
          </div>
          <div className="text-xl font-black text-slate-400">VS</div>
          <div className="text-center">
            <div className="font-bold text-white">♚ {blackName}</div>
            <div className="text-xs text-emerald-400">{blackWon ? 'Winner (+16)' : isDraw ? 'Draw (0)' : 'Loss (-16)'}</div>
          </div>
        </div>
      </div>

      {/* Main Board & Move Navigation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Interactive Read-only Board */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel p-4 rounded-2xl border border-white/10 flex justify-center bg-slate-950/60">
            <div className="w-full max-w-[500px] aspect-square">
              <ChessBoard
                fen={currentPos.fen}
                onMove={() => false} // Read-only in replay mode
                readOnly={true}
                orientation="white"
              />
            </div>
          </div>

          {/* Controls Component */}
          <ReplayControls
            currentPly={currentPly}
            maxPly={maxPly}
            isBeginning={isBeginning}
            isEnd={isEnd}
            isPlaying={isPlaying}
            first={first}
            prev={prev}
            next={next}
            last={last}
            toggleAutoPlay={toggleAutoPlay}
          />
        </div>

        {/* Right Column: Interactive Move History List */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 bg-white/5 space-y-4 max-h-[620px] flex flex-col">
          <h3 className="text-md font-bold text-slate-200 border-b border-white/10 pb-3 flex items-center justify-between">
            <span className="flex items-center"><Clock className="w-4 h-4 mr-2 text-emerald-400" /> Move Notation</span>
            <span className="text-xs text-slate-400 font-normal">{moves.length} plies</span>
          </h3>

          <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
            {movePairs.map((pair) => (
              <div key={pair.moveNum} className="flex items-center text-sm py-1 px-2 rounded hover:bg-white/5 font-mono">
                <span className="w-10 text-xs text-slate-500 font-semibold">{pair.moveNum}.</span>
                
                {/* White Move */}
                <button
                  onClick={() => goToPly(pair.white.ply)}
                  className={`flex-1 text-left px-2 py-1 rounded transition-colors ${
                    currentPly === pair.white.ply
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {pair.white.san}
                </button>

                {/* Black Move */}
                {pair.black ? (
                  <button
                    onClick={() => goToPly(pair.black.ply)}
                    className={`flex-1 text-left px-2 py-1 rounded transition-colors ${
                      currentPly === pair.black.ply
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                        : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {pair.black.san}
                  </button>
                ) : (
                  <span className="flex-1"></span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PGN Modal */}
      {showPgnModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl border border-white/10 max-w-xl w-full bg-slate-900 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center">
                <FileText className="w-5 h-5 mr-2 text-emerald-400" /> Game PGN Notation
              </h3>
              <button
                onClick={() => setShowPgnModal(false)}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <textarea
              readOnly
              rows={8}
              value={gameMeta.pgn || 'PGN unavailable'}
              className="w-full p-3 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-emerald-300 focus:outline-none custom-scrollbar"
            />

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={handleCopyPgn}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs flex items-center transition-colors"
              >
                {copiedPgn ? <Check className="w-4 h-4 mr-1 text-emerald-400" /> : <Copy className="w-4 h-4 mr-1" />}
                {copiedPgn ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <button
                onClick={handleDownloadPgn}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center transition-colors"
              >
                <Download className="w-4 h-4 mr-1" /> Download .pgn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
