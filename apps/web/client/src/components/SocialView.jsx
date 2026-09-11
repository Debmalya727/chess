import React, { useState } from 'react';
import { Users, UserPlus, Clock, Shield, Swords, Check, X, UserMinus, Search, Ban } from 'lucide-react';
import { useSocial } from '../hooks/useSocial.js';
import { ChallengeModal } from './ChallengeModal.jsx';

export function SocialView({ onSelectUser }) {
  const {
    friends,
    requests,
    opponents,
    blocked,
    loading,
    refresh,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    sendChallenge
  } = useSocial();

  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'requests' | 'add' | 'opponents' | 'blocked'
  const [searchUsername, setSearchUsername] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [challengeTarget, setChallengeTarget] = useState(null);

  const handleSendRequest = async (e) => {
    e.preventDefault();
    if (!searchUsername.trim()) return;
    setFeedback(null);
    const res = await sendFriendRequest(searchUsername.trim());
    if (res.error) {
      setFeedback({ type: 'error', message: res.message || res.error });
    } else {
      setFeedback({ type: 'success', message: `Friend request sent to "${searchUsername}"!` });
      setSearchUsername('');
    }
  };

  const onlineFriends = friends.filter(f => f.presence === 'online' || f.presence === 'playing');
  const offlineFriends = friends.filter(f => f.presence !== 'online' && f.presence !== 'playing');

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px', color: '#fff' }}>
      {/* Title & Navigation Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={28} style={{ color: '#10b981' }} />
            Social & Friends
          </h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Connect with players, challenge friends, and track your recent opponents.
          </p>
        </div>

        <div style={{
          display: 'flex',
          backgroundColor: '#0f172a',
          borderRadius: '12px',
          padding: '4px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          gap: '4px'
        }}>
          {[
            { id: 'friends', label: `Friends (${friends.length})` },
            { id: 'requests', label: `Requests ${requests.incoming.length > 0 ? `(${requests.incoming.length})` : ''}` },
            { id: 'add', label: 'Add Friend' },
            { id: 'opponents', label: `Opponents (${opponents.length})` },
            { id: 'blocked', label: `Blocked (${blocked.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setFeedback(null); if (refresh) refresh(); }}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#10b981' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div style={{
          backgroundColor: feedback.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          border: feedback.type === 'error' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
          color: feedback.type === 'error' ? '#f87171' : '#34d399',
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '20px',
          fontSize: '0.9rem'
        }}>
          {feedback.message}
        </div>
      )}

      {/* TAB 1: FRIENDS */}
      {activeTab === 'friends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Online Friends */}
          <div>
            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#10b981', marginBottom: '12px', fontWeight: 700 }}>
              Online — {onlineFriends.length}
            </h4>
            {onlineFriends.length === 0 ? (
              <div style={{ padding: '20px', backgroundColor: '#1e293b', borderRadius: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                No friends currently online.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {onlineFriends.map(f => (
                  <div key={f.userId} style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: f.presence === 'playing' ? '#f59e0b' : '#10b981',
                          boxShadow: f.presence === 'playing' ? '0 0 8px #f59e0b' : '0 0 8px #10b981'
                        }} />
                        <span style={{ fontWeight: 700, fontSize: '1rem' }}>{f.username}</span>
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>({f.rating || 1500})</span>
                      </div>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: f.presence === 'playing' ? '#f59e0b' : '#10b981',
                        backgroundColor: f.presence === 'playing' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '6px'
                      }}>
                        {f.presence === 'playing' ? '♟ In Game' : '● Online'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setChallengeTarget(f.username)}
                        style={{
                          flex: 1,
                          padding: '6px',
                          borderRadius: '8px',
                          backgroundColor: '#10b981',
                          border: 'none',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <Swords size={14} /> Challenge
                      </button>
                      <button
                        onClick={() => removeFriend(f.username)}
                        title="Remove Friend"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#94a3b8',
                          cursor: 'pointer'
                        }}
                      >
                        <UserMinus size={14} />
                      </button>
                      <button
                        onClick={() => blockUser(f.username)}
                        title="Block User"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: '#f87171',
                          cursor: 'pointer'
                        }}
                      >
                        <Ban size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Offline Friends */}
          <div>
            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '12px', fontWeight: 700 }}>
              Offline — {offlineFriends.length}
            </h4>
            {offlineFriends.length === 0 ? (
              <div style={{ padding: '16px', backgroundColor: '#1e293b', borderRadius: '12px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                No offline friends.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {offlineFriends.map(f => (
                  <div key={f.userId} style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#64748b' }} />
                      <span style={{ fontWeight: 600, color: '#94a3b8' }}>{f.username}</span>
                      <span style={{ color: '#64748b', fontSize: '0.8rem' }}>({f.rating || 1500})</span>
                    </div>
                    <button
                      onClick={() => removeFriend(f.username)}
                      title="Remove Friend"
                      style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: REQUESTS */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h4 style={{ fontSize: '0.9rem', color: '#10b981', marginBottom: '12px', fontWeight: 700 }}>
              Incoming Requests ({requests.incoming.length})
            </h4>
            {requests.incoming.length === 0 ? (
              <div style={{ padding: '24px', backgroundColor: '#1e293b', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
                No incoming friend requests.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {requests.incoming.map(req => (
                  <div key={req.id} style={{
                    backgroundColor: '#1e293b',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <div>
                      <strong style={{ color: '#fff' }}>{req.username}</strong>
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem', marginLeft: '8px' }}>({req.rating || 1500})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => acceptFriendRequest(req.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          backgroundColor: '#10b981',
                          border: 'none',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button
                        onClick={() => declineFriendRequest(req.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <X size={14} /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '12px', fontWeight: 700 }}>
              Outgoing Pending Requests ({requests.outgoing.length})
            </h4>
            {requests.outgoing.length === 0 ? (
              <div style={{ padding: '20px', backgroundColor: '#1e293b', borderRadius: '12px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                No outgoing pending requests.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {requests.outgoing.map(req => (
                  <div key={req.id} style={{
                    backgroundColor: '#1e293b',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    <span>{req.username}</span>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '4px 8px', borderRadius: '6px' }}>
                      Pending Response
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ADD FRIEND */}
      {activeTab === 'add' && (
        <div style={{ backgroundColor: '#1e293b', padding: '24px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)', maxWidth: '500px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', fontWeight: 700 }}>Send a Friend Request</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '20px' }}>
            Enter the exact username of the player you wish to add as a friend.
          </p>

          <form onSubmit={handleSendRequest} style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Username..."
              value={searchUsername}
              onChange={e => setSearchUsername(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: '0.9rem'
              }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                backgroundColor: '#10b981',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Send Request
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: RECENT OPPONENTS */}
      {activeTab === 'opponents' && (
        <div>
          <h4 style={{ fontSize: '0.9rem', color: '#10b981', marginBottom: '12px', fontWeight: 700 }}>
            Past Opponents ({opponents.length})
          </h4>
          {opponents.length === 0 ? (
            <div style={{ padding: '24px', backgroundColor: '#1e293b', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
              No recent game history against online opponents.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {opponents.map(opp => (
                <div key={opp.userId} style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{opp.username}</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Rating: {opp.rating || 1500}</div>
                    </div>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: opp.presence === 'online' ? '#10b981' : opp.presence === 'playing' ? '#f59e0b' : '#64748b'
                    }}>
                      {opp.presence === 'playing' ? '♟ In Game' : opp.presence === 'online' ? '● Online' : '○ Offline'}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    fontSize: '0.8rem',
                    color: '#cbd5e1',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    padding: '6px 10px',
                    borderRadius: '6px'
                  }}>
                    <span>Games: {opp.gamesPlayedAgainst}</span>
                    <span style={{ color: '#10b981' }}>W: {opp.wins}</span>
                    <span style={{ color: '#f87171' }}>L: {opp.losses}</span>
                    <span style={{ color: '#94a3b8' }}>D: {opp.draws}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setChallengeTarget(opp.username)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        borderRadius: '8px',
                        backgroundColor: '#10b981',
                        border: 'none',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      <Swords size={14} /> Challenge
                    </button>
                    <button
                      onClick={() => sendFriendRequest(opp.username)}
                      title="Add as Friend"
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#cbd5e1',
                        cursor: 'pointer'
                      }}
                    >
                      <UserPlus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: BLOCKED */}
      {activeTab === 'blocked' && (
        <div>
          <h4 style={{ fontSize: '0.9rem', color: '#f87171', marginBottom: '12px', fontWeight: 700 }}>
            Blocked Players ({blocked.length})
          </h4>
          {blocked.length === 0 ? (
            <div style={{ padding: '20px', backgroundColor: '#1e293b', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
              No blocked players.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {blocked.map(b => (
                <div key={b.id} style={{
                  backgroundColor: '#1e293b',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                  <span style={{ color: '#f87171', fontWeight: 600 }}>{b.username}</span>
                  <button
                    onClick={() => unblockUser(b.username)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#cbd5e1',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Challenge Modal */}
      {challengeTarget && (
        <ChallengeModal
          isOpen={Boolean(challengeTarget)}
          targetUsername={challengeTarget}
          onClose={() => setChallengeTarget(null)}
          onSendChallenge={sendChallenge}
        />
      )}
    </div>
  );
}
