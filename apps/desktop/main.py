"""
Main Desktop Entrypoint.
Launches Pygame desktop application.
"""

import sys
import logging

from apps.desktop.gui import run_gui

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

if __name__ == "__main__":
    run_gui()
