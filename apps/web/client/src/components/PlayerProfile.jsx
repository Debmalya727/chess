import React from 'react';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import { RatingCard } from './RatingCard';
import { User, Calendar, Trophy, Swords, Shield, Activity, Play, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export function PlayerProfile({ username = null, onSelectReplayGame }) {
  const {
    profile,
    loading,
    error,
    selectedRatingType,
    setSelectedRatingType,
    ratingHistory,
    historyLoading
  } = usePlayerProfile(username);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="glass-panel p-8 rounded-xl text-center border border-red-500/20 max-w-lg mx-auto my-8">
        <h3 className="text-xl font-bold text-red-400 mb-2">Error Loading Profile</h3>
        <p className="text-slate-300 text-sm">{error || 'Player profile not found.'}</p>
      </div>
    );
  }

  const { statistics = {}, ratings = {}, recentGames = [] } = profile;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 text-white">
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 relative overflow-hidden bg-gradient-to-r from-slate-900/90 via-slate-800/80 to-slate-900/90 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 relative z-10">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-1 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
            <User className="w-10 h-10 text-white" />
          </div>
          <div className="text-center sm:text-left flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">{profile.username}</h1>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-1 text-slate-400 text-sm">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span>Member since {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '2026'}</span>
                </div>
              </div>
              <div className="inline-flex items-center px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-sm">
                <Trophy className="w-4 h-4 mr-2" />
                <span>Overall Win Rate: {statistics.winRate || 0}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rating Cards Grid */}
      <div>
        <h2 className="text-lg font-bold text-slate-200 mb-3 flex items-center">
          <Activity className="w-5 h-5 mr-2 text-emerald-400" /> Ratings Dashboard
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {['bullet', 'blitz', 'rapid', 'classical'].map((type) => (
            <RatingCard
              key={type}
              type={type}
              ratingData={ratings[type]}
              isSelected={selectedRatingType === type}
              onSelect={setSelectedRatingType}
            />
          ))}
        </div>
      </div>

      {/* Statistics Summary Banner */}
      <div className="glass-panel p-6 rounded-xl border border-white/10 bg-white/5">
        <h3 className="text-md font-bold text-slate-300 mb-4 flex items-center">
          <Swords className="w-5 h-5 mr-2 text-blue-400" /> Lifetime Statistics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <div className="p-3 rounded-lg bg-white/5">
            <div className="text-2xl font-black text-white">{statistics.games || 0}</div>
            <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Total Games</div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="text-2xl font-black text-emerald-400">{statistics.wins || 0}</div>
            <div className="text-xs text-emerald-300 mt-1 uppercase tracking-wider">Wins</div>
          </div>
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <div className="text-2xl font-black text-rose-400">{statistics.losses || 0}</div>
            <div className="text-xs text-rose-300 mt-1 uppercase tracking-wider">Losses</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-500/10 border border-slate-500/20">
            <div className="text-2xl font-black text-slate-300">{statistics.draws || 0}</div>
            <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Draws</div>
          </div>
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 col-span-2 sm:col-span-1">
            <div className="text-2xl font-black text-blue-400">{statistics.winRate || 0}%</div>
            <div className="text-xs text-blue-300 mt-1 uppercase tracking-wider">Win Rate</div>
          </div>
        </div>
      </div>

      {/* Selected Rating History Log */}
      {selectedRatingType && (
        <div className="glass-panel p-6 rounded-xl border border-white/10 bg-white/5">
          <h3 className="text-md font-bold text-slate-300 mb-4 capitalize flex items-center">
            <Shield className="w-5 h-5 mr-2 text-indigo-400" /> {selectedRatingType} Rating History
          </h3>
          {historyLoading ? (
            <div className="text-slate-400 text-sm py-4 text-center">Loading rating history...</div>
          ) : ratingHistory.length === 0 ? (
            <div className="text-slate-400 text-sm py-4 text-center">No rating history records found for {selectedRatingType}.</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {ratingHistory.map((h, i) => (
                <div key={h.id || i} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 text-sm">
                  <div className="flex items-center space-x-3">
                    {h.delta > 0 ? (
                      <span className="flex items-center text-emerald-400 font-bold">
                        <ArrowUpRight className="w-4 h-4 mr-1" /> +{h.delta}
                      </span>
                    ) : h.delta < 0 ? (
                      <span className="flex items-center text-rose-400 font-bold">
                        <ArrowDownRight className="w-4 h-4 mr-1" /> {h.delta}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-bold">0</span>
                    )}
                    <span className="text-slate-300 font-medium">{h.previousRating} → <strong className="text-white">{h.rating}</strong></span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-slate-400">{new Date(h.createdAt).toLocaleDateString()}</span>
                    {h.gameId && onSelectReplayGame && (
                      <button
                        onClick={() => onSelectReplayGame(h.gameId)}
                        className="p-1 px-2.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center transition-colors"
                      >
                        <Play className="w-3 h-3 mr-1" /> Replay
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Games List */}
      {recentGames.length > 0 && (
        <div className="glass-panel p-6 rounded-xl border border-white/10 bg-white/5">
          <h3 className="text-md font-bold text-slate-300 mb-4 flex items-center">
            <Play className="w-5 h-5 mr-2 text-emerald-400" /> Recent Matches
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-white/5 text-slate-400">
                <tr>
                  <th className="p-3">Opponent</th>
                  <th className="p-3">Result</th>
                  <th className="p-3">Time Control</th>
                  <th className="p-3">Termination</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentGames.map((game) => {
                  const isWhite = game.whitePlayerId === profile.id;
                  const opponentName = isWhite ? game.blackUsername : game.whiteUsername;
                  const won = (isWhite && game.result === '1-0') || (!isWhite && game.result === '0-1');
                  const draw = game.result === '1/2-1/2';

                  return (
                    <tr key={game.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-semibold text-white">vs {opponentName} ({isWhite ? 'White' : 'Black'})</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          won ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          draw ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30' :
                          'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {won ? 'WIN' : draw ? 'DRAW' : 'LOSS'} ({game.result})
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{game.timeControl}</td>
                      <td className="p-3 text-slate-400 capitalize">{game.termination || 'completed'}</td>
                      <td className="p-3 text-slate-400 text-xs">{new Date(game.createdAt).toLocaleDateString()}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => onSelectReplayGame && onSelectReplayGame(game.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold inline-flex items-center transition-colors"
                        >
                          <Play className="w-3 h-3 mr-1" /> Replay
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
