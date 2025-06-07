#!/usr/bin/env python3
"""
Mac Annoyance Monitor – turns your Mac into a chaotic distraction machine.

Features when **Monitoring** is ON
----------------------------------
1. **Instant mute** – system volume is forced to 0 every 0.5 s.
2. **Blinking brightness** – screen brightness jumps to a random level every
   4 s (`brew install --HEAD brightness` required).
3. **Sticky‑note spam** – a new Stickies window pops up every 10 s.
4. **Escape challenge** – stopping the mayhem requires solving **5 CAPTCHAs in
   a row**.  A 40 % cosmic “bad‑luck roll” can still reset your streak even on
   correct answers.

Requirements
------------
* macOS (Darwin) with the **Stickies** app present.
* Terminal (or Python interpreter) granted *Accessibility* privileges so GUI
  scripting can control Stickies.
* `brightness` CLI for brightness control: `brew install --HEAD brightness`.

Run it
------
```bash
python annoyance_monitor.py
```
"""
from __future__ import annotations

import platform
import random
import string
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import messagebox, ttk
import os
import subprocess


# ---- External helper ---------------------------------------------
# `make_sticky.py` lives in the same folder (or on the PYTHONPATH).
# If your project layout differs, adjust the import path accordingly.
try:
    from make_sticky import create_sticky  # type: ignore
except ImportError:
    # Fallback so the rest of the script still loads for non‑macOS users.
    def create_sticky(text: str, colour: str | None = None) -> None:  # noqa: D401
        """Dummy implementation for non‑macOS / missing dependency."""
        print(f"[Sticky‑note suppressed] Would have shown note: {text!r}")

def _detach_from_terminal() -> None:
    """
    If we’re running *in a Terminal*, relaunch ourselves detached so ⌃C doesn’t
    kill the prank.  When we’re inside a frozen .app bundle (sys.frozen == True)
    OR there’s no controlling TTY, we do nothing.
    """
    import os, subprocess, sys

    # Already detached, or not even in a TTY, or we’re inside the .app
    if os.getenv("ANNOY_DETACHED") == "1" or not sys.stdin.isatty() or getattr(sys, "frozen", False):
        return

    env = os.environ.copy()
    env["ANNOY_DETACHED"] = "1"

    subprocess.Popen(
        [sys.executable, *sys.argv],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        env=env,
    )
    sys.exit(0)


# -------------------------------------------------
#  CONFIGURATION
# -------------------------------------------------
POLLING_INTERVAL_SECONDS = 0.5   # How often to re‑mute audio
BRIGHTNESS_INTERVAL = 2          # Seconds between random brightness changes
STICKY_INTERVAL = 10             # Seconds between spawning Stickies
CAPTCHA_LENGTH = 5               # Characters per CAPTCHA challenge
CAPTCHAS_TO_SOLVE = 5            # Must solve this many consecutively
CAPTCHA_W, CAPTCHA_H = 240, 90   # Canvas size for CAPTCHA image
BAD_LUCK_PROB = 0.40             # 40 % chance to reset even after success
DOCK_SMALL   = 10        # px
DOCK_LARGE   = 128       # px
DOCK_INTERVAL = 1     # s  flip cadence

# -------------------------------------------------
#  MACOS VOLUME HELPERS
# -------------------------------------------------

def get_current_output_volume_macos() -> int:
    """Return the current output volume 0–100, or −1 on error."""
    try:
        result = subprocess.run(
            ["osascript", "-e", "output volume of (get volume settings)"],
            check=True,
            capture_output=True,
            text=True,
        )
        return int(result.stdout.strip())
    except Exception:
        return -1


def set_master_volume_macos(level: int = 0) -> None:
    """Set master output volume to the given level (0–100)."""
    try:
        subprocess.run(
            ["osascript", "-e", f"set volume output volume {level}"],
            check=True,
            capture_output=True,
        )
    except Exception as e:
        print("[Volume] Could not set volume:", e)


# -------------------------------------------------
#  BACKGROUND WORKER THREADS
# -------------------------------------------------

def audio_muter(stop_event: threading.Event) -> None:
    """Continuously force the system volume to 0 while monitoring."""
    while not stop_event.is_set():
        if get_current_output_volume_macos() > 0:
            set_master_volume_macos(0)
            time.sleep(0.1)
        time.sleep(POLLING_INTERVAL_SECONDS)


def brightness_annoyer(stop_event: threading.Event) -> None:
    """Flash brightness every *BRIGHTNESS_INTERVAL* seconds."""
    while not stop_event.wait(BRIGHTNESS_INTERVAL):
        subprocess.run(["brightness", f"{random.random():.3f}"], capture_output=True)


def sticky_spammer(stop_event: threading.Event) -> None:
    """Spawn a new Sticky note every *STICKY_INTERVAL* seconds."""
    counter = 1
    while not stop_event.wait(STICKY_INTERVAL):
        try:
            create_sticky("Are you having fun yet?", colour=None)
            counter += 1
        except Exception as e:
            print("[Sticky] Could not create note:", e)

def dock_shaker(stop_event: threading.Event) -> None:
    """
    Flip Dock icon size between DOCK_SMALL and DOCK_LARGE every DOCK_INTERVAL
    until *stop_event* is set.  Always restores the user’s original size.
    """
    # Remember the user’s preference so we can undo the prank
    try:
        original = int(
            subprocess.check_output(
                ["defaults", "read", "com.apple.dock", "tilesize"], text=True
            ).strip()
        )
    except Exception:
        original = None

    cur = DOCK_SMALL  # start small so first flip shows the big jump
    try:
        while not stop_event.is_set():
            # 1️⃣  write new size
            subprocess.run(
                ["defaults", "write", "com.apple.dock", "tilesize", "-int", str(cur)],
                check=False,
                capture_output=True,
            )
            # 2️⃣  bounce Dock (ignore “no matching process” errors)
            subprocess.run(["killall", "Dock"], check=False, capture_output=True)

            # toggle for next round
            cur = DOCK_LARGE if cur == DOCK_SMALL else DOCK_SMALL

            # 3️⃣  wait   –   exit early if someone calls stop_event.set()
            if stop_event.wait(DOCK_INTERVAL):
                break
    finally:
        # put everything back exactly the way we found it
        if original is not None:
            subprocess.run(
                ["defaults", "write", "com.apple.dock", "tilesize", "-int", str(original)],
                check=False,
                capture_output=True,
            )
            subprocess.run(["killall", "Dock"], check=False, capture_output=True)


# -------------------------------------------------
#  CAPTCHA UTILITIES
# -------------------------------------------------

def _rand_text(k: int = CAPTCHA_LENGTH) -> str:
    """Generate a random alphanumeric string of length *k*."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=k))


# -------------------------------------------------
#  MAIN APPLICATION – GUI
# -------------------------------------------------


class MuteAndBrightApp(tk.Tk):
    """GUI that starts three nuisance threads; stopping requires CAPTCHAs."""

    def __init__(self) -> None:
        super().__init__()

        self.bind_all("<Command-Return>", self._backdoor_quit)   # most Macs
        self.bind_all("<Command-Enter>",  self._backdoor_quit)   # Tk fallback

        self.title("Fun Monitor!")
        self.geometry("480x240")
        self.resizable(False, False)

        # State
        self.stop_event = threading.Event()
        self.audio_thread: threading.Thread | None = None
        self.bright_thread: threading.Thread | None = None
        self.sticky_thread: threading.Thread | None = None
        self.dock_thread:   threading.Thread | None = None    #  ← add this
        self.is_monitoring = False
        self.captchas_done = 0

        # ---------- UI widgets ----------
        self.info_lbl = ttk.Label(
            self,
            text=(
                "Press ‘Start Monitoring’ to find out..."
            ),
            wraplength=440,
            justify="left",
        )
        self.info_lbl.pack(pady=20)

        self.toggle_btn = ttk.Button(self, text="Start Monitoring", command=self.toggle_monitoring)
        self.toggle_btn.pack(ipadx=30, ipady=8)

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ---------- Monitoring control ----------
    def toggle_monitoring(self) -> None:
        if not self.is_monitoring:
            self._start_monitoring()
        else:
            self._launch_captcha()

    def _start_monitoring(self) -> None:
        self.stop_event.clear()

        self.audio_thread = threading.Thread(target=audio_muter, args=(self.stop_event,), daemon=True)
        self.bright_thread = threading.Thread(target=brightness_annoyer, args=(self.stop_event,), daemon=True)
        self.sticky_thread = threading.Thread(target=sticky_spammer, args=(self.stop_event,), daemon=True)
        self.dock_thread   = threading.Thread(target=dock_shaker, args=(self.stop_event,), daemon=True)  # NEW

        for t in (self.audio_thread, self.bright_thread, self.sticky_thread, self.dock_thread):
            t.start()

        self.is_monitoring = True
        self.captchas_done = 0
        self.toggle_btn.config(text="Now why would you want to stop?")
        self.info_lbl.config(
            text="Lots of fun being had"
        )

    def _stop_monitoring(self) -> None:
        self.stop_event.set()
        for t in (self.audio_thread, self.bright_thread, self.sticky_thread, self.dock_thread):
            if t and t.is_alive():
                t.join(timeout=1)
        self.is_monitoring = False
        self.toggle_btn.config(text="Start Monitoring")
        self.info_lbl.config(
            text="Monitoring stopped. Start again whenever you’re brave enough."
        )

    # ---------- CAPTCHA flow ----------
    def _launch_captcha(self) -> None:
        if self.captchas_done >= CAPTCHAS_TO_SOLVE:
            self._stop_monitoring()
            return
        CaptchaWin(self)

    def _captcha_success(self) -> None:
        self.captchas_done += 1
        left = CAPTCHAS_TO_SOLVE - self.captchas_done
        if left == 0:
            messagebox.showinfo("Victory!", "All CAPTCHAs solved. Stopping monitor for now…")
            self._stop_monitoring()
        else:
            messagebox.showinfo("Ok fine!", f"{left} CAPTCHA{'s' if left > 1 else ''} to go…")

    def _captcha_reset(self, custom_msg: str | None = None) -> None:
        self.captchas_done = 0
        messagebox.showerror(
            "Try Again!",
            custom_msg or (
                "Incorrect CAPTCHA. Now you must solve "
                f"{CAPTCHAS_TO_SOLVE} in a row."
            ),
        )

    # ---------- Cleanup ----------
    def _on_close(self) -> None:
        """Handle clicks on the red macOS close button (⨉)."""
        if self.is_monitoring:
            # Treat it exactly like pressing “Attempt to Stop”:
            self._launch_captcha()
        else:
            # Safe to quit when nothing evil is running
            self.destroy()

    def _backdoor_quit(self, _event: Any | None = None) -> None:
        """Immediate hard-quit triggered by Cmd + Enter."""
        try:
            # stop nuisance threads if they’re running
            if self.is_monitoring:
                self.stop_event.set()
        finally:
            # tear down the window and kill the interpreter
            self.destroy()
            sys.exit(0)

# ---------------- CAPTCHA WINDOW ----------------


class CaptchaWin(tk.Toplevel):
    def __init__(self, root: MuteAndBrightApp):
        super().__init__(root)
        self.root = root
        self.title("CAPTCHA Challenge – Can you stop the madness?")
        self.resizable(False, False)
        self.protocol("WM_DELETE_WINDOW", lambda: None)

        self.challenge = _rand_text()
        self._ui()

    def _ui(self) -> None:
        self.canvas = tk.Canvas(
            self,
            width=CAPTCHA_W,
            height=CAPTCHA_H,
            bg="white",
            highlightthickness=0,
        )
        self.canvas.grid(row=0, column=0, columnspan=2, padx=10, pady=(15, 5))
        self._draw_captcha()

        ttk.Label(self, text="Type the characters above:").grid(row=1, column=0, columnspan=2, pady=(0, 5))
        self.entry = ttk.Entry(self, width=12, font=("Helvetica", 14), justify="center")
        self.entry.grid(row=2, column=0, padx=10, pady=5)
        self.entry.focus_set()

        ttk.Button(self, text="Submit", command=self._check).grid(row=2, column=1, padx=10, pady=5)

        # Center window
        self.update_idletasks()
        p = self.root
        self.geometry(
            f"{self.winfo_width()}x{self.winfo_height()}"
            f"+{p.winfo_rootx() + p.winfo_width() // 2 - self.winfo_width() // 2}"
            f"+{p.winfo_rooty() + p.winfo_height() // 2 - self.winfo_height() // 2}"
        )

    def _draw_captcha(self) -> None:
        c = self.canvas
        c.delete("all")
        for _ in range(700):
            x1, y1, x2, y2 = (random.randint(0, CAPTCHA_W) for _ in range(4))
            c.create_line(x1, y1, x2, y2, fill="black")
        c.create_text(
            CAPTCHA_W // 2,
            CAPTCHA_H // 2,
            text=self.challenge,
            font=("Helvetica", 30, "bold"),
            fill="black",
        )

    def _check(self) -> None:
        answer = self.entry.get().strip().upper()
        if answer == self.challenge:
            # Good answer – now roll the cosmic dice
            if random.random() < BAD_LUCK_PROB:
                self.destroy()
                self.root._captcha_reset(
                    "You got it, but I've decided some extra practice can't hurt. "
                    f"Solve {CAPTCHAS_TO_SOLVE} in a row."
                )
            else:
                self.destroy()
                self.root._captcha_success()
        else:
            self.root._captcha_reset()
            self.challenge = _rand_text()
            self._draw_captcha()
            self.entry.delete(0, tk.END)


# -------------------------------------------------
#  LAUNCH
# -------------------------------------------------

if __name__ == "__main__":
    _detach_from_terminal()
    if platform.system() != "Darwin":
        tmp = tk.Tk()
        tmp.withdraw()
        messagebox.showerror("Unsupported OS", "macOS only.")
        tmp.destroy()
        sys.exit(1)

    app = MuteAndBrightApp()
    try:
        ttk.Style(app).theme_use("clam")
    except tk.TclError:
        pass
    app.mainloop()
