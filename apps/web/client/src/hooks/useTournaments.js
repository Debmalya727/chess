import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/api';

export function useTournaments(selectedId = null) {
  const [tournaments, setTournaments] = useState([]);
  const [activeTournament, setActiveTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTournaments = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (filters.status) queryParams.set('status', filters.status);
      if (filters.type) queryParams.set('type', filters.type);
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

      const data = await apiFetch(`/tournaments${queryString}`);
      setTournaments(data.tournaments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTournamentDetails = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const details = await apiFetch(`/tournaments/${id}`);
      setActiveTournament(details);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  useEffect(() => {
    if (selectedId) {
      fetchTournamentDetails(selectedId);
    }
  }, [selectedId, fetchTournamentDetails]);

  const createTournament = async (payload) => {
    try {
      const res = await apiFetch('/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await fetchTournaments();
      return res;
    } catch (err) {
      throw err;
    }
  };

  const joinTournament = async (id) => {
    try {
      const res = await apiFetch(`/tournaments/${id}/register`, { method: 'POST' });
      await fetchTournamentDetails(id);
      await fetchTournaments();
      return res;
    } catch (err) {
      throw err;
    }
  };

  const leaveTournament = async (id) => {
    try {
      const res = await apiFetch(`/tournaments/${id}/register`, { method: 'DELETE' });
      await fetchTournamentDetails(id);
      await fetchTournaments();
      return res;
    } catch (err) {
      throw err;
    }
  };

  const startTournament = async (id) => {
    try {
      const res = await apiFetch(`/tournaments/${id}/start`, { method: 'POST' });
      await fetchTournamentDetails(id);
      await fetchTournaments();
      return res;
    } catch (err) {
      throw err;
    }
  };

  const nextSwissRound = async (id) => {
    try {
      const res = await apiFetch(`/tournaments/${id}/rounds/next`, { method: 'POST' });
      await fetchTournamentDetails(id);
      return res;
    } catch (err) {
      throw err;
    }
  };

  const pairArena = async (id) => {
    try {
      const res = await apiFetch(`/tournaments/${id}/pair`, { method: 'POST' });
      await fetchTournamentDetails(id);
      return res;
    } catch (err) {
      throw err;
    }
  };

  const finishTournament = async (id) => {
    try {
      const res = await apiFetch(`/tournaments/${id}/finish`, { method: 'POST' });
      await fetchTournamentDetails(id);
      await fetchTournaments();
      return res;
    } catch (err) {
      throw err;
    }
  };

  const cancelTournament = async (id) => {
    try {
      const res = await apiFetch(`/tournaments/${id}/cancel`, { method: 'POST' });
      await fetchTournamentDetails(id);
      await fetchTournaments();
      return res;
    } catch (err) {
      throw err;
    }
  };

  return {
    tournaments,
    activeTournament,
    loading,
    error,
    refreshTournaments: fetchTournaments,
    selectTournament: fetchTournamentDetails,
    createTournament,
    joinTournament,
    leaveTournament,
    startTournament,
    nextSwissRound,
    pairArena,
    finishTournament,
    cancelTournament
  };
}
