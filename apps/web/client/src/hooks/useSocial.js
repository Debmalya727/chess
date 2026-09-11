import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { globalWsClient } from '../services/wsClient.js';
import { WS_EVENTS } from '@chess/protocol';

export function useSocial() {
  const { token, user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [challenges, setChallenges] = useState({ incoming: [], outgoing: [] });
  const [opponents, setOpponents] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSocialData = useCallback(async () => {
    if (!token) {
      setFriends([]);
      setRequests({ incoming: [], outgoing: [] });
      setChallenges({ incoming: [], outgoing: [] });
      setOpponents([]);
      setBlocked([]);
      return;
    }

    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      const [friendsRes, requestsRes, challengesRes, opponentsRes, blockedRes] = await Promise.all([
        fetch('/api/friends', { headers }).then(r => r.ok ? r.json() : { friends: [] }),
        fetch('/api/friends/requests', { headers }).then(r => r.ok ? r.json() : { incoming: [], outgoing: [] }),
        fetch('/api/challenges', { headers }).then(r => r.ok ? r.json() : { incoming: [], outgoing: [] }),
        fetch('/api/users/me/opponents', { headers }).then(r => r.ok ? r.json() : { opponents: [] }),
        fetch('/api/blocks', { headers }).then(r => r.ok ? r.json() : { blocked: [] })
      ]);

      setFriends(friendsRes.friends || []);
      setRequests(requestsRes || { incoming: [], outgoing: [] });
      setChallenges(challengesRes || { incoming: [], outgoing: [] });
      setOpponents(opponentsRes.opponents || []);
      setBlocked(blockedRes.blocked || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSocialData();
    const interval = setInterval(fetchSocialData, 5000);

    // Listen to real-time WebSocket events for instantaneous updates
    const unbindReqRecv = globalWsClient.on(WS_EVENTS.FRIEND_REQUEST_RECEIVED, () => fetchSocialData());
    const unbindReqAcc = globalWsClient.on(WS_EVENTS.FRIEND_REQUEST_ACCEPTED, () => fetchSocialData());
    const unbindChalRecv = globalWsClient.on(WS_EVENTS.CHALLENGE_RECEIVED, () => fetchSocialData());
    const unbindChalDec = globalWsClient.on(WS_EVENTS.CHALLENGE_DECLINED, () => fetchSocialData());
    const unbindPresence = globalWsClient.on(WS_EVENTS.PRESENCE_UPDATED, () => fetchSocialData());

    return () => {
      clearInterval(interval);
      unbindReqRecv();
      unbindReqAcc();
      unbindChalRecv();
      unbindChalDec();
      unbindPresence();
    };
  }, [fetchSocialData]);

  const sendFriendRequest = async (username) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch(`/api/friends/request/${encodeURIComponent(username)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  const acceptFriendRequest = async (requestId) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch(`/api/friends/requests/${requestId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  const declineFriendRequest = async (requestId) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch(`/api/friends/requests/${requestId}/decline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  const removeFriend = async (username) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch(`/api/friends/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  const blockUser = async (username) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch(`/api/users/${encodeURIComponent(username)}/block`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  const unblockUser = async (username) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch(`/api/users/${encodeURIComponent(username)}/block`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  const sendChallenge = async ({ targetUsername, timeControl = '5+0', colorPreference = 'random' }) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch('/api/challenges', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ targetUsername, timeControl, colorPreference })
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  const acceptChallenge = async (challengeId) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch(`/api/challenges/${challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  const declineChallenge = async (challengeId) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch(`/api/challenges/${challengeId}/decline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  const cancelChallenge = async (challengeId) => {
    if (!token) return { error: 'UNAUTHORIZED' };
    const res = await fetch(`/api/challenges/${challengeId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) fetchSocialData();
    return data;
  };

  return {
    friends,
    requests,
    challenges,
    opponents,
    blocked,
    loading,
    error,
    refresh: fetchSocialData,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    sendChallenge,
    acceptChallenge,
    declineChallenge,
    cancelChallenge
  };
}
