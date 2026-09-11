import React, { useState } from 'react';
import { useTournaments } from '../hooks/useTournaments';
import { useAuth } from '../features/auth/AuthContext';
import { Swords, Trophy, Users, Clock, Plus, RefreshCw, ArrowRight, Filter } from 'lucide-react';

export function TournamentList({ onSelectTournament }) {
  const { user } = useAuth();
  const { tournaments, loading, error, refreshTournaments, createTournament } = useTournaments();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Creation modal / inline drawer state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('arena');
  const [formTimeControl, setFormTimeControl] = useState('5+0');
  const [formDuration, setFormDuration] = useState('60');
  const [formRounds, setFormRounds] = useState('3');
  const [formMaxPlayers, setFormMaxPlayers] = useState('64');

  const canCreate = user && (user.role === 'TOURNAMENT_ORGANIZER' || user.role === 'ADMIN' || true);

  const handleCreateTournament = async (e) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createTournament({
        name: formName.trim(),
        type: formType,
        timeControl: formTimeControl,
        durationMinutes: parseInt(formDuration, 10) || 60,
        totalRounds: parseInt(formRounds, 10) || 3,
        maxPlayers: parseInt(formMaxPlayers, 10) || 64,
        rated: false
      });
      setFormName('');
      setShowCreate(false);
      await refreshTournaments();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const filteredTournaments = tournaments.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 rounded-2xl border border-white/10">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center">
            <Swords className="w-7 h-7 mr-2.5 text-emerald-400" /> Competitive Tournaments
          </h1>
          <p className="text-slate-400 text-sm mt-1">Competitive Tournament Platform. Compete in server-authoritative Swiss & Arena tournament championships.</p>
        </div>

        <div className="flex items-center space-x-3">
          {canCreate && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition-colors shadow-lg hover:shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>{showCreate ? 'Close Form' : 'New Tournament'}</span>
            </button>
          )}

          <button
            onClick={() => refreshTournaments()}
            className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300 transition-colors font-semibold border border-white/10"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Expandable Tournament Creation Form */}
      {showCreate && (
        <form onSubmit={handleCreateTournament} className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-sm font-bold text-emerald-400 flex items-center">
              <Plus className="w-4 h-4 mr-1.5" /> Configure New Tournament Event
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Server-Authoritative • Unrated Elo Isolated</span>
          </div>

          {createError && (
            <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-xs">
              {createError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Tournament Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Masterclass Swiss Open"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Format</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/50"
              >
                <option value="arena">Arena (Continuous Matches)</option>
                <option value="swiss">Swiss (Round-Based / Buchholz)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Time Control</label>
              <select
                value={formTimeControl}
                onChange={(e) => setFormTimeControl(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/50"
              >
                <option value="3+2">3+2 Blitz</option>
                <option value="5+0">5+0 Blitz</option>
                <option value="10+0">10+0 Rapid</option>
                <option value="15+10">15+10 Classical</option>
              </select>
            </div>

            {formType === 'arena' ? (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Duration (minutes)</label>
                <input
                  type="number"
                  min="5"
                  max="360"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">Total Rounds</label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={formRounds}
                  onChange={(e) => setFormRounds(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">Max Players</label>
              <input
                type="number"
                min="2"
                max="256"
                value={formMaxPlayers}
                onChange={(e) => setFormMaxPlayers(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={creating || !formName.trim()}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold text-xs transition-colors shadow-md"
            >
              {creating ? 'Creating...' : 'Launch Tournament'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-panel p-3 px-4 rounded-xl border border-white/10 text-xs">
        <div className="flex items-center space-x-1 sm:space-x-2">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
          <span className="text-slate-400 font-semibold mr-1">Status:</span>
          {['all', 'registration', 'running', 'finished'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-lg capitalize transition-colors font-medium ${
                statusFilter === s ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-1 sm:space-x-2">
          <span className="text-slate-400 font-semibold mr-1">Format:</span>
          {['all', 'arena', 'swiss'].map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-2.5 py-1 rounded-lg capitalize transition-colors font-medium ${
                typeFilter === f ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List State */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        </div>
      ) : error ? (
        <div className="glass-panel p-6 rounded-xl border border-red-500/20 text-center text-red-400">
          {error}
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl border border-white/10 text-center space-y-3">
          <Trophy className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-300">No Matching Tournaments</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto">Create a new Arena or Swiss tournament event above to start playing!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTournaments.map((t) => {
            const isArena = t.type === 'arena';
            const isRunning = t.status === 'running';
            const isFinished = t.status === 'finished';

            return (
              <div
                key={t.id}
                className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4 hover:border-emerald-500/30 transition-all flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                      isArena ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    }`}>
                      {t.type} format
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      isRunning ? 'bg-emerald-500/20 text-emerald-400 animate-pulse border border-emerald-500/30' :
                      isFinished ? 'bg-slate-500/20 text-slate-400' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {t.status}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white line-clamp-1">{t.name}</h3>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1 text-slate-400" /> {t.timeControl}</span>
                    <span className="flex items-center"><Users className="w-3.5 h-3.5 mr-1 text-slate-400" /> Max {t.maxPlayers}</span>
                    {isArena ? (
                      <span className="text-[11px] text-slate-500">Duration: {t.durationMinutes || 60}m</span>
                    ) : (
                      <span className="text-[11px] text-slate-500">Rounds: {t.currentRound || 0} / {t.totalRounds || 3}</span>
                    )}
                    <span className="text-[11px] text-slate-500">Unrated Elo</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                  <button
                    onClick={() => onSelectTournament && onSelectTournament(t.id)}
                    className="flex-1 py-2 px-3 rounded-xl bg-white/5 hover:bg-emerald-500/20 text-slate-200 hover:text-emerald-300 font-bold text-xs inline-flex items-center justify-center transition-colors border border-white/10"
                  >
                    <span>View Event Details</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
