"""
Chess Engine Manager for Desktop App.
"""

import logging
import chess
import chess.engine
from typing import List, Tuple, Optional
from apps.desktop.config import STOCKFISH_PATH, MULTI_PV, ENGINE_TIME_LIMIT

logger = logging.getLogger(__name__)

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000
}

PAWN_PST = [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0
]

KNIGHT_PST = [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
]

def evaluate_board_heuristic(board: chess.Board) -> int:
    if board.is_checkmate():
        return -30000 if board.turn == chess.WHITE else 30000
    if board.is_stalemate() or board.is_insufficient_material():
        return 0

    score = 0
    for square, piece in board.piece_map().items():
        val = PIECE_VALUES.get(piece.piece_type, 0)
        if piece.piece_type == chess.PAWN:
            val += PAWN_PST[square if piece.color == chess.WHITE else chess.square_mirror(square)]
        elif piece.piece_type == chess.KNIGHT:
            val += KNIGHT_PST[square if piece.color == chess.WHITE else chess.square_mirror(square)]

        if piece.color == chess.WHITE:
            score += val
        else:
            score -= val
    return score

class HeuristicChessEngine:
    def analyze(self, board: chess.Board, multipv: int = 3) -> Tuple[List[Optional[chess.Move]], List[str]]:
        legal_moves = list(board.legal_moves)
        if not legal_moves:
            return [], []

        scored_moves = []
        for move in legal_moves:
            board.push(move)
            score = evaluate_board_heuristic(board)
            if board.turn == chess.BLACK:
                score = -score
            board.pop()
            scored_moves.append((score, move))

        scored_moves.sort(key=lambda x: x[0], reverse=True)
        top_moves = scored_moves[:multipv]

        moves = []
        evals = []
        for score, move in top_moves:
            moves.append(move)
            evals.append(f"{score / 100.0:+.2f} (Built-in)")

        return moves, evals

    def close(self):
        pass


class ChessEngineManager:
    def __init__(self, stockfish_path: Optional[str] = STOCKFISH_PATH):
        self.stockfish_path = stockfish_path
        self.engine = None
        self.engine_name = "Built-in Heuristic Engine"
        self._init_engine()

    def _init_engine(self):
        if self.stockfish_path:
            try:
                self.engine = chess.engine.SimpleEngine.popen_uci(self.stockfish_path)
                self.engine_name = f"Stockfish ({self.stockfish_path})"
                logger.info(f"Successfully initialized Stockfish engine: {self.stockfish_path}")
                return
            except Exception as e:
                logger.warning(f"Failed to load Stockfish engine at '{self.stockfish_path}': {e}")
                self.engine = None
        
        logger.info("Stockfish unavailable. Using built-in Heuristic Minimax Engine fallback.")
        self.engine = HeuristicChessEngine()

    def analyze(
        self, board: chess.Board, multipv: int = MULTI_PV, time_limit: float = ENGINE_TIME_LIMIT
    ) -> Tuple[List[Optional[chess.Move]], List[str]]:
        if isinstance(self.engine, HeuristicChessEngine):
            return self.engine.analyze(board, multipv)

        try:
            infos = self.engine.analyse(board, chess.engine.Limit(time=time_limit), multipv=multipv)
            moves, evals = [], []
            if not isinstance(infos, list):
                infos = [infos]

            for inf in infos:
                pv_move = inf.get("pv", [None])[0]
                moves.append(pv_move)
                pov = inf["score"].pov(board.turn)
                if pov.is_mate():
                    ev = f"Mate {pov.mate()}"
                else:
                    try:
                        ev = f"{pov.score() / 100:.2f}"
                    except Exception:
                        ev = f"{pov.cp / 100:.2f}" if hasattr(pov, "cp") else "Eval N/A"
                evals.append(ev)
            return moves, evals
        except Exception as e:
            logger.error(f"Engine analysis error: {e}")
            fallback = HeuristicChessEngine()
            return fallback.analyze(board, multipv)

    def close(self):
        if self.engine and not isinstance(self.engine, HeuristicChessEngine):
            try:
                self.engine.quit()
            except Exception:
                pass
