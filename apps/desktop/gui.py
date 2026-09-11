"""
Pygame Desktop GUI Module for Educational Desktop Chess App.
"""

import sys
import math
import logging
import chess
import pygame

from apps.desktop.config import ASSETS_DIR, BOARD_SIZE, MAX_FPS, MULTI_PV
from apps.desktop.chess_engine import ChessEngineManager

logger = logging.getLogger(__name__)

MARGIN_L = 40
MARGIN_T = 20
MARGIN_B = 140
DIMENSION = 8
SQ_SIZE = BOARD_SIZE // DIMENSION
WIDTH = BOARD_SIZE + MARGIN_L
HEIGHT = BOARD_SIZE + MARGIN_T + MARGIN_B

LIGHT_BROWN = (240, 217, 181)
DARK_BROWN = (181, 136, 99)
HIGHLIGHT = (186, 202, 68)
RED = (255, 0, 0)
BLACK = (0, 0, 0)
GREEN = (0, 180, 0)

ARROW_COLORS = [GREEN, (0, 100, 220), (150, 0, 180)]

PIECE_IMAGES_MAP = {
    'P': 'pw.png', 'N': 'nw.png', 'B': 'bw.png',
    'R': 'rw.png', 'Q': 'qw.png', 'K': 'kw.png',
    'p': 'pb.png', 'n': 'nb.png', 'b': 'bb.png',
    'r': 'rb.png', 'q': 'qb.png', 'k': 'kb.png',
}

def load_images():
    imgs = {}
    for sym, fn in PIECE_IMAGES_MAP.items():
        img_path = ASSETS_DIR / fn
        if not img_path.exists():
            raise FileNotFoundError(f"Asset image missing: {img_path}")
        imgs[sym] = pygame.transform.scale(
            pygame.image.load(str(img_path)), (SQ_SIZE, SQ_SIZE)
        )
    return imgs

def board_to_px(file: int, rank: int, flipped: bool = False):
    if flipped:
        file = 7 - file
        rank = 7 - rank
    return MARGIN_L + file * SQ_SIZE, MARGIN_T + rank * SQ_SIZE

def get_coords(square: chess.Square, flipped: bool = False):
    return board_to_px(chess.square_file(square), 7 - chess.square_rank(square), flipped)

def draw_board(screen, flipped: bool = False):
    screen.fill((200, 200, 200))
    for r in range(8):
        for c in range(8):
            colour = LIGHT_BROWN if (r + c) % 2 == 0 else DARK_BROWN
            x, y = board_to_px(c, r, flipped)
            pygame.draw.rect(screen, colour, pygame.Rect(x, y, SQ_SIZE, SQ_SIZE))

def draw_labels(screen, flipped: bool = False):
    font = pygame.font.SysFont("Arial", 18, bold=True)
    for r in range(8):
        label = str(8 - r) if not flipped else str(r + 1)
        txt = font.render(label, True, BLACK)
        y = MARGIN_T + r * SQ_SIZE + SQ_SIZE // 3
        screen.blit(txt, (MARGIN_L - 25, y))
    for c in range(8):
        label = chr(ord('a') + c) if not flipped else chr(ord('h') - c)
        txt = font.render(label, True, BLACK)
        x = MARGIN_L + c * SQ_SIZE + SQ_SIZE // 3
        screen.blit(txt, (x, MARGIN_T + BOARD_SIZE + 5))

def draw_pieces(screen, images, board: chess.Board, flipped: bool = False):
    for sq in chess.SQUARES:
        p = board.piece_at(sq)
        if p:
            screen.blit(images[p.symbol()], get_coords(sq, flipped))

def highlight_square(screen, square: chess.Square, colour, flipped: bool = False):
    x, y = get_coords(square, flipped)
    s = pygame.Surface((SQ_SIZE, SQ_SIZE))
    s.set_alpha(100)
    s.fill(colour)
    screen.blit(s, (x, y))

def draw_highlights(screen, sel_sq, moves, flipped: bool = False):
    if sel_sq:
        highlight_square(screen, sel_sq, HIGHLIGHT, flipped)
        for mv in moves:
            if mv.from_square == sel_sq:
                highlight_square(screen, mv.to_square, RED, flipped)

def draw_arrow(screen, from_square: chess.Square, to_square: chess.Square, flipped: bool = False, colour=GREEN):
    start_x, start_y = get_coords(from_square, flipped)
    end_x, end_y = get_coords(to_square, flipped)
    start_x += SQ_SIZE // 2
    start_y += SQ_SIZE // 2
    end_x += SQ_SIZE // 2
    end_y += SQ_SIZE // 2
    pygame.draw.line(screen, colour, (start_x, start_y), (end_x, end_y), 5)

    angle = math.atan2(end_y - start_y, end_x - start_x)
    head_len = 15
    left = (end_x - head_len * math.cos(angle - math.pi / 6),
            end_y - head_len * math.sin(angle - math.pi / 6))
    right = (end_x - head_len * math.cos(angle + math.pi / 6),
             end_y - head_len * math.sin(angle + math.pi / 6))
    pygame.draw.polygon(screen, colour, [(end_x, end_y), left, right])

def ask_promotion(screen, images, clock, flipped: bool):
    opts = ['q', 'r', 'b', 'n']
    gap = 12
    box_w = 4 * SQ_SIZE + 3 * gap
    start_x = (WIDTH - box_w) // 2
    y = MARGIN_T + BOARD_SIZE // 2 - SQ_SIZE // 2
    overlay = pygame.Surface((WIDTH, HEIGHT))
    overlay.set_alpha(160)
    overlay.fill((50, 50, 50))
    screen.blit(overlay, (0, 0))
    rects = []
    for i, sym in enumerate(opts):
        r = pygame.Rect(start_x + i * (SQ_SIZE + gap), y, SQ_SIZE, SQ_SIZE)
        pygame.draw.rect(screen, LIGHT_BROWN, r)
        img = images[sym.upper() if not flipped else sym]
        screen.blit(img, r.topleft)
        rects.append((sym, r))
    pygame.display.flip()
    while True:
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if ev.type == pygame.MOUSEBUTTONDOWN:
                for sym, r in rects:
                    if r.collidepoint(ev.pos):
                        return sym
        clock.tick(MAX_FPS)

def run_gui():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Educational Pygame Desktop Chess Visualizer")
    clock = pygame.time.Clock()

    images = load_images()
    engine_mgr = ChessEngineManager()
    board = chess.Board()

    sel_sq = None
    legals = []
    dragging = False
    drag_img = None
    drag_from = None
    drag_pos = (0, 0)
    promo_mode = False
    promo_move = None
    best_moves, eval_texts = engine_mgr.analyze(board)
    running = True

    try:
        while running:
            flipped = board.turn == chess.BLACK
            draw_board(screen, flipped)
            draw_labels(screen, flipped)
            draw_pieces(screen, images, board, flipped)
            draw_highlights(screen, sel_sq, legals, flipped)

            for idx, mv in enumerate(best_moves[:len(ARROW_COLORS)]):
                if mv:
                    draw_arrow(screen, mv.from_square, mv.to_square, flipped, ARROW_COLORS[idx])

            font = pygame.font.SysFont("Arial", 18)
            line_spacing = 26
            y_start = MARGIN_T + BOARD_SIZE + 30

            for i, (mv, ev) in enumerate(zip(best_moves, eval_texts)):
                if not mv:
                    continue
                piece = board.piece_at(mv.from_square)
                move_str = 'P' + board.san(mv) if piece and piece.piece_type == chess.PAWN else board.san(mv)
                txt = font.render(f"PV #{i+1}: {move_str}  |  Eval: {ev}", True, BLACK)
                y = y_start + i * line_spacing
                screen.blit(txt, (MARGIN_L + 5, y))

            if promo_mode:
                sym = ask_promotion(screen, images, clock, flipped)
                mv = chess.Move(
                    promo_move.from_square,
                    promo_move.to_square,
                    promotion={'q': chess.QUEEN, 'r': chess.ROOK, 'b': chess.BISHOP, 'n': chess.KNIGHT}[sym]
                )
                if mv in board.legal_moves:
                    board.push(mv)
                    best_moves, eval_texts = engine_mgr.analyze(board)
                promo_mode = False
                promo_move = None
                sel_sq = None
                legals = []
                dragging = False
                drag_img = None
            else:
                for ev in pygame.event.get():
                    if ev.type == pygame.QUIT:
                        running = False
                    elif ev.type == pygame.MOUSEBUTTONDOWN:
                        mx, my = ev.pos
                        col = (mx - MARGIN_L) // SQ_SIZE
                        row = (my - MARGIN_T) // SQ_SIZE
                        if 0 <= col < 8 and 0 <= row < 8:
                            if flipped:
                                col, row = 7 - col, 7 - row
                            clicked = chess.square(col, 7 - row)
                            p = board.piece_at(clicked)
                            if p and p.color == board.turn:
                                sel_sq = clicked
                                legals = list(board.legal_moves)
                                dragging = True
                                drag_img = images[p.symbol()]
                                drag_from = clicked
                                drag_pos = ev.pos
                    elif ev.type == pygame.MOUSEMOTION and dragging:
                        drag_pos = ev.pos
                    elif ev.type == pygame.MOUSEBUTTONUP and dragging:
                        mx, my = ev.pos
                        col = (mx - MARGIN_L) // SQ_SIZE
                        row = (my - MARGIN_T) // SQ_SIZE
                        if 0 <= col < 8 and 0 <= row < 8:
                            if flipped:
                                col, row = 7 - col, 7 - row
                            released = chess.square(col, 7 - row)
                            mv = chess.Move(drag_from, released)
                            p_type = board.piece_at(drag_from).piece_type if board.piece_at(drag_from) else None
                            if p_type == chess.PAWN and chess.square_rank(released) in (0, 7):
                                promo_mode = True
                                promo_move = mv
                            elif mv in board.legal_moves:
                                board.push(mv)
                                best_moves, eval_texts = engine_mgr.analyze(board)
                        sel_sq = None
                        legals = []
                        dragging = False
                        drag_img = None

            if dragging and drag_img:
                screen.blit(drag_img, (drag_pos[0] - SQ_SIZE // 2, drag_pos[1] - SQ_SIZE // 2))

            chk_font = pygame.font.SysFont("Arial", 22, bold=True)
            if board.is_checkmate():
                screen.blit(chk_font.render("Checkmate!", True, RED), (MARGIN_L, 3))
            elif board.is_stalemate():
                screen.blit(chk_font.render("Stalemate!", True, RED), (MARGIN_L, 3))
            elif board.is_check():
                screen.blit(chk_font.render("Check!", True, RED), (MARGIN_L, 3))

            pygame.display.flip()
            clock.tick(MAX_FPS)
    finally:
        engine_mgr.close()
        pygame.quit()

if __name__ == "__main__":
    run_gui()
