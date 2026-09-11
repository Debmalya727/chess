import React, { createContext, useContext, useState } from 'react';

export const GAME_MODES = {
  COMPUTER: 'COMPUTER',
  LOCAL: 'LOCAL',
  ONLINE: 'ONLINE',
  ANALYSIS: 'ANALYSIS',
  PROFILE: 'PROFILE',
  HISTORY: 'HISTORY',
  REPLAY: 'REPLAY',
  LEADERBOARD: 'LEADERBOARD',
  TOURNAMENTS: 'TOURNAMENTS',
  SOCIAL: 'SOCIAL'
};

export const DIFFICULTY_LEVELS = {
  BEGINNER: { name: 'Beginner', depth: 2, multipv: 1, skillLevel: 1, movetime: 200 },
  EASY: { name: 'Easy', depth: 5, multipv: 1, skillLevel: 5, movetime: 400 },
  MEDIUM: { name: 'Medium', depth: 10, multipv: 2, skillLevel: 10, movetime: 600 },
  HARD: { name: 'Hard', depth: 15, multipv: 3, skillLevel: 15, movetime: 800 },
  EXPERT: { name: 'Expert', depth: 20, multipv: 3, skillLevel: 20, movetime: 1000 },
  MASTER: { name: 'Master', depth: 25, multipv: 3, skillLevel: 20, movetime: 1500 }
};

const GameModeContext = createContext();

export function GameModeProvider({ children }) {
  const [activeMode, setActiveMode] = useState(GAME_MODES.COMPUTER);
  const [difficulty, setDifficulty] = useState('MEDIUM');
  const [playerColor, setPlayerColor] = useState('w'); // 'w' | 'b' | 'random'
  const [timeControl, setTimeControl] = useState('10+0'); // '1+0', '3+0', '3+2', '5+0', '10+0', '15+10'
  const [replayGameId, setReplayGameId] = useState(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);

  const openReplay = (gameId) => {
    setReplayGameId(gameId);
    setActiveMode(GAME_MODES.REPLAY);
  };

  const openTournament = (tournId) => {
    setSelectedTournamentId(tournId);
    setActiveMode(GAME_MODES.TOURNAMENTS);
  };

  return (
    <GameModeContext.Provider value={{
      activeMode,
      setActiveMode,
      difficulty,
      setDifficulty,
      playerColor,
      setPlayerColor,
      timeControl,
      setTimeControl,
      replayGameId,
      setReplayGameId,
      openReplay,
      selectedTournamentId,
      setSelectedTournamentId,
      openTournament
    }}>
      {children}
    </GameModeContext.Provider>
  );
}

export function useGameMode() {
  return useContext(GameModeContext);
}
