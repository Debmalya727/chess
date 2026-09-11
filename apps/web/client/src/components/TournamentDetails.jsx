import React, { useState } from 'react';
import { useTournaments } from '../hooks/useTournaments';
import { useAuth } from '../features/auth/AuthContext';
import { 
  ArrowLeft, Trophy, Users, Clock, Play, Swords, 
  RotateCw, AlertTriangle, FastForward, CheckCircle, XCircle 
} from 'lucide-react';

export function TournamentDetails({ tournamentId, onClose, onSelectReplayGame, onResumeGame }) {
  const { user, openAuthModal } = useAuth();
  const { 
    activeTournament, loading, error, 
    joinTournament, leaveTournament, startTournament, 
    nextSwissRound, pairArena, finishTournament, cancelTournament 
  } = useTournaments(tournamentId);

  const [activeTab, setActiveTab] = useState('standings'); // 'standings' | 'pairings' | 'matches'
  const [selectedRoundFilter, setSelectedRoundFilter] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (loading || !activeTournament) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const isUserRegistered = user && activeTournament.entries?.some(e => e.userId === user.id && !e.withdrawn);
  const isUserWithdrawn = user && activeTournament.entries?.some(e => e.userId === user.id && e.withdrawn);
  const isFinished = activeTournament.status === 'finished';
  const isRunning = activeTournament.status === 'running';
  const isRegistration = activeTournament.status === 'registration' || activeTournament.status === 'scheduled';
  const isOrganizer = user && (user.id === activeTournament.organizerId || user.role === 'TOURNAMENT_ORGANIZER' || user.role === 'ADMIN');
  const isSwiss = activeTournament.type === 'swiss';

  const handleJoin = async () => {
    if (!user) { openAuthModal(); return; }
    setActionLoading(true);
    setActionError(null);
    try {
      await joinTournament(tournamentId);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await leaveTournament(tournamentId);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await startTournament(tournamentId);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleNextRound = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await nextSwissRound(tournamentId);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePairArena = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await pairArena(tournamentId);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinish = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await finishTournament(tournamentId);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this tournament?')) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await cancelTournament(tournamentId);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Find if user currently has an active pairing/game
  const myActiveGame = user && activeTournament.games?.find(g => 
    (g.whitePlayerId === user.id || g.blackPlayerId === user.id) && 
    (g.status === 'ACTIVE' || g.status === 'WAITING')
  );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 text-white">
      {/* Header & Back Action */}
      <div className="flex items-center justify-between glass-panel p-4 px-6 rounded-2xl border border-white/10">
        <button
          onClick={onClose}
          className="flex items-center space-x-2 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 p-2 px-3 rounded-xl transition-colors font-semibold text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tournaments</span>
        </button>

        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
          isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse' :
          isFinished ? 'bg-slate-500/20 text-slate-400' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
        }`}>
          {activeTournament.status}
        </span>
      </div>

      {actionError && (
        <div className="glass-panel p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-400 font-bold hover:underline">Dismiss</button>
        </div>
      )}

      {/* Active Game Callout if player is paired right now */}
      {myActiveGame && (
        <div className="glass-panel p-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-3">
            <Swords className="w-6 h-6 text-emerald-400" />
            <div>
              <h4 className="text-sm font-bold text-white">Your Tournament Match is Active!</h4>
              <p className="text-xs text-slate-300">Round {myActiveGame.roundNumber || 1} • Unrated Elo</p>
            </div>
          </div>
          <button
            onClick={() => onResumeGame && onResumeGame(myActiveGame.gameId)}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs shadow-lg transition-colors"
          >
            Go to Board
          </button>
        </div>
      )}

      {/* Tournament Hero Card */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
              {activeTournament.type} format
            </span>
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-400">
              Unrated Elo Isolation
            </span>
            {isSwiss && (
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Round {activeTournament.currentRound || 0} of {activeTournament.totalRounds || 3}
              </span>
            )}
          </div>

          <h1 className="text-3xl font-black text-white">{activeTournament.name}</h1>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
            <span className="flex items-center"><Clock className="w-4 h-4 mr-1 text-emerald-400" /> Time Control: {activeTournament.timeControl}</span>
            <span className="flex items-center"><Users className="w-4 h-4 mr-1 text-emerald-400" /> Registered: {activeTournament.entries?.filter(e => !e.withdrawn).length || 0} / {activeTournament.maxPlayers}</span>
            {activeTournament.type === 'arena' && (
              <span className="flex items-center"><Clock className="w-4 h-4 mr-1 text-amber-400" /> Duration: {activeTournament.durationMinutes || 60} min</span>
            )}
          </div>
        </div>

        {/* Player Actions */}
        <div className="flex items-center gap-3">
          {isFinished ? (
            <span className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold">
              Tournament Concluded
            </span>
          ) : isUserRegistered ? (
            <button
              onClick={handleLeave}
              disabled={actionLoading}
              className="px-5 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-sm border border-red-500/30 transition-colors disabled:opacity-50"
            >
              {actionLoading ? 'Processing...' : isRunning ? 'Withdraw from Tournament' : 'Leave Tournament'}
            </button>
          ) : isUserWithdrawn ? (
            <span className="px-4 py-2 rounded-xl bg-red-500/20 text-red-300 text-xs font-bold border border-red-500/30">
              Withdrawn
            </span>
          ) : isRegistration ? (
            <button
              onClick={handleJoin}
              disabled={actionLoading || (activeTournament.entries?.filter(e => !e.withdrawn).length || 0) >= activeTournament.maxPlayers}
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-sm shadow-lg hover:shadow-emerald-500/20 transition-all disabled:opacity-50"
            >
              {actionLoading ? 'Registering...' : 'Register for Tournament'}
            </button>
          ) : (
            <span className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold">
              Registration Closed
            </span>
          )}
        </div>
      </div>

      {/* Organizer Controls Bar */}
      {isOrganizer && !isFinished && (
        <div className="glass-panel p-4 rounded-2xl border border-amber-500/30 bg-amber-950/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500 text-slate-950">
              Organizer Panel
            </span>
            <span className="text-xs text-amber-200 font-medium">Tournament Lifecycle Controls</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isRegistration && (
              <button
                onClick={handleStart}
                disabled={actionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition-colors disabled:opacity-50 flex items-center space-x-1"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Tournament</span>
              </button>
            )}

            {isRunning && isSwiss && (
              <button
                onClick={handleNextRound}
                disabled={actionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs transition-colors disabled:opacity-50 flex items-center space-x-1"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Next Swiss Round</span>
              </button>
            )}

            {isRunning && !isSwiss && (
              <button
                onClick={handlePairArena}
                disabled={actionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-colors disabled:opacity-50 flex items-center space-x-1"
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Pair Arena Batch</span>
              </button>
            )}

            {isRunning && (
              <button
                onClick={handleFinish}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors disabled:opacity-50 flex items-center space-x-1"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Finish Early</span>
              </button>
            )}

            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-xs transition-colors disabled:opacity-50 flex items-center space-x-1"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Tournament</span>
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('standings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 ${
            activeTab === 'standings' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>Standings</span>
        </button>

        <button
          onClick={() => setActiveTab('pairings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 ${
            activeTab === 'pairings' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Swords className="w-3.5 h-3.5" />
          <span>Rounds & Pairings ({activeTournament.pairings?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('matches')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 ${
            activeTab === 'matches' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>Games & Replays ({activeTournament.games?.length || 0})</span>
        </button>
      </div>

      {/* Tab 1: Standings */}
      {activeTab === 'standings' && (
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-base font-bold text-white flex items-center">
              <Trophy className="w-4 h-4 mr-2 text-amber-400" /> Official Standings & Buchholz Tiebreaks
            </h2>
            <span className="text-[11px] text-slate-400">Primary Tiebreak: Buchholz System</span>
          </div>

          {(!activeTournament.entries || activeTournament.entries.length === 0) ? (
            <p className="text-sm text-slate-400 py-8 text-center">No participants registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm text-slate-300">
                <thead className="text-[11px] uppercase bg-white/5 text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="p-3 w-12 text-center">Rank</th>
                    <th className="p-3">Player</th>
                    <th className="p-3 text-center">Score</th>
                    <th className="p-3 text-center">Buchholz</th>
                    <th className="p-3 text-center">Games</th>
                    <th className="p-3 text-center">Byes</th>
                    <th className="p-3 text-right">W / D / L</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activeTournament.entries.map((e) => {
                    const isMe = user && user.id === e.userId;
                    return (
                      <tr key={e.userId} className={isMe ? 'bg-emerald-500/15 font-semibold' : 'hover:bg-white/5'}>
                        <td className="p-3 text-center font-bold text-slate-400">#{e.rank}</td>
                        <td className="p-3 font-semibold text-white flex items-center space-x-2">
                          <span>{e.username}</span>
                          {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">You</span>}
                        </td>
                        <td className="p-3 text-center font-black text-amber-400 text-base">{e.score}</td>
                        <td className="p-3 text-center font-mono text-slate-300 font-bold">{e.tiebreakScore || 0.0}</td>
                        <td className="p-3 text-center font-mono text-slate-400">{e.gamesPlayed}</td>
                        <td className="p-3 text-center font-mono text-slate-400">{e.byesCount || 0}</td>
                        <td className="p-3 text-right font-mono text-slate-400">
                          <span className="text-emerald-400 font-bold">{e.wins}W</span> / <span>{e.draws}D</span> / <span className="text-red-400">{e.losses}L</span>
                        </td>
                        <td className="p-3 text-center">
                          {e.withdrawn ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">Withdrawn</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Active</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Rounds & Pairings */}
      {activeTab === 'pairings' && (
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-base font-bold text-white flex items-center">
              <Swords className="w-4 h-4 mr-2 text-emerald-400" /> Tournament Pairings Board
            </h2>
            <div className="flex items-center space-x-1 text-xs">
              <button
                onClick={() => setSelectedRoundFilter(null)}
                className={`px-2 py-1 rounded text-xs ${selectedRoundFilter === null ? 'bg-white/15 text-white font-bold' : 'text-slate-400'}`}
              >
                All Rounds
              </button>
              {activeTournament.rounds?.map(r => (
                <button
                  key={r.roundNumber}
                  onClick={() => setSelectedRoundFilter(r.roundNumber)}
                  className={`px-2 py-1 rounded text-xs ${selectedRoundFilter === r.roundNumber ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400'}`}
                >
                  R{r.roundNumber}
                </button>
              ))}
            </div>
          </div>

          {(!activeTournament.pairings || activeTournament.pairings.length === 0) ? (
            <p className="text-sm text-slate-400 py-8 text-center">No pairings generated yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm text-slate-300">
                <thead className="text-[11px] uppercase bg-white/5 text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="p-3 text-center w-16">Round</th>
                    <th className="p-3">White Player</th>
                    <th className="p-3 text-center">Result</th>
                    <th className="p-3">Black Player</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activeTournament.pairings
                    .filter(p => selectedRoundFilter === null || p.roundNumber === selectedRoundFilter)
                    .map((p) => {
                      const isMyPairing = user && (user.id === p.whiteUserId || user.id === p.blackUserId);
                      return (
                        <tr key={p.id} className={isMyPairing ? 'bg-emerald-500/10 font-medium' : 'hover:bg-white/5'}>
                          <td className="p-3 text-center font-mono font-bold text-slate-400">R{p.roundNumber}</td>
                          <td className="p-3 font-semibold text-white">
                            {p.whiteUsername || p.whiteUserId?.substring(0, 10)}
                            {user && user.id === p.whiteUserId && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 ml-1">You</span>}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-amber-400">
                            {p.isBye ? '1 - 0 (Bye)' : (p.result || 'vs')}
                          </td>
                          <td className="p-3 font-semibold text-white">
                            {p.isBye ? (
                              <span className="text-slate-500 italic">-- BYE --</span>
                            ) : (
                              <>
                                {p.blackUsername || p.blackUserId?.substring(0, 10)}
                                {user && user.id === p.blackUserId && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 ml-1">You</span>}
                              </>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {p.gameId && (
                              p.result ? (
                                <button
                                  onClick={() => onSelectReplayGame && onSelectReplayGame(p.gameId)}
                                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold inline-flex items-center"
                                >
                                  <Play className="w-3 h-3 mr-1" /> Replay
                                </button>
                              ) : isMyPairing ? (
                                <button
                                  onClick={() => onResumeGame && onResumeGame(p.gameId)}
                                  className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold inline-flex items-center shadow"
                                >
                                  Play Board
                                </button>
                              ) : (
                                <span className="text-[11px] text-emerald-400 font-mono">In Progress</span>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Matches & Replays */}
      {activeTab === 'matches' && (
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center border-b border-white/10 pb-3">
            <Play className="w-4 h-4 mr-2 text-emerald-400" /> Tournament Matches & Historical Replays
          </h2>

          {(!activeTournament.games || activeTournament.games.length === 0) ? (
            <p className="text-sm text-slate-400 py-8 text-center">No games played yet in this tournament.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeTournament.games.map((g) => (
                <div key={g.gameId} className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">Round {g.roundNumber}</span>
                    <span className={`capitalize px-2 py-0.5 rounded text-[10px] font-bold ${
                      g.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {g.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span>{g.whitePlayerId.substring(0, 8)} (W) vs {g.blackPlayerId.substring(0, 8)} (B)</span>
                    <span className="text-amber-400 font-mono text-sm">{g.result || '*'}</span>
                  </div>

                  {g.status === 'FINISHED' && (
                    <button
                      onClick={() => onSelectReplayGame && onSelectReplayGame(g.gameId)}
                      className="w-full py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-center transition-colors mt-2"
                    >
                      <Play className="w-3.5 h-3.5 mr-1" /> Replay Game PGN
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
