import React from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useAuth } from '../features/auth/AuthContext';
import { Trophy, ChevronLeft, ChevronRight, Zap, Flame, Shield, Clock } from 'lucide-react';

export function Leaderboard({ onSelectUser }) {
  const { user } = useAuth();
  const {
    category,
    setCategory,
    page,
    setPage,
    players,
    pagination,
    loading,
    error
  } = useLeaderboard('rapid');

  const categories = [
    { id: 'bullet', name: 'Bullet 1+0', icon: Zap },
    { id: 'blitz', name: 'Blitz 3+2/5+0', icon: Flame },
    { id: 'rapid', name: 'Rapid 10+0', icon: Trophy },
    { id: 'classical', name: 'Classical 30+0', icon: Clock }
  ];

  const userRankEntry = user ? players.find(p => p.username === user.username) : null;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 text-white">
      {/* Header & Category Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-2xl border border-white/10">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center">
            <Trophy className="w-7 h-7 mr-2.5 text-amber-400" /> Global Leaderboards
          </h1>
          <p className="text-slate-400 text-sm mt-1">Official player rankings sorted deterministically by Elo rating.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10">
          {categories.map(cat => {
            const Icon = cat.icon;
            const isActive = category === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Authenticated User Rank Highlight Card */}
      {user && (
        <div className="glass-panel p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center font-black text-emerald-400">
              #{userRankEntry ? userRankEntry.rank : '—'}
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center">
                <span>Your {category.toUpperCase()} Rank</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                  {user.username}
                </span>
              </div>
              <div className="text-xs text-slate-300">
                {userRankEntry ? `Rating: ${userRankEntry.rating} • ${userRankEntry.games} Games Played` : 'Play online rated matches to appear on the official leaderboard!'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Table State */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[350px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        </div>
      ) : error ? (
        <div className="glass-panel p-6 rounded-xl border border-red-500/20 text-center text-red-400">
          {error}
        </div>
      ) : players.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl border border-white/10 text-center space-y-3">
          <Trophy className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-300">No Leaderboard Data Yet</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">Be the first to play rated online matches in the {category} category!</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-white/5 text-slate-400 border-b border-white/10">
                <tr>
                  <th className="p-4 w-16 text-center">Rank</th>
                  <th className="p-4">Player</th>
                  <th className="p-4">Rating</th>
                  <th className="p-4 text-center">Games</th>
                  <th className="p-4 text-right">W / D / L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {players.map((p) => {
                  const isCurrentUser = user && user.username === p.username;
                  const isTop3 = p.rank <= 3;
                  const medalColor = p.rank === 1 ? 'text-amber-400' : p.rank === 2 ? 'text-slate-300' : p.rank === 3 ? 'text-amber-600' : '';

                  return (
                    <tr
                      key={p.userId}
                      className={`transition-colors ${
                        isCurrentUser ? 'bg-emerald-500/15 font-bold border-l-4 border-l-emerald-500' : 'hover:bg-white/5'
                      }`}
                    >
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center justify-center font-black ${isTop3 ? medalColor : 'text-slate-400'}`}>
                          {isTop3 ? `🥇 🥈 🥉`.split(' ')[p.rank - 1] : `#${p.rank}`}
                        </span>
                      </td>

                      <td className="p-4">
                        <button
                          onClick={() => onSelectUser && onSelectUser(p.username)}
                          className="text-white hover:text-emerald-400 font-bold transition-colors inline-flex items-center space-x-2"
                        >
                          <span>{p.username}</span>
                          {isCurrentUser && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">You</span>
                          )}
                        </button>
                      </td>

                      <td className="p-4 text-emerald-400 font-mono font-black text-base">
                        {p.rating}
                      </td>

                      <td className="p-4 text-center text-slate-300 font-mono">
                        {p.games}
                      </td>

                      <td className="p-4 text-right font-mono text-xs text-slate-400">
                        <span className="text-emerald-400 font-bold">{p.wins}W</span> / <span>{p.draws}D</span> / <span className="text-red-400">{p.losses}L</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between p-4 bg-white/5 border-t border-white/10">
              <span className="text-xs text-slate-400">
                Page <strong className="text-white">{pagination.page}</strong> of <strong className="text-white">{pagination.pages}</strong> ({pagination.total} players)
              </span>
              <div className="flex items-center space-x-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => setPage(pagination.page - 1)}
                  className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setPage(pagination.page + 1)}
                  className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
