import React, { useEffect } from 'react';
import { Swords, Check, X, Clock } from 'lucide-react';
import { useSocial } from '../hooks/useSocial.js';
import { useGameMode, GAME_MODES } from '../features/mode/GameModeContext.jsx';
import { globalWsClient } from '../services/wsClient.js';
import { WS_EVENTS } from '@chess/protocol';

export function ChallengeNotification() {
  const { challenges, acceptChallenge, declineChallenge } = useSocial();
  const { setActiveMode } = useGameMode();

  // Listen for CHALLENGE_ACCEPTED event (e.g. for the challenger)
  useEffect(() => {
    const unbind = globalWsClient.on(WS_EVENTS.CHALLENGE_ACCEPTED, (payload) => {
      if (payload && payload.roomCode) {
        localStorage.setItem('chess_active_room', payload.roomCode);
        globalWsClient.joinRoom(payload.roomCode);
        setActiveMode(GAME_MODES.ONLINE);
      }
    });
    return () => unbind();
  }, [setActiveMode]);

  const pendingIncoming = challenges.incoming && challenges.incoming.length > 0
    ? challenges.incoming[0]
    : null;

  if (!pendingIncoming) return null;

  const handleAccept = async () => {
    const res = await acceptChallenge(pendingIncoming.id);
    if (res && res.success) {
      if (res.roomCode) {
        localStorage.setItem('chess_active_room', res.roomCode);
        globalWsClient.joinRoom(res.roomCode);
      }
      setActiveMode(GAME_MODES.ONLINE);
    }
  };

  const handleDecline = async () => {
    await declineChallenge(pendingIncoming.id);
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      maxWidth: '380px',
      backgroundColor: '#0f172a',
      border: '1px solid #10b981',
      borderRadius: '16px',
      padding: '16px 20px',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(16, 185, 129, 0.2)',
      color: '#fff',
      animation: 'slideUp 0.3s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#10b981'
        }}>
          <Swords size={18} />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Direct Challenge</h4>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            From <strong style={{ color: '#fff' }}>{pendingIncoming.challengerUsername}</strong> ({pendingIncoming.challengerRating})
          </span>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.8rem',
        color: '#cbd5e1',
        margin: '8px 0 12px 0',
        padding: '6px 10px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px'
      }}>
        <Clock size={14} style={{ color: '#10b981' }} />
        <span>{pendingIncoming.timeControl} • {pendingIncoming.ratingType?.toUpperCase()}</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={handleDecline}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <X size={14} /> Decline
        </button>
        <button
          onClick={handleAccept}
          style={{
            padding: '6px 16px',
            borderRadius: '8px',
            backgroundColor: '#10b981',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <Check size={14} /> Accept
        </button>
      </div>
    </div>
  );
}
