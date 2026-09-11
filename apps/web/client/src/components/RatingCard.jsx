import React from 'react';
import { Zap, Timer, Rocket, Landmark } from 'lucide-react';

const categoryIcons = {
  bullet: <Zap className="w-5 h-5 text-amber-400" />,
  blitz: <Timer className="w-5 h-5 text-yellow-400" />,
  rapid: <Rocket className="w-5 h-5 text-emerald-400" />,
  classical: <Landmark className="w-5 h-5 text-indigo-400" />
};

const categoryLabels = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical'
};

export function RatingCard({ type, ratingData, isSelected, onSelect }) {
  const data = ratingData || { rating: 1500, games: 0, winRate: 0, highest: 1500 };
  const icon = categoryIcons[type] || <Timer className="w-5 h-5 text-blue-400" />;
  const label = categoryLabels[type] || type;

  return (
    <div
      onClick={() => onSelect && onSelect(type)}
      className={`glass-panel p-4 rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.02] border ${
        isSelected
          ? 'border-emerald-500/50 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
          : 'border-white/10 bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {icon}
          <span className="font-semibold text-white capitalize">{label}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
          {data.games} {data.games === 1 ? 'game' : 'games'}
        </span>
      </div>

      <div className="flex items-baseline justify-between mt-2">
        <div>
          <div className="text-3xl font-extrabold text-white tracking-tight">{data.rating}</div>
          <div className="text-xs text-slate-400 mt-0.5">Peak: {data.highest}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-emerald-400">{data.winRate}%</div>
          <div className="text-xs text-slate-400">Win Rate</div>
        </div>
      </div>
    </div>
  );
}
