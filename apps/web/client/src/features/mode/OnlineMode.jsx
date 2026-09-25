import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Globe, Plus, Copy, Check, Users, ShieldAlert, Flag, Shield, Zap, Download, RefreshCw, Trophy } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { globalWsClient } from '../../services/wsClient.js';
import { ChessBoard } from '../../components/ChessBoard.jsx';
import { ChessClock } from '../../components/ChessClock.jsx';
import { useChessGame } from '../../hooks/useChessGame.js';
import { WS_EVENTS } from '@chess/protocol';

export function OnlineMode() {
  const { user, token, openAuthModal } = useAuth();

  const [connStatus, setConnStatus] = useState('DISCONNECTED');
  const [activeGame, setActiveGame] = useState(null); // { gameId, roomCode, status, whitePlayerId, blackPlayerId, color, result, termination, ratingChanges, pgn, tournamentId }
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [drawOfferReceived, setDrawOfferReceived] = useState(false);
  const [opponentPresence, setOpponentPresence] = useState('connected');

  // Rematch UI State
  const [rematchOfferedByMe, setRematchOfferedByMe] = useState(false);
  const [rematchOfferReceived, setRematchOfferReceived] = useState(false);
  const [rematchOfferedByUsername, setRematchOfferedByUsername] = useState(null);
  const [isRematchLoading, setIsRematchLoading] = useState(false);

  const activeGameRef = useRef(activeGame);
  useEffect(() => {
    activeGameRef.current = activeGame;
  }, [activeGame]);

  // Matchmaking State
  const [inQueue, setInQueue] = useState(false);
  const [queueTimeControl, setQueueTimeControl] = useState('10+0');
  const [queueRating, setQueueRating] = useState(1500);

  // Ratings State
  const [userRatings, setUserRatings] = useState(null);

  // Server clock state
  const [whiteTimeMs, setWhiteTimeMs] = useState(600000);
  const [blackTimeMs, setBlackTimeMs] = useState(600000);
  const [activeTurn, setActiveTurn] = useState('w');

  const {
    chess, fen, turn,
    selectedSquare, legalMoves, lastMove, kingSquare, isFlipped, pendingPromotion,
    isCheck, isCheckmate, isDraw, isStalemate, isGameOver,
    selectSquare, makeMove, completePromotion, loadFen,
    toggleFlip
  } = useChessGame();

  // Fetch User Ratings on Mount / Login
  useEffect(() => {
    if (user) {
      fetch(`/api/users/${user.username}/games`)
        .then(res => res.json())
        .catch(() => {});

      fetch('/api/me/ratings')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.ratings) {
            setUserRatings(data.ratings);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  // Connect WebSocket when token is available
  useEffect(() => {
    if (token) {
      globalWsClient.connect(token);
    }
    const unbindStatus = globalWsClient.onStatusChange(setConnStatus);
    return () => unbindStatus();
  }, [token]);

  // Listen for WebSocket Events
  useEffect(() => {
    const unbindInit = globalWsClient.on(WS_EVENTS.GAME_INIT, (payload) => {
      setInQueue(false);
      if (typeof window !== 'undefined') {
        window.__activeGameId = payload.gameId;
      }
      const myColor = payload.color || (user && payload.whitePlayerId === user.id ? 'w' : (user && payload.blackPlayerId === user.id ? 'b' : 'w'));
      if (typeof window !== 'undefined') {
        window.__activeGameColor = myColor;
      }

      setActiveGame({
        gameId: payload.gameId,
        roomCode: payload.roomCode,
        status: payload.status || 'ACTIVE',
        whitePlayerId: payload.whitePlayerId || payload.whitePlayer?.id,
        blackPlayerId: payload.blackPlayerId || payload.blackPlayer?.id,
        whiteUsername: payload.whitePlayer?.username || payload.whiteUsername || 'White',
        blackUsername: payload.blackPlayer?.username || payload.blackUsername || 'Black',
        whiteRating: payload.whitePlayer?.rating || payload.whiteRating || 1500,
        blackRating: payload.blackPlayer?.rating || payload.blackRating || 1500,
        timeControl: payload.timeControl || '10+0',
        color: myColor,
        stateVersion: payload.stateVersion || 1,
        tournamentId: payload.tournamentId || null
      });
      if (payload.roomCode) {
        localStorage.setItem('chess_active_room', payload.roomCode);
      }
      if (payload.fen) loadFen(payload.fen);
      if (payload.clocks) {
        setWhiteTimeMs(payload.clocks.whiteRemainingMs);
        setBlackTimeMs(payload.clocks.blackRemainingMs);
        setActiveTurn(payload.clocks.activeColor || 'w');
      }

      setRematchOfferedByMe(false);
      setRematchOfferReceived(false);
      setRematchOfferedByUsername(null);
      setIsRematchLoading(false);
    });

    const unbindMatched = globalWsClient.on(WS_EVENTS.QUEUE_MATCHED, (payload) => {
      setInQueue(false);
      if (payload?.roomCode) {
        localStorage.setItem('chess_active_room', payload.roomCode);
        globalWsClient.joinRoom(payload.roomCode);
      }
    });

    const unbindQueueStatus = globalWsClient.on(WS_EVENTS.QUEUE_STATUS, (payload) => {
      setInQueue(payload.inQueue);
      if (payload.timeControl) setQueueTimeControl(payload.timeControl);
      if (payload.rating) setQueueRating(payload.rating);
    });

    const unbindAccepted = globalWsClient.on(WS_EVENTS.MOVE_ACCEPTED, (payload) => {
      console.log('[OnlineMode] MOVE_ACCEPTED received:', payload.fen, 'isEnded:', payload.isEnded);
      if (payload.fen) loadFen(payload.fen);
      if (payload.clocks) {
        setWhiteTimeMs(payload.clocks.whiteRemainingMs);
        setBlackTimeMs(payload.clocks.blackRemainingMs);
        setActiveTurn(payload.clocks.activeColor);
      }
    });

    const unbindRejected = globalWsClient.on(WS_EVENTS.MOVE_REJECTED, (payload) => {
      console.warn('[OnlineMode] MOVE_REJECTED received:', payload);
      setErrorMsg(`Move rejected: ${payload.reason || 'Illegal move'}`);
      setTimeout(() => setErrorMsg(null), 3000);
    });

    const unbindClock = globalWsClient.on(WS_EVENTS.CLOCK_TICK, (payload) => {
      setWhiteTimeMs(payload.whiteTimeRemaining);
      setBlackTimeMs(payload.blackTimeRemaining);
      setActiveTurn(payload.activeColor);
    });

    const unbindEnded = globalWsClient.on(WS_EVENTS.GAME_ENDED, (payload) => {
      console.log('[OnlineMode] GAME_ENDED received:', payload);
      setActiveGame(prev => prev ? {
        ...prev,
        status: 'FINISHED',
        result: payload.result,
        termination: payload.termination,
        ratingChanges: payload.ratingChanges
      } : null);
      localStorage.removeItem('chess_active_room');
      if (payload.finalFen) loadFen(payload.finalFen);
    });

    const unbindDrawOffer = globalWsClient.on(WS_EVENTS.DRAW_OFFERED, () => {
      setDrawOfferReceived(true);
    });

    const unbindPresence = globalWsClient.on(WS_EVENTS.PLAYER_PRESENCE, (payload) => {
      setOpponentPresence(payload.status);
    });

    const unbindRematchOffered = globalWsClient.on(WS_EVENTS.REMATCH_OFFERED, (payload) => {
      const currentGame = activeGameRef.current;
      if (!currentGame || currentGame.gameId !== payload.gameId) return;
      if (currentGame.status !== 'FINISHED') return;

      if (payload.offeredBy !== user?.id) {
        setRematchOfferReceived(true);
        setRematchOfferedByUsername(payload.offeredByUsername || 'Opponent');
        setIsRematchLoading(false);
      } else {
        setRematchOfferedByMe(true);
        setIsRematchLoading(false);
      }
    });

    const unbindRematchDeclined = globalWsClient.on(WS_EVENTS.REMATCH_DECLINED, (payload) => {
      const currentGame = activeGameRef.current;
      if (!currentGame || currentGame.gameId !== payload.gameId) return;

      setRematchOfferedByMe(false);
      setRematchOfferReceived(false);
      setIsRematchLoading(false);
    });

    const unbindRematchCancelled = globalWsClient.on(WS_EVENTS.REMATCH_CANCELLED, (payload) => {
      const currentGame = activeGameRef.current;
      if (!currentGame || currentGame.gameId !== payload.gameId) return;

      setRematchOfferedByMe(false);
      setRematchOfferReceived(false);
      setIsRematchLoading(false);

      if (payload.reason === 'timeout') {
        setErrorMsg('Rematch offer expired.');
      } else if (payload.reason === 'opponent_disconnected') {
        setErrorMsg('Opponent disconnected.');
      } else if (payload.reason === 'cancelled_by_player') {
        setErrorMsg('Rematch offer was cancelled.');
      }
      setTimeout(() => setErrorMsg(null), 4000);
    });

    const unbindError = globalWsClient.on(WS_EVENTS.ERROR, (payload) => {
      const code = payload?.code;
      if (code && (code.startsWith('REMATCH_') || code === 'GAME_NOT_FINISHED' || code === 'TOURNAMENT_REMATCH_NOT_ALLOWED' || code === 'PLAYER_ALREADY_IN_GAME')) {
        setIsRematchLoading(false);
        setRematchOfferedByMe(false);
        setErrorMsg(payload.message || code);
        setTimeout(() => setErrorMsg(null), 4000);
      }
    });

    return () => {
      unbindInit();
      unbindMatched();
      unbindQueueStatus();
      unbindAccepted();
      unbindRejected();
      unbindClock();
      unbindEnded();
      unbindDrawOffer();
      unbindPresence();
      unbindRematchOffered();
      unbindRematchDeclined();
      unbindRematchCancelled();
      unbindError();
    };
  }, [user, loadFen]);

  const handleJoinQueue = (tc) => {
    if (!user) { openAuthModal(); return; }
    setQueueTimeControl(tc);
    globalWsClient.joinQueue(tc);
  };

  const handleLeaveQueue = () => {
    globalWsClient.leaveQueue();
  };

  const handleCreateRoom = (tc, pref) => {
    if (!user) { openAuthModal(); return; }
    globalWsClient.createRoom(tc, pref);
  };

  const handleJoinRoom = () => {
    if (!user) { openAuthModal(); return; }
    if (!roomCodeInput.trim()) return;
    globalWsClient.joinRoom(roomCodeInput.trim().toUpperCase());
  };

  const handleSquareSelect = (sq) => {
    if (!activeGame || activeGame.status !== 'ACTIVE') return;
    if (turn !== activeGame.color) return;

    if (selectedSquare) {
      const moves = chess.moves({ square: selectedSquare, verbose: true });
      const target = moves.find(m => m.to === sq);
      if (target) {
        const isPromotion = target.flags && target.flags.includes('p');
        globalWsClient.submitMove(
          activeGame.gameId, 
          selectedSquare, 
          sq, 
          isPromotion ? (target.promotion || 'q') : null
        );
      }
    }
    selectSquare(sq);
  };


  const copyRoomCode = () => {
    if (!activeGame) return;
    navigator.clipboard.writeText(activeGame.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPGN = () => {
    if (!activeGame || !activeGame.gameId) return;
    window.open(`/api/games/${activeGame.gameId}/pgn`, '_blank');
  };

  const handleOfferRematch = () => {
    if (!activeGame || activeGame.status !== 'FINISHED' || activeGame.tournamentId || rematchOfferedByMe || isRematchLoading) {
      return;
    }
    setIsRematchLoading(true);
    setRematchOfferedByMe(true);
    setErrorMsg(null);
    globalWsClient.offerRematch(activeGame.gameId);
  };

  const handleRespondRematch = (accept) => {
    if (!activeGame || activeGame.status !== 'FINISHED') return;
    if (accept) {
      setIsRematchLoading(true);
      setErrorMsg(null);
    } else {
      setRematchOfferReceived(false);
      setIsRematchLoading(false);
    }
    globalWsClient.respondRematch(activeGame.gameId, accept);
  };

  const handleCancelRematch = () => {
    if (!activeGame || activeGame.status !== 'FINISHED' || !rematchOfferedByMe) return;
    setRematchOfferedByMe(false);
    setIsRematchLoading(false);
    globalWsClient.cancelRematch(activeGame.gameId);
  };

  if (!user) {
    return (
      <div className="online-lobby-card">
        <Globe size={48} style={{ color: '#818cf8', marginBottom: '1rem' }} />
        <h3>Online Multiplayer</h3>
        <p>Sign in or create a free account to play real-time rated games with players online.</p>
        <button className="btn btn-primary" onClick={openAuthModal} style={{ marginTop: '1rem' }}>
          Login or Register to Play Online
        </button>
      </div>
    );
  }

  return (
    <div className="online-mode-container">
      {errorMsg && <div className="status-banner check">{errorMsg}</div>}

      {/* Connection Indicator Header */}
      <div className="connection-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.5rem 1rem', background: '#1e293b', borderRadius: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: connStatus === 'CONNECTED' ? '#22c55e' : connStatus === 'RECONNECTING' ? '#f59e0b' : '#ef4444' }} />
          <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>{connStatus}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
          <span><Trophy size={14} style={{ color: '#f59e0b', inlineSize: 'auto' }} /> Ratings:</span>
          {userRatings ? (
            userRatings.map(r => (
              <span key={r.ratingType} style={{ background: '#334155', padding: '2px 8px', borderRadius: '4px' }}>
                {r.ratingType.toUpperCase()}: <strong>{r.rating}</strong>
              </span>
            ))
          ) : (
            <span>1500 (Base)</span>
          )}
        </div>
      </div>

      {!activeGame || activeGame.status === 'WAITING' ? (
        <div className="online-lobby-grid">
          {/* Quick Matchmaking Card */}
          <div className="lobby-card">
            <h3><Zap size={18} style={{ color: '#f59e0b' }} /> Quick Matchmaking</h3>
            <p>Find an online opponent instantly matched by rating.</p>
            {inQueue ? (
              <div className="room-invite-box">
                <div className="waiting-pulse" style={{ color: '#818cf8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <RefreshCw size={16} className="spin" /> Searching for {queueTimeControl} opponent...
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                  Rating Range: {Math.max(100, queueRating - 100)} — {queueRating + 100} (expanding ±50 / 5s)
                </div>
                <button className="btn btn-secondary" onClick={handleLeaveQueue} style={{ marginTop: '0.75rem' }}>
                  Cancel Queue
                </button>
              </div>
            ) : (
              <div className="create-room-buttons">
                <button className="btn btn-primary" onClick={() => handleJoinQueue('1+0')}>1+0 Bullet</button>
                <button className="btn btn-primary" onClick={() => handleJoinQueue('3+2')}>3+2 Blitz</button>
                <button className="btn btn-primary" onClick={() => handleJoinQueue('5+0')}>5+0 Blitz</button>
                <button className="btn btn-primary" onClick={() => handleJoinQueue('10+0')}>10+0 Rapid</button>
              </div>
            )}
          </div>

          {/* Private Room Card */}
          <div className="lobby-card">
            <h3><Plus size={18} /> Create Private Room</h3>
            <p>Generate a private room code to challenge a friend.</p>
            <div className="create-room-buttons">
              <button className="btn btn-secondary" onClick={() => handleCreateRoom('10+0', 'random')}>Rapid 10+0</button>
              <button className="btn btn-secondary" onClick={() => handleCreateRoom('5+0', 'random')}>Blitz 5+0</button>
              <button className="btn btn-secondary" onClick={() => handleCreateRoom('3+2', 'random')}>Blitz 3+2</button>
            </div>

            {activeGame && activeGame.status === 'WAITING' && (
              <div className="room-invite-box">
                <div className="invite-label">Room Code (Share with opponent):</div>
                <div className="code-display">
                  <span>{activeGame.roomCode}</span>
                  <button className="btn btn-secondary" onClick={copyRoomCode}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <div className="waiting-pulse">Waiting for opponent to join...</div>
              </div>
            )}
          </div>

          {/* Join Private Room Card */}
          <div className="lobby-card">
            <h3><Users size={18} /> Join Private Room</h3>
            <p>Enter an invite room code from a friend.</p>
            <div className="join-input-group">
              <input
                type="text"
                value={roomCodeInput}
                onChange={e => setRoomCodeInput(e.target.value)}
                placeholder="e.g. ROOM_A8B9C"
                className="setting-select"
              />
              <button className="btn btn-primary" onClick={handleJoinRoom}>Join</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="active-online-game">
          <div className="board-card">
            <ChessClock
              whiteTimeMs={whiteTimeMs}
              blackTimeMs={blackTimeMs}
              activeTurn={activeTurn}
              isRunning={activeGame.status === 'ACTIVE'}
              whitePlayerName={activeGame.color === 'w' ? `You (${user.username}) [${activeGame.whiteRating || 1500}]` : `Opponent [${activeGame.whiteRating || 1500}]`}
              blackPlayerName={activeGame.color === 'b' ? `You (${user.username}) [${activeGame.blackRating || 1500}]` : `Opponent [${activeGame.blackRating || 1500}]`}
            />

            <ChessBoard
              chess={chess}
              selectedSquare={selectedSquare}
              legalMoves={legalMoves}
              lastMove={lastMove}
              kingSquare={kingSquare}
              isFlipped={activeGame.color === 'b'}
              pendingPromotion={pendingPromotion}
              onSquareSelect={handleSquareSelect}
              onPromotionComplete={completePromotion}
            />

            {/* Game Over Banner */}
            {activeGame.status === 'FINISHED' && (
              <div className="game-over-banner" style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', marginTop: '1rem' }}>
                <h2 style={{ color: activeGame.result === '1/2-1/2' ? '#f59e0b' : ((activeGame.result === '1-0' && activeGame.color === 'w') || (activeGame.result === '0-1' && activeGame.color === 'b')) ? '#22c55e' : '#ef4444' }}>
                  {activeGame.result === '1/2-1/2' ? 'Game Drawn' : ((activeGame.result === '1-0' && activeGame.color === 'w') || (activeGame.result === '0-1' && activeGame.color === 'b')) ? 'Victory!' : 'Defeat'}
                </h2>
                <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>
                  Termination: <strong>{(activeGame.termination || 'COMPLETED').toUpperCase()}</strong> ({activeGame.result})
                </p>
                {/* Rematch Controls - Suppressed for Tournament Games */}
                {!activeGame.tournamentId && (
                  <div className="rematch-section" style={{ marginBottom: '1rem', padding: '0.75rem', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                    {rematchOfferReceived ? (
                      <div className="rematch-offer-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                          {rematchOfferedByUsername || 'Opponent'} offered a rematch!
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-primary"
                            data-testid="rematch-accept-btn"
                            disabled={isRematchLoading}
                            onClick={() => handleRespondRematch(true)}
                            style={{ background: '#22c55e', borderColor: '#22c55e' }}
                          >
                            <Check size={16} /> Accept
                          </button>
                          <button
                            className="btn btn-secondary"
                            data-testid="rematch-decline-btn"
                            disabled={isRematchLoading}
                            onClick={() => handleRespondRematch(false)}
                            style={{ color: '#ef4444' }}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ) : rematchOfferedByMe ? (
                      <div className="rematch-waiting-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b', fontSize: '0.9rem', fontWeight: 500 }}>
                          <RefreshCw size={16} className="spin" />
                          <span>Rematch offered... Waiting for opponent</span>
                        </div>
                        <button
                          className="btn btn-secondary"
                          data-testid="rematch-cancel-btn"
                          onClick={handleCancelRematch}
                          style={{ color: '#ef4444' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                          className="btn btn-primary"
                          data-testid="rematch-btn"
                          disabled={isRematchLoading}
                          onClick={handleOfferRematch}
                          style={{ background: '#22c55e', borderColor: '#22c55e' }}
                        >
                          <RefreshCw size={16} className={isRematchLoading ? 'spin' : ''} /> Rematch
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                  <button className="btn btn-primary" onClick={downloadPGN}>
                    <Download size={16} /> Download PGN
                  </button>
                  <button className="btn btn-secondary" onClick={() => {
                    setRematchOfferedByMe(false);
                    setRematchOfferReceived(false);
                    setRematchOfferedByUsername(null);
                    setIsRematchLoading(false);
                    setActiveGame(null);
                  }}>
                    Back to Lobby
                  </button>
                </div>
              </div>
            )}

            {/* In-Game Action Bar */}
            {activeGame.status === 'ACTIVE' && (
              <div className="online-action-bar" style={{ marginTop: '1rem' }}>
                {drawOfferReceived ? (
                  <div className="draw-response-group">
                    <span>Opponent offered a draw:</span>
                    <button className="btn btn-primary" onClick={() => {
                      globalWsClient.respondDraw(activeGame.gameId, true);
                      setDrawOfferReceived(false);
                    }}>Accept</button>
                    <button className="btn btn-secondary" onClick={() => {
                      globalWsClient.respondDraw(activeGame.gameId, false);
                      setDrawOfferReceived(false);
                    }}>Decline</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                    <button className="btn btn-secondary" onClick={() => globalWsClient.offerDraw(activeGame.gameId)}>
                      <Shield size={16} /> Offer Draw
                    </button>
                    <button className="btn btn-secondary" onClick={() => globalWsClient.resign(activeGame.gameId)}>
                      <Flag size={16} /> Resign
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
