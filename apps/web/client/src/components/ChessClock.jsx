import React from 'react';
import { Clock } from 'lucide-react';

export function ChessClock({ whiteTimeMs, blackTimeMs, activeTurn, isRunning, whitePlayerName = 'White', blackPlayerName = 'Black' }) {
  const formatTime = (ms) => {
    if (ms <= 0) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const padMin = String(min).padStart(2, '0');
    const padSec = String(sec).padStart(2, '0');
    if (ms < 10000) {
      const tenths = Math.floor((ms % 1000) / 100);
      return `${padMin}:${padSec}.${tenths}`;
    }
    return `${padMin}:${padSec}`;
  };

  const getClockClass = (ms, isActive) => {
    let cls = 'clock-box';
    if (isActive && isRunning) cls += ' active';
    if (ms <= 0) cls += ' flagged';
    else if (ms < 10000) cls += ' critical';
    else if (ms < 30000) cls += ' low-time';
    return cls;
  };

  return (
    <div className="chess-clock-container">
      <div className={getClockClass(blackTimeMs, activeTurn === 'b')}>
        <div className="clock-label">{blackPlayerName}</div>
        <div className="clock-time">{formatTime(blackTimeMs)}</div>
      </div>
      <div className="clock-divider">
        <Clock size={16} className={isRunning ? 'spinning-clock' : ''} />
      </div>
      <div className={getClockClass(whiteTimeMs, activeTurn === 'w')}>
        <div className="clock-label">{whitePlayerName}</div>
        <div className="clock-time">{formatTime(whiteTimeMs)}</div>
      </div>
    </div>
  );
}
