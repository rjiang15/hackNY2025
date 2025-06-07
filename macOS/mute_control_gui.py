#!/usr/bin/env python3
"""
Mac Annoyance Monitor – Mutes audio immediately and sets the screen
brightness to a random level every 4 seconds.  
Stopping requires solving **five CAPTCHAs in a row**; a single mistake
resets the counter to zero.

Requires:
  • macOS (Darwin)
  • `brightness` CLI (`brew install --HEAD brightness`)
"""

import threading
import tkinter as tk
from tkinter import ttk, messagebox
import subprocess
import time
import platform
import sys
import random
import string

# -------------------------------------------------
#  CONFIGURATION
# -------------------------------------------------
POLLING_INTERVAL_SECONDS = 0.5   # How often to check (seconds) for audio mute
BRIGHTNESS_INTERVAL = 4          # Seconds between random brightness changes
CAPTCHA_LENGTH = 5               # Characters per CAPTCHA challenge
CAPTCHAS_TO_SOLVE = 5            # Must solve this many consecutively
CAPTCHA_W, CAPTCHA_H = 240, 90   # Canvas size for CAPTCHA image


# -------------------------------------------------
#  MACOS VOLUME HELPERS
# -------------------------------------------------
def get_current_output_volume_macos() -> int:
    """Return the current output volume 0–100, or −1 on error."""
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
    """Continuously force the system volume to 0 while monitoring."""
    while not stop_event.is_set():
        if get_current_output_volume_macos() > 0:
            set_master_volume_macos(0)
            time.sleep(0.1)
        time.sleep(POLLING_INTERVAL_SECONDS)


def brightness_annoyer(stop_event: threading.Event) -> None:
    """
    Every BRIGHTNESS_INTERVAL seconds set the display to a random brightness
    between 0.0 and 1.0. Stops immediately when stop_event is set.
    """
    while not stop_event.wait(BRIGHTNESS_INTERVAL):
        subprocess.run(
            ["brightness", f"{random.random():.3f}"],
            capture_output=True
        )


# -------------------------------------------------
#  CAPTCHA UTILITIES
# -------------------------------------------------
def _rand_text(k: int = CAPTCHA_LENGTH) -> str:
    """Generate a random alphanumeric string of length k."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=k))


# -------------------------------------------------
#  MAIN APPLICATION – GUI
# -------------------------------------------------
class MuteAndBrightApp(tk.Tk):
    """GUI that starts two nuisance threads; stopping requires CAPTCHAs."""

    def __init__(self):
        super().__init__()
        self.title("Mac Annoyance Monitor – Audio & Brightness")
        self.geometry("460x220")
        self.resizable(False, False)

        # State
        self.stop_event = threading.Event()
        self.audio_thread: threading.Thread | None = None
        self.bright_thread: threading.Thread | None = None
        self.is_monitoring = False
        self.captchas_done = 0

        # UI widgets
        self.info_lbl = ttk.Label(
            self,
            text=(
                "Press ‘Start Monitoring’ to:\n"
                "  • Instantly mute any audio that escapes.\n"
                f"  • Randomize screen brightness every {BRIGHTNESS_INTERVAL} s.\n\n"
                f"Stopping requires solving {CAPTCHAS_TO_SOLVE} CAPTCHAs in a row!"
            ),
            wraplength=420,
            justify="left",
        )
        self.info_lbl.pack(pady=20)

        self.toggle_btn = ttk.Button(
            self, text="Start Monitoring", command=self.toggle_monitoring
        )
        self.toggle_btn.pack(ipadx=30, ipady=8)

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ---------- Monitoring control ----------
    def toggle_monitoring(self):
        if not self.is_monitoring:
            self._start_monitoring()
        else:
            self._launch_captcha()

    def _start_monitoring(self):
        self.stop_event.clear()
        self.audio_thread = threading.Thread(
            target=audio_muter, args=(self.stop_event,), daemon=True
        )
        self.bright_thread = threading.Thread(
            target=brightness_annoyer, args=(self.stop_event,), daemon=True
        )
        self.audio_thread.start()
        self.bright_thread.start()

        self.is_monitoring = True
        self.captchas_done = 0
        self.toggle_btn.config(text="Attempt to Stop (CAPTCHAs 🧩)")
        self.info_lbl.config(
            text="Monitoring… volume locked to 0; brightness is going wild!"
        )

    def _stop_monitoring(self):
        self.stop_event.set()
        for t in (self.audio_thread, self.bright_thread):
            if t and t.is_alive():
                t.join(timeout=1)
        self.is_monitoring = False
        self.toggle_btn.config(text="Start Monitoring")
        self.info_lbl.config(
            text="Monitoring stopped. Start again whenever you’re brave enough."
        )

    # ---------- CAPTCHA flow ----------
    def _launch_captcha(self):
        if self.captchas_done >= CAPTCHAS_TO_SOLVE:
            self._stop_monitoring()
            return
        CaptchaWin(self)

    def _captcha_success(self):
        self.captchas_done += 1
        left = CAPTCHAS_TO_SOLVE - self.captchas_done
        if left == 0:
            messagebox.showinfo("Victory!", "All CAPTCHAs solved. Stopping monitor…")
            self._stop_monitoring()
        else:
            messagebox.showinfo(
                "Correct!", f"{left} CAPTCHA{'s' if left > 1 else ''} to go…"
            )

    def _captcha_reset(self):
        self.captchas_done = 0
        messagebox.showerror(
            "Wrong!",
            f"Incorrect CAPTCHA. Counter reset—you must solve {CAPTCHAS_TO_SOLVE} in a row."
        )

    # ---------- Cleanup ----------
    def _on_close(self):
        if self.is_monitoring:
            if not messagebox.askyesno("Quit?", "Monitoring is active—quit anyway?"):
                return
            self.stop_event.set()
        self.destroy()


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

    def _ui(self):
        self.canvas = tk.Canvas(
            self,
            width=CAPTCHA_W,
            height=CAPTCHA_H,
            bg="white",
            highlightthickness=0,
        )
        self.canvas.grid(row=0, column=0, columnspan=2, padx=10, pady=(15, 5))
        self._draw_captcha()

        ttk.Label(self, text="Type the characters above:").grid(
            row=1, column=0, columnspan=2, pady=(0, 5)
        )
        self.entry = ttk.Entry(
            self, width=12, font=("Helvetica", 14), justify="center"
        )
        self.entry.grid(row=2, column=0, padx=10, pady=5)
        self.entry.focus_set()

        ttk.Button(self, text="Submit", command=self._check).grid(
            row=2, column=1, padx=10, pady=5
        )

        # Center window
        self.update_idletasks()
        p = self.root
        self.geometry(
            f"{self.winfo_width()}x{self.winfo_height()}"
            f"+{p.winfo_rootx() + p.winfo_width() // 2 - self.winfo_width() // 2}"
            f"+{p.winfo_rooty() + p.winfo_height() // 2 - self.winfo_height() // 2}"
        )

    def _draw_captcha(self):
        c = self.canvas
        c.delete("all")
        for _ in range(8):
            x1, y1, x2, y2 = (random.randint(0, CAPTCHA_W) for _ in range(4))
            c.create_line(x1, y1, x2, y2, fill="grey")
        c.create_text(
            CAPTCHA_W // 2,
            CAPTCHA_H // 2,
            text=self.challenge,
            font=("Helvetica", 30, "bold"),
            fill="black"
        )

    def _check(self):
        if self.entry.get().strip().upper() == self.challenge:
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
