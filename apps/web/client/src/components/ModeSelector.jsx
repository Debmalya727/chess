import React from 'react';
import { Bot, Users, Globe, Search, User, History, Trophy, Swords, UserCheck } from 'lucide-react';
import { useGameMode, GAME_MODES } from '../features/mode/GameModeContext.jsx';

export function ModeSelector() {
  const { activeMode, setActiveMode } = useGameMode();

  return (
    <nav className="mode-nav" aria-label="Game Modes">
      <button
        className={`mode-tab ${activeMode === GAME_MODES.COMPUTER ? 'active' : ''}`}
        onClick={() => setActiveMode(GAME_MODES.COMPUTER)}
      >
        <Bot size={16} />
        <span>Computer</span>
      </button>

      <button
        className={`mode-tab ${activeMode === GAME_MODES.LOCAL ? 'active' : ''}`}
        onClick={() => setActiveMode(GAME_MODES.LOCAL)}
      >
        <Users size={16} />
        <span>Local 2P</span>
      </button>

      <button
        className={`mode-tab ${activeMode === GAME_MODES.ONLINE ? 'active' : ''}`}
        onClick={() => setActiveMode(GAME_MODES.ONLINE)}
      >
        <Globe size={16} />
        <span>Online</span>
      </button>

      <button
        className={`mode-tab ${activeMode === GAME_MODES.ANALYSIS ? 'active' : ''}`}
        onClick={() => setActiveMode(GAME_MODES.ANALYSIS)}
      >
        <Search size={16} />
        <span>Analysis</span>
      </button>

      <button
        className={`mode-tab ${activeMode === GAME_MODES.LEADERBOARD ? 'active' : ''}`}
        onClick={() => setActiveMode(GAME_MODES.LEADERBOARD)}
      >
        <Trophy size={16} />
        <span>Leaderboard</span>
      </button>

      <button
        className={`mode-tab ${activeMode === GAME_MODES.TOURNAMENTS ? 'active' : ''}`}
        onClick={() => setActiveMode(GAME_MODES.TOURNAMENTS)}
      >
        <Swords size={16} />
        <span>Tournaments</span>
      </button>

      <button
        className={`mode-tab ${activeMode === GAME_MODES.SOCIAL ? 'active' : ''}`}
        onClick={() => setActiveMode(GAME_MODES.SOCIAL)}
      >
        <UserCheck size={16} />
        <span>Social</span>
      </button>

      <button
        className={`mode-tab ${activeMode === GAME_MODES.PROFILE ? 'active' : ''}`}
        onClick={() => setActiveMode(GAME_MODES.PROFILE)}
      >
        <User size={16} />
        <span>Profile</span>
      </button>

      <button
        className={`mode-tab ${activeMode === GAME_MODES.HISTORY ? 'active' : ''}`}
        onClick={() => setActiveMode(GAME_MODES.HISTORY)}
      >
        <History size={16} />
        <span>History</span>
      </button>
    </nav>
  );
}
