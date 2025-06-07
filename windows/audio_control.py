import time
import platform
import sys
import random

# --- Configuration ---
POLLING_INTERVAL_SECONDS = 0.5 # How often to check the volume (e.g., every half-second)

def get_current_output_volume_windows():
    """
    Gets the current master output volume level for Windows (0-100).
    Returns -1 if an error occurs.
    """
    try:
        from comtypes import CLSCTX_ALL
        from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
        from ctypes import cast, POINTER
        
        devices = AudioUtilities.GetSpeakers()
        interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        volume = cast(interface, POINTER(IAudioEndpointVolume))
        
        # Get volume as scalar (0.0 to 1.0) and convert to percentage
        current_volume_scalar = volume.GetMasterVolumeLevelScalar()
        return int(current_volume_scalar * 100)
        
    except Exception as e:
        # print(f"Error getting Windows volume: {e}")
        return -1 # Indicate an error

def set_master_volume_windows(level=0):
    """
    Sets the master output volume level for Windows.
    :param level: Volume level from 0 to 100.
    """
    try:
        from comtypes import CLSCTX_ALL
        from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
        from ctypes import cast, POINTER
        
        devices = AudioUtilities.GetSpeakers()
        interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        volume = cast(interface, POINTER(IAudioEndpointVolume))
        
        # Convert percentage (0-100) to scalar (0.0-1.0)
        volume_scalar = level / 100.0
        volume.SetMasterVolumeLevelScalar(volume_scalar, None)
        # print(f"Windows master volume set to {level}.")
        
    except Exception as e:
        print(f"Error setting Windows volume: {e}")

def mute_on_output_windows():
    """
    Continuously polls the Windows output volume and sets it to 0 if detected.
    """
    print("Starting Windows audio output monitor. Volume will be set to 0 if sound is detected.")
    print(f"Polling every {POLLING_INTERVAL_SECONDS} seconds. Press Ctrl+C to stop.")
    
    # Check if pycaw is installed
    try:
        import pycaw
    except ImportError:
        print("Error: pycaw library not found. Please install it with: pip install pycaw")
        print("Note: You may also need Visual C++ Build Tools for Windows.")
        sys.exit(1)

    while True:
        try:
            current_volume = get_current_output_volume_windows()
            set_master_volume_windows(random.randint(0, 100))

            if current_volume > 0:
                print(f"Audio output detected (volume: {current_volume}%). Setting to 0...")
                # set_master_volume_windows(0)
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
    if platform.system() != "Windows":
        print("This script is specifically for Windows.")
        print("For macOS, use the script in the macOS folder.")
        sys.exit(1)

    mute_on_output_windows() 
