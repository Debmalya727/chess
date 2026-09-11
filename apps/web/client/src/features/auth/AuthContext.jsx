import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../../services/api.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('chess_token'));
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      authApi.getMe()
        .then(data => setUser(data.user))
        .catch(() => {
          localStorage.removeItem('chess_token');
          setToken(null);
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (identifier, password) => {
    const res = await authApi.login(identifier, password);
    localStorage.setItem('chess_token', res.token);
    setToken(res.token);
    setUser(res.user);
    setIsAuthModalOpen(false);
    return res.user;
  };

  const register = async (username, email, password) => {
    const res = await authApi.register(username, email, password);
    localStorage.setItem('chess_token', res.token);
    setToken(res.token);
    setUser(res.user);
    setIsAuthModalOpen(false);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem('chess_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isAuthModalOpen,
      openAuthModal: () => setIsAuthModalOpen(true),
      closeAuthModal: () => setIsAuthModalOpen(false),
      login,
      register,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
