import React, { useState } from 'react';
import { X, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, login, register } = useAuth();
  const [tab, setTab] = useState('login'); // 'login' | 'register'

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'login') {
        await login(identifier, password);
      } else {
        await register(username, email, password);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={closeAuthModal}>
      <div className="modal-content auth-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="auth-tab-buttons">
            <button
              className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setError(null); }}
            >
              <LogIn size={16} /> Login
            </button>
            <button
              className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setError(null); }}
            >
              <UserPlus size={16} /> Register
            </button>
          </div>
          <button className="close-btn" onClick={closeAuthModal}><X size={18} /></button>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {tab === 'register' && (
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. grandmaster99"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>{tab === 'login' ? 'Email or Username' : 'Email Address'}</label>
            <input
              type={tab === 'register' ? 'email' : 'text'}
              value={tab === 'login' ? identifier : email}
              onChange={e => tab === 'login' ? setIdentifier(e.target.value) : setEmail(e.target.value)}
              placeholder={tab === 'login' ? 'username or email' : 'you@example.com'}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={loading}>
            {loading ? 'Processing...' : (tab === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>
      </div>
    </div>
  );
}
