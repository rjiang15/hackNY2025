import threading
import tkinter as tk
from tkinter import ttk, messagebox
import subprocess
import time
import platform
import sys

# --- Configuration ---
POLLING_INTERVAL_SECONDS = 0.5  # How often to check the volume (seconds)


def get_current_output_volume_macos():
    """Return current master output volume (0-100) on macOS, or -1 on error."""
    try:
        cmd = "osascript -e 'output volume of (get volume settings)'"
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        return int(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError):
        return -1


def set_master_volume_macos(level: int = 0):
    """Set master output volume on macOS (0-100)."""
    try:
        cmd = f"osascript -e 'set volume output volume {level}'"
        subprocess.run(cmd, shell=True, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        print(f"Error setting macOS volume: {e.stderr.decode().strip()}")
    except Exception as e:
        print(f"Unexpected error during volume set: {e}")


def mute_on_output_macos(stop_event: threading.Event):
    """Continuously mute the system if output volume rises above 0 until stop_event is set."""
    print("Monitoring started — audio will be muted if any output is detected.")

    while not stop_event.is_set():
        try:
            current_volume = get_current_output_volume_macos()
            if current_volume > 0:
                print(f"Audio detected (volume {current_volume}). Muting…")
                set_master_volume_macos(0)
                time.sleep(0.1)  # brief pause after muting
            time.sleep(POLLING_INTERVAL_SECONDS)
        except Exception as e:
            print(f"Error in monitoring loop: {e}")
            time.sleep(POLLING_INTERVAL_SECONDS * 2)

    print("Monitoring stopped.")


class MuteMonitorApp(tk.Tk):
    """Small Tkinter GUI to toggle the mute-monitor on and off."""

    def __init__(self):
        super().__init__()

        self.title("Mac Audio Mute Monitor")
        self.geometry("400x180")
        self.resizable(False, False)

        self.stop_event = threading.Event()
        self.monitor_thread: threading.Thread | None = None
        self.is_monitoring = False

        # --- Widgets ---
        self.info_label = ttk.Label(
            self,
            text="Press ‘Start Monitoring’ to automatically mute audio output whenever the system volume goes above 0.",
            wraplength=360,
            justify="center",
            font=("Helvetica", 11),
        )
        self.info_label.pack(pady=20)

        self.toggle_button = ttk.Button(self, text="Start Monitoring", command=self.toggle_monitoring)
        self.toggle_button.pack(ipadx=20, ipady=6)

        # Handle window close
        self.protocol("WM_DELETE_WINDOW", self.on_close)

    # --- UI Callbacks ---
    def toggle_monitoring(self):
        if not self.is_monitoring:
            # Start monitoring in background thread
            self.stop_event.clear()
            self.monitor_thread = threading.Thread(
                target=mute_on_output_macos, args=(self.stop_event,), daemon=True
            )
            self.monitor_thread.start()
            self.is_monitoring = True
            self.toggle_button.config(text="Stop Monitoring")
            self.info_label.config(text="Monitoring… System audio will be muted if any output is detected.")
        else:
            # Stop monitoring
            self.stop_event.set()
            if self.monitor_thread and self.monitor_thread.is_alive():
                self.monitor_thread.join(timeout=1)
            self.is_monitoring = False
            self.toggle_button.config(text="Start Monitoring")
            self.info_label.config(text="Monitoring stopped. Press ‘Start Monitoring’ to begin again.")

    def on_close(self):
        if self.is_monitoring:
            self.stop_event.set()
            if self.monitor_thread and self.monitor_thread.is_alive():
                self.monitor_thread.join(timeout=1)
        self.destroy()


if __name__ == "__main__":
    if platform.system() != "Darwin":
        # Need to create a *temporary* root to show the messagebox cleanly, then destroy it.
        tmp_root = tk.Tk()
        tmp_root.withdraw()
        messagebox.showerror("Unsupported OS", "This application is only supported on macOS.")
        tmp_root.destroy()
        sys.exit(1)

    # Create main application window first
    app = MuteMonitorApp()

    # Configure style *after* a root exists so no phantom window is created
    try:
        style = ttk.Style(app)
        style.theme_use("clam")
    except tk.TclError:
        pass

    app.mainloop()
