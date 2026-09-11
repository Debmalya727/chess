import React, { useState } from 'react';
import { Swords, X, Clock, Shield } from 'lucide-react';

export function ChallengeModal({ isOpen, targetUsername, onClose, onSendChallenge }) {
  const [timeControl, setTimeControl] = useState('5+0');
  const [colorPreference, setColorPreference] = useState('random');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await onSendChallenge({
        targetUsername,
        timeControl,
        colorPreference
      });
      if (res && res.error) {
        setErrorMessage(res.message || res.error);
      } else {
        onClose();
      }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="glass-panel" style={{
        backgroundColor: '#1e293b',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '16px',
        padding: '24px',
        width: '100%',
        maxWidth: '420px',
        color: '#fff',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Swords size={20} style={{ color: '#10b981' }} />
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Direct Challenge</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '20px' }}>
          Challenge <strong style={{ color: '#fff' }}>{targetUsername}</strong> to an online match.
        </p>

        {errorMessage && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '10px',
            color: '#f87171',
            fontSize: '0.85rem',
            marginBottom: '16px'
          }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              Time Control
            </label>
            <select
              value={timeControl}
              onChange={e => setTimeControl(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: '0.9rem'
              }}
            >
              <option value="1+0">1+0 (Bullet)</option>
              <option value="3+0">3+0 (Blitz)</option>
              <option value="3+2">3+2 (Blitz)</option>
              <option value="5+0">5+0 (Blitz)</option>
              <option value="10+0">10+0 (Rapid)</option>
              <option value="15+10">15+10 (Rapid)</option>
              <option value="30+0">30+0 (Classical)</option>
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              Color
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {['random', 'w', 'b'].map(c => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColorPreference(c)}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: colorPreference === c ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: colorPreference === c ? 'rgba(16, 185, 129, 0.15)' : '#0f172a',
                    color: colorPreference === c ? '#10b981' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textTransform: 'capitalize'
                  }}
                >
                  {c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                backgroundColor: '#10b981',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? 'Sending...' : 'Send Challenge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
