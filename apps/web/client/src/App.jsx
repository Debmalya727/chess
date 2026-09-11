import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.jsx';
import { ChessBoard } from './components/ChessBoard.jsx';
import { EvalBar } from './components/EvalBar.jsx';
import { AnalysisPanel } from './components/AnalysisPanel.jsx';
import { EducationalSection } from './components/EducationalSection.jsx';
import { ChessClock } from './components/ChessClock.jsx';
import { useChessGame } from './hooks/useChessGame.js';
import { useStockfishAnalysis } from './hooks/useStockfishAnalysis.js';
import { GameModeProvider, useGameMode, GAME_MODES, DIFFICULTY_LEVELS } from './features/mode/GameModeContext.jsx';
import { AuthProvider } from './features/auth/AuthContext.jsx';
import { OnlineMode } from './features/mode/OnlineMode.jsx';
import { PlayerProfile } from './components/PlayerProfile.jsx';
import { GameHistory } from './components/GameHistory.jsx';
import { GameReplay } from './components/GameReplay.jsx';
import { Leaderboard } from './components/Leaderboard.jsx';
import { TournamentList } from './components/TournamentList.jsx';
import { TournamentDetails } from './components/TournamentDetails.jsx';
import { SocialView } from './components/SocialView.jsx';
import { ChallengeNotification } from './components/ChallengeNotification.jsx';

function MainAppContent() {
  const { 
    activeMode, setActiveMode, difficulty, playerColor, timeControl,
    replayGameId, openReplay, selectedTournamentId, setSelectedTournamentId, openTournament 
  } = useGameMode();

  const [analysisDepth, setAnalysisDepth] = useState(20);
  const [analysisMultiPV, setAnalysisMultiPV] = useState(3);

  // Clock state
  const [whiteTimeMs, setWhiteTimeMs] = useState(600000);
  const [blackTimeMs, setBlackTimeMs] = useState(600000);
  const [isClockRunning, setIsClockRunning] = useState(false);

  const computerColor = playerColor === 'b' ? 'w' : 'b'; // default vs Stockfish: user White, computer Black

  const {
    chess, fen, turn,
    selectedSquare, legalMoves, lastMove, kingSquare, isFlipped, pendingPromotion,
    isCheck, isCheckmate, isDraw, isStalemate, isGameOver,
    moveHistory, historyIndex,
    selectSquare, makeMove, completePromotion, loadFen,
    goToMove, undoMove, redoMove, resetBoard, toggleFlip,
    canUndo, canRedo,
  } = useChessGame();

  const currentDiff = DIFFICULTY_LEVELS[difficulty] || DIFFICULTY_LEVELS.MEDIUM;
  const activeDepth = activeMode === GAME_MODES.COMPUTER ? currentDiff.depth : analysisDepth;
  const activeMultiPV = activeMode === GAME_MODES.COMPUTER ? currentDiff.multipv : analysisMultiPV;

  const {
    engineStatus, engineAvailable, isAnalyzing, lines, bestMove
  } = useStockfishAnalysis(fen, { depth: activeDepth, multipv: activeMultiPV });

  // Clock Countdown logic for Local 2-Player mode
  useEffect(() => {
    if (activeMode !== GAME_MODES.LOCAL || isGameOver || moveHistory.length === 0) {
      setIsClockRunning(false);
      return;
    }
    setIsClockRunning(true);

    const timer = setInterval(() => {
      if (turn === 'w') {
        setWhiteTimeMs(prev => Math.max(0, prev - 100));
      } else {
        setBlackTimeMs(prev => Math.max(0, prev - 100));
      }
    }, 100);

    return () => clearInterval(timer);
  }, [activeMode, turn, isGameOver, moveHistory]);

  // Handle clock reset on new game
  useEffect(() => {
    const mins = parseInt(timeControl.split('+')[0], 10) || 10;
    setWhiteTimeMs(mins * 60 * 1000);
    setBlackTimeMs(mins * 60 * 1000);
  }, [timeControl]);

  // Parse bestMove string into { from, to } for board highlight
  const engineBestMove = bestMove && bestMove !== '(none)' && !isGameOver ? {
    from: bestMove.slice(0, 2),
    to: bestMove.slice(2, 4),
  } : null;

  // Auto-play engine move in Computer mode
  useEffect(() => {
    if (activeMode !== GAME_MODES.COMPUTER || isGameOver || !bestMove || bestMove === '(none)') return;
    if (turn !== computerColor) return;
    if (isAnalyzing) return;

    const timer = setTimeout(() => {
      const from = bestMove.slice(0, 2);
      const to = bestMove.slice(2, 4);
      const promotion = bestMove.length > 4 ? bestMove[4] : undefined;
      makeMove(from, to, promotion);
    }, currentDiff.movetime || 600);

    return () => clearTimeout(timer);
  }, [activeMode, bestMove, isAnalyzing, turn, isGameOver, makeMove, computerColor, currentDiff]);

  // Game status message
  const gameStatus = isCheckmate
    ? `Checkmate! ${turn === 'w' ? 'Black' : 'White'} wins! 🏆`
    : isDraw
    ? '½–½ Draw by repetition / 50-move rule / insufficient material'
    : isStalemate
    ? 'Stalemate — it\'s a Draw! ½–½'
    : isCheck
    ? `${turn === 'w' ? 'White' : 'Black'} is in Check! ⚠️`
    : null;

  const statusType = isCheckmate ? 'checkmate' : (isDraw || isStalemate) ? 'draw' : 'check';
  const canHumanPlay = !isGameOver && !(activeMode === GAME_MODES.COMPUTER && turn === computerColor);

  return (
    <div className="app-container">
      <Header engineStatus={engineStatus} engineAvailable={engineAvailable} />
      <ChallengeNotification />

      {gameStatus && activeMode !== GAME_MODES.ONLINE && activeMode !== GAME_MODES.PROFILE && activeMode !== GAME_MODES.HISTORY && activeMode !== GAME_MODES.REPLAY && activeMode !== GAME_MODES.LEADERBOARD && activeMode !== GAME_MODES.TOURNAMENTS && (
        <div className={`status-banner ${statusType}`}>
          {gameStatus}
        </div>
      )}

      {activeMode === GAME_MODES.ONLINE ? (
        <main className="main-grid" style={{ gridTemplateColumns: '1fr' }}>
          <OnlineMode />
        </main>
      ) : activeMode === GAME_MODES.LEADERBOARD ? (
        <main className="main-grid" style={{ gridTemplateColumns: '1fr' }}>
          <Leaderboard onSelectUser={() => setActiveMode(GAME_MODES.PROFILE)} />
        </main>
      ) : activeMode === GAME_MODES.TOURNAMENTS ? (
        <main className="main-grid" style={{ gridTemplateColumns: '1fr' }}>
          {selectedTournamentId ? (
            <TournamentDetails
              tournamentId={selectedTournamentId}
              onClose={() => setSelectedTournamentId(null)}
              onSelectReplayGame={(gId) => openReplay(gId)}
              onResumeGame={() => setActiveMode(GAME_MODES.ONLINE)}
            />
          ) : (
            <TournamentList onSelectTournament={(tId) => openTournament(tId)} />
          )}
        </main>
      ) : activeMode === GAME_MODES.SOCIAL ? (
        <main className="main-grid" style={{ gridTemplateColumns: '1fr' }}>
          <SocialView onSelectUser={() => setActiveMode(GAME_MODES.PROFILE)} />
        </main>
      ) : activeMode === GAME_MODES.PROFILE ? (
        <main className="main-grid" style={{ gridTemplateColumns: '1fr' }}>
          <PlayerProfile onSelectReplayGame={(gId) => openReplay(gId)} />
        </main>
      ) : activeMode === GAME_MODES.HISTORY ? (
        <main className="main-grid" style={{ gridTemplateColumns: '1fr' }}>
          <GameHistory onSelectReplayGame={(gId) => openReplay(gId)} />
        </main>
      ) : activeMode === GAME_MODES.REPLAY ? (
        <main className="main-grid" style={{ gridTemplateColumns: '1fr' }}>
          <GameReplay gameId={replayGameId} onClose={() => setActiveMode(GAME_MODES.HISTORY)} />
        </main>
      ) : (
        <main className="main-grid">
          <div className="board-section">
            <div className="board-card">
              <EvalBar topLine={lines[0]} />
              <div className="board-col">
                {activeMode === GAME_MODES.LOCAL && (
                  <ChessClock
                    whiteTimeMs={whiteTimeMs}
                    blackTimeMs={blackTimeMs}
                    activeTurn={turn}
                    isRunning={isClockRunning}
                  />
                )}

                <div className="player-label top">
                  <span className="player-dot black" />
                  {isFlipped ? 'White' : 'Black'}
                  {!isFlipped && activeMode === GAME_MODES.COMPUTER && turn === computerColor && (
                    <span className="computer-tag">🤖 Stockfish ({currentDiff.name})</span>
                  )}
                  {turn === (isFlipped ? 'w' : 'b') && !isGameOver && (
                    <span className="to-move-indicator" />
                  )}
                </div>

                <ChessBoard
                  chess={chess}
                  selectedSquare={selectedSquare}
                  legalMoves={legalMoves}
                  lastMove={lastMove}
                  kingSquare={kingSquare}
                  isFlipped={isFlipped}
                  pendingPromotion={pendingPromotion}
                  engineBestMove={engineBestMove}
                  onSquareSelect={canHumanPlay ? selectSquare : undefined}
                  onPromotionComplete={completePromotion}
                />

                <div className="player-label bottom">
                  <span className="player-dot white" />
                  {isFlipped ? 'Black' : 'White'}
                  {isFlipped && activeMode === GAME_MODES.COMPUTER && turn === computerColor && (
                    <span className="computer-tag">🤖 Stockfish ({currentDiff.name})</span>
                  )}
                  {turn === (isFlipped ? 'b' : 'w') && !isGameOver && (
                    <span className="to-move-indicator" />
                  )}
                </div>
              </div>
            </div>
          </div>

          <AnalysisPanel
            fen={fen}
            lines={lines}
            isAnalyzing={isAnalyzing}
            turn={turn}
            canUndo={canUndo && !isGameOver}
            canRedo={canRedo}
            onUndo={undoMove}
            onRedo={redoMove}
            onReset={resetBoard}
            onFlip={toggleFlip}
            onLoadFen={loadFen}
            moveHistory={moveHistory}
            historyIndex={historyIndex}
            onGoToMove={goToMove}
            vsComputer={activeMode === GAME_MODES.COMPUTER}
            depth={activeDepth}
            multipv={activeMultiPV}
            onDepthChange={setAnalysisDepth}
            onMultiPVChange={setAnalysisMultiPV}
          />
        </main>
      )}

      <EducationalSection />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <GameModeProvider>
        <MainAppContent />
      </GameModeProvider>
    </AuthProvider>
  );
}

export default App;
