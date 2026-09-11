function resolveApiBase() {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL)
    : null;
  if (envUrl) {
    const trimmed = envUrl.replace(/\/+$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:8000/api';
  }
  return '/api';
}

const API_BASE = resolveApiBase();

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('chess_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'API Request failed');
  }

  return data;
}

export const authApi = {
  register: (username, email, password) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }),
  login: (identifier, password) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
  getMe: () => apiFetch('/auth/me')
};

export const gameApi = {
  createGame: (timeControl, colorPreference) => apiFetch('/games', { method: 'POST', body: JSON.stringify({ timeControl, colorPreference }) }),
  joinGame: (identifier) => apiFetch(`/games/${identifier}/join`, { method: 'POST' }),
  getGame: (gameId) => apiFetch(`/games/${gameId}`),
  getGameMoves: (gameId) => apiFetch(`/games/${gameId}/moves`)
};
