import React from 'react';
import { User, LogIn, LogOut } from 'lucide-react';
import { ModeSelector } from './ModeSelector.jsx';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { AuthModal } from '../features/auth/AuthModal.jsx';

export function Header({ engineStatus, engineAvailable }) {
  const isStockfishWasm = engineStatus === 'stockfish-18-wasm' && engineAvailable;
  const { user, openAuthModal, logout } = useAuth();
  
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-icon">♟️</span>
        <div>
          <h1 className="brand-title">Stockfish 18 WASM Chess Platform</h1>
          <p className="brand-subtitle">Computer Play • Local 2-Player • Online Multiplayer • Stockfish 18 Analysis</p>
        </div>
      </div>

      <div className="header-actions">
        <ModeSelector />

        <div className="header-badges">
          {user ? (
            <div className="auth-user-badge">
              <User size={16} />
              <span>{user.username} ({user.rating || 1500})</span>
              <button className="close-btn" onClick={logout} title="Sign Out" style={{ marginLeft: '0.25rem' }}>
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={openAuthModal}>
              <LogIn size={15} /> Login / Register
            </button>
          )}

          <div className={`engine-status-badge ${!isStockfishWasm ? 'fallback' : ''}`}>
            <span className="status-dot"></span>
            <span>
              {isStockfishWasm ? 'Stockfish 18 WASM' : 'Fallback Engine'}
            </span>
          </div>
        </div>
      </div>

      <AuthModal />
    </header>
  );
}
