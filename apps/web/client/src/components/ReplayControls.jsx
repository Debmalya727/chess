import React from 'react';
import { SkipBack, ChevronLeft, Play, Pause, ChevronRight, SkipForward } from 'lucide-react';

export function ReplayControls({
  currentPly,
  maxPly,
  isBeginning,
  isEnd,
  isPlaying,
  first,
  prev,
  next,
  last,
  toggleAutoPlay
}) {
  return (
    <div className="flex flex-col items-center space-y-3 p-4 glass-panel rounded-xl border border-white/10 bg-white/5">
      {/* Ply Counter */}
      <div className="text-xs font-semibold text-slate-300 tracking-wide uppercase">
        {currentPly === 0 ? 'Initial Position' : `Move ${Math.ceil(currentPly / 2)} of ${Math.ceil(maxPly / 2)} (Ply ${currentPly}/${maxPly})`}
      </div>

      {/* Control Buttons */}
      <div className="flex items-center space-x-2">
        <button
          onClick={first}
          disabled={isBeginning}
          title="First Move (Home / |<)"
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        <button
          onClick={prev}
          disabled={isBeginning}
          title="Previous Move (Left Arrow / <)"
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <button
          onClick={toggleAutoPlay}
          title={isPlaying ? 'Pause Auto-Play (Space)' : 'Play Moves (Space)'}
          className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 transition-all hover:scale-105"
        >
          {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
        </button>

        <button
          onClick={next}
          disabled={isEnd}
          title="Next Move (Right Arrow / >)"
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        <button
          onClick={last}
          disabled={isEnd}
          title="Last Move (End / >|)"
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>
      <div className="text-[11px] text-slate-400">Tip: Use ← → Arrow keys or Spacebar to navigate</div>
    </div>
  );
}
