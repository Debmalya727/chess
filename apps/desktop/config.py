import os
import shutil
from pathlib import Path
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ASSETS_DIR = BASE_DIR / "assets"

def find_stockfish_binary() -> str | None:
    """Auto-detect Stockfish binary from env or common system paths."""
    env_path = os.getenv("STOCKFISH_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path
    
    which_path = shutil.which("stockfish") or shutil.which("stockfish.exe")
    if which_path:
        return which_path
    
    candidate_paths = [
        "/usr/games/stockfish",
        "/usr/bin/stockfish",
        "/usr/local/bin/stockfish",
        r"C:\Program Files\Stockfish\stockfish.exe",
        r"C:\stockfish\stockfish.exe",
        r"D:\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe",
    ]
    for candidate in candidate_paths:
        if os.path.isfile(candidate):
            return candidate
            
    return None

STOCKFISH_PATH = find_stockfish_binary()
MULTI_PV = int(os.getenv("MULTI_PV", "3"))
ENGINE_TIME_LIMIT = float(os.getenv("ENGINE_TIME_LIMIT", "0.2"))
BOARD_SIZE = int(os.getenv("BOARD_SIZE", "480"))
MAX_FPS = int(os.getenv("MAX_FPS", "30"))
