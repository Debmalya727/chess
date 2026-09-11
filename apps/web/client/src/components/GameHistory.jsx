import React from 'react';
import { useGameHistory } from '../hooks/useGameHistory';
import { History, Filter, ChevronLeft, ChevronRight, Play, Trophy, Swords } from 'lucide-react';

export function GameHistory({ onSelectReplayGame }) {
  const {
    games,
    pagination,
    ratingType,
    setRatingType,
    resultFilter,
    setResultFilter,
    loading,
    error,
    setPage
  } = useGameHistory();

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 rounded-2xl border border-white/10">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center">
            <History className="w-6 h-6 mr-2 text-emerald-400" /> Game History & Replays
          </h1>
          <p className="text-slate-400 text-sm mt-1">Review, analyze, and replay all your past online matches.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-white/5 p-1 rounded-xl border border-white/10">
            <Filter className="w-4 h-4 ml-2 text-slate-400" />
            <select
              value={ratingType}
              onChange={(e) => setRatingType(e.target.value)}
              className="bg-transparent text-white text-xs p-1 px-2 rounded font-medium focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900">All Categories</option>
              <option value="bullet" className="bg-slate-900">Bullet</option>
              <option value="blitz" className="bg-slate-900">Blitz</option>
              <option value="rapid" className="bg-slate-900">Rapid</option>
              <option value="classical" className="bg-slate-900">Classical</option>
            </select>
          </div>

          <div className="flex items-center space-x-2 bg-white/5 p-1 rounded-xl border border-white/10">
            <select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              className="bg-transparent text-white text-xs p-1 px-2 rounded font-medium focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900">All Outcomes</option>
              <option value="1-0" className="bg-slate-900">White Wins (1-0)</option>
              <option value="0-1" className="bg-slate-900">Black Wins (0-1)</option>
              <option value="1/2-1/2" className="bg-slate-900">Draws (1/2-1/2)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        </div>
      ) : error ? (
        <div className="glass-panel p-6 rounded-xl border border-red-500/20 text-center text-red-400">
          {error}
        </div>
      ) : games.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl border border-white/10 text-center space-y-3">
          <Swords className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-300">No Match Records Found</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">Play online rated games via Quick Match or Private Rooms to populate your persistent game history log!</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-white/5 text-slate-400 border-b border-white/10">
                <tr>
                  <th className="p-4">White Player</th>
                  <th className="p-4">Black Player</th>
                  <th className="p-4">Result</th>
                  <th className="p-4">Time Control</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Termination</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {games.map((game) => {
                  const whiteName = game.white?.username || 'White';
                  const blackName = game.black?.username || 'Black';
                  const isDraw = game.result === '1/2-1/2';

                  return (
                    <tr key={game.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 font-semibold text-white">♔ {whiteName}</td>
                      <td className="p-4 font-semibold text-white">♚ {blackName}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                          isDraw ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30' :
                          'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {game.result}
                        </span>
                      </td>
                      <td className="p-4 text-slate-300 font-medium">{game.timeControl}</td>
                      <td className="p-4 text-slate-400 capitalize">{game.ratingType}</td>
                      <td className="p-4 text-slate-400 capitalize">{game.termination || 'completed'}</td>
                      <td className="p-4 text-slate-400 text-xs">{new Date(game.playedAt).toLocaleDateString()}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => onSelectReplayGame && onSelectReplayGame(game.id)}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold inline-flex items-center transition-colors shadow-sm"
                        >
                          <Play className="w-3.5 h-3.5 mr-1" /> Replay
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-white/5 border-t border-white/10">
              <span className="text-xs text-slate-400">
                Page <strong className="text-white">{pagination.page}</strong> of <strong className="text-white">{pagination.totalPages}</strong> ({pagination.total} total games)
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
                  disabled={pagination.page >= pagination.totalPages}
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
