import subprocess
import time
import platform
import sys

# --- Configuration ---
POLLING_INTERVAL_SECONDS = 0.5 # How often to check the volume (e.g., every half-second)

def get_current_output_volume_macos():
    """
    Gets the current master output volume level for macOS (0-100).
    Returns -1 if an error occurs.
    """
    try:
        cmd = "osascript -e 'output volume of (get volume settings)'"
        result = subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True)
        return int(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError) as e:
        # print(f"Error getting macOS volume: {e}")
        return -1 # Indicate an error

def set_master_volume_macos(level=0):
    """
    Sets the master output volume level for macOS using osascript.
    :param level: Volume level from 0 to 100.
    """
    try:
        cmd = f"osascript -e 'set volume output volume {level}'"
        subprocess.run(cmd, shell=True, check=True, capture_output=True)
        # print(f"macOS master volume set to {level}.")
    except subprocess.CalledProcessError as e:
        print(f"Error setting macOS volume: {e.stderr.decode().strip()}")
    except Exception as e:
        print(f"An unexpected error occurred during volume set: {e}")

def mute_on_output_macos():
    """
    Continuously polls the macOS output volume and sets it to 0 if detected.
    """
    print("Starting macOS audio output monitor. Volume will be set to 0 if sound is detected.")
    print(f"Polling every {POLLING_INTERVAL_SECONDS} seconds. Press Ctrl+C to stop.")

    while True:
        try:
            current_volume = get_current_output_volume_macos()

            if current_volume > 0:
                print(f"Audio output detected (volume: {current_volume}). Setting to 0...")
                set_master_volume_macos(0)
                # You might want a small delay here to prevent rapid-fire setting
                # when other apps try to raise it back, or if there's a tiny sound burst.
                time.sleep(0.1) # Brief pause after setting to 0

            time.sleep(POLLING_INTERVAL_SECONDS)

        except KeyboardInterrupt:
            print("\nMonitoring stopped by user (Ctrl+C).")
            break
        except Exception as e:
            print(f"An error occurred in the monitoring loop: {e}")
            time.sleep(POLLING_INTERVAL_SECONDS * 2) # Wait longer on error to prevent busy loop

if __name__ == "__main__":
    if platform.system() != "Darwin":
        print("This script is specifically for macOS.")
        sys.exit(1)

    mute_on_output_macos()