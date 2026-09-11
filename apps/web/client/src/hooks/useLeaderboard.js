import { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

export function useLeaderboard(initialCategory = 'rapid') {
  const [category, setCategory] = useState(initialCategory);
  const [page, setPage] = useState(1);
  const [players, setPlayers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    async function fetchLeaderboard() {
      try {
        const data = await apiFetch(`/leaderboards/${category}?page=${page}&limit=50`);
        if (!isMounted) return;
        setPlayers(data.players || []);
        setPagination(data.pagination || { page: 1, limit: 50, total: 0, pages: 1 });
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchLeaderboard();

    return () => {
      isMounted = false;
    };
  }, [category, page]);

  return {
    category,
    setCategory: (cat) => { setCategory(cat); setPage(1); },
    page,
    setPage,
    players,
    pagination,
    loading,
    error
  };
}
