import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/api';

export function usePlayerProfile(username = null) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRatingType, setSelectedRatingType] = useState('blitz');
  const [ratingHistory, setRatingHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = username ? `/users/${username}` : '/users/me';
      const data = await apiFetch(endpoint);
      setProfile(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [username]);

  const fetchRatingHistory = useCallback(async (type) => {
    setHistoryLoading(true);
    try {
      const endpoint = username ? `/users/${username}/ratings/${type}/history?limit=30` : `/users/me/ratings/${type}/history?limit=30`;
      const data = await apiFetch(endpoint);
      setRatingHistory(data);
    } catch (err) {
      console.warn('[usePlayerProfile] Error fetching rating history:', err.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (selectedRatingType) {
      fetchRatingHistory(selectedRatingType);
    }
  }, [selectedRatingType, fetchRatingHistory]);

  return {
    profile,
    loading,
    error,
    selectedRatingType,
    setSelectedRatingType,
    ratingHistory,
    historyLoading,
    refreshProfile: fetchProfile
  };
}

