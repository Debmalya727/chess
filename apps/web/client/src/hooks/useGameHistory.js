import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/api';

export function useGameHistory() {
  const [games, setGames] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [ratingType, setRatingType] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchGames = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (ratingType) params.append('ratingType', ratingType);
      if (resultFilter) params.append('result', resultFilter);

      const data = await apiFetch(`/games/history?${params.toString()}`);
      setGames(data.games || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ratingType, resultFilter]);

  useEffect(() => {
    fetchGames(1);
  }, [fetchGames]);

  return {
    games,
    pagination,
    ratingType,
    setRatingType,
    resultFilter,
    setResultFilter,
    loading,
    error,
    setPage: (p) => fetchGames(p),
    refreshHistory: () => fetchGames(pagination.page)
  };
}

