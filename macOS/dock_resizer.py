#!/usr/bin/env python3
"""
dock_shaker.py – make the macOS Dock ‘quiver’ by flipping its tile size.

• Requires: macOS, Terminal (or Python) with Accessibility permission
• Stop with: Ctrl-C, or it quits automatically after the chosen duration
"""

import argparse
import signal
import subprocess
import sys
import time
from contextlib import suppress


def read_tilesize() -> int:
    """Return current Dock icon size (int)."""
    out = subprocess.check_output(
        ["defaults", "read", "com.apple.dock", "tilesize"], text=True
    )
    return int(out.strip())


def set_tilesize(px: int) -> None:
    """Write Dock icon size and restart Dock to apply."""
    subprocess.run(["defaults", "write", "com.apple.dock", "tilesize", "-int", str(px)], check=True)
    subprocess.run(["killall", "Dock"], check=True)


def main() -> None:
    ap = argparse.ArgumentParser(formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    ap.add_argument("--small",  type=int, default=48,  help="minimum icon size (px)")
    ap.add_argument("--large",  type=int, default=128, help="maximum icon size (px)")
    ap.add_argument("--interval", type=float, default=0.20, help="seconds between flips")
    ap.add_argument("--duration", type=float, default=30,   help="total prank time (s)")
    args = ap.parse_args()

    if sys.platform != "darwin":
        sys.exit("⛔  macOS only.")

    original = read_tilesize()
    print(f"Current Dock size is {original}px — will restore on exit.")

    running = True

    def cleanup(_sig=None, _frame=None):
        nonlocal running
        running = False

    # Ensure we restore the Dock even if the user SIGINTs us
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    start = time.time()
    try:
        while running and (time.time() - start) < args.duration:
            for size in (args.small, args.large):
                if not running:
                    break
                set_tilesize(size)
                time.sleep(args.interval)
    finally:
        # Restore the user’s original preference
        with suppress(Exception):
            set_tilesize(original)
        print("✅  Dock size reset – bye!")

if __name__ == "__main__":
    main()
