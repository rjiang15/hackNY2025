import pygame
import sys
import os # For checking if the image exists

# --- Configuration ---
LOGO_FILENAME = "dvd_logo.png" # Make sure this image is in the same directory!
FULLSCREEN_MODE = True       # Set to False for windowed testing (easier to close)
FPS = 60                     # Frames per second for smooth animation
INITIAL_SPEED_X = 5          # Pixels per frame
INITIAL_SPEED_Y = 5          # Pixels per frame
BACKGROUND_COLOR = (0, 0, 0) # Black background (R, G, B)

# --- Initialize Pygame ---
pygame.init()

# --- Screen Setup ---
# Get screen resolution dynamically
INFO = pygame.display.Info()
SCREEN_WIDTH, SCREEN_HEIGHT = INFO.current_w, INFO.current_h

if FULLSCREEN_MODE:
    # Use pygame.FULLSCREEN | pygame.NOFRAME for a truly immersive (and annoying) experience
    # NOFRAME removes the title bar and borders, making it hard to close
    SCREEN = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.FULLSCREEN | pygame.NOFRAME)
else:
    # For testing, a regular resizable window might be easier to manage
    # You can still make it borderless if you like, but it won't fill the screen unless maximized
    SCREEN = pygame.display.set_mode((800, 600), pygame.RESIZABLE) # Smaller window for testing
    SCREEN_WIDTH, SCREEN_HEIGHT = 800, 600 # Adjust for testing window size
    pygame.display.set_caption("Annoying DVD Overlay (TEST MODE)")

# --- Load the DVD logo image ---
if not os.path.exists(LOGO_FILENAME):
    print(f"Error: '{LOGO_FILENAME}' not found in the script's directory.")
    print("Please place a DVD logo image (e.g., dvd_logo.png) next to the script.")
    pygame.quit()
    sys.exit()

try:
    logo_image = pygame.image.load(LOGO_FILENAME)
    # Optional: Scale the image if it's too big/small for the screen
    # logo_image = pygame.transform.scale(logo_image, (150, 100)) # Example size
except pygame.error as e:
    print(f"Error loading image: {e}")
    pygame.quit()
    sys.exit()

# Get the rectangle of the logo for easy positioning and collision detection
logo_rect = logo_image.get_rect()

# --- Initial Position ---
# Start near the center, or a random position for more variety
logo_rect.center = (SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)

# --- Movement Variables ---
speed_x = INITIAL_SPEED_X
speed_y = INITIAL_SPEED_Y

# --- Clock for controlling frame rate ---
clock = pygame.time.Clock()

# --- Main Loop (The annoyance begins!) ---
running = True
while running:
    # --- Event Handling (This is where we ignore attempts to close) ---
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            # We don't actually quit here to make it annoying!
            # If you want to allow quitting in test mode, uncomment the line below:
            # if not FULLSCREEN_MODE: running = False
            pass # Deliberately ignore the close button

        # --- Keyboard events for extra annoyance or a hidden exit (for dev) ---
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                # Provide a secret exit key for development/testing
                print("Escape key pressed (developer exit).")
                running = False
            # You could add other annoying key reactions here too

    # --- Update logo position ---
    logo_rect.x += speed_x
    logo_rect.y += speed_y

    # --- Bounce off screen edges ---
    if logo_rect.left < 0 or logo_rect.right > SCREEN_WIDTH:
        speed_x = -speed_x # Reverse horizontal direction
        # Optional: Change color if you have multiple logo images or can recolor dynamically
        # For a simple bounce, we just reverse direction.

    if logo_rect.top < 0 or logo_rect.bottom > SCREEN_HEIGHT:
        speed_y = -speed_y # Reverse vertical direction
        # Optional: Change color

    # --- Drawing ---
    SCREEN.fill(BACKGROUND_COLOR) # Clear screen with background color
    SCREEN.blit(logo_image, logo_rect) # Draw the logo at its current position

    # --- Update the display ---
    pygame.display.flip() # Or pygame.display.update() for more control

    # --- Control frame rate ---
    clock.tick(FPS)

# --- Clean up Pygame ---
pygame.quit()
sys.exit()