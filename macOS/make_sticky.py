#!/usr/bin/env python3
"""
make_sticky.py – Create a Stickies note on macOS via **GUI scripting**.

Stickies has **no AppleScript dictionary**, so the only reliable way to automate
it is through *System Events* (GUI scripting).  This script:

1. Opens/activates **Stickies**.
2. Uses System Events to trigger **File → New Note** (⌘‑N).
3. Pastes the text you provide into the new note via the clipboard.
4. Optionally sets the note’s colour by choosing  **Color → <Colour>**.

The script requires:
* macOS 10.15 Catalina or later (GUI‑scripting works back to much earlier
  releases, but hasn’t been tested).
* Terminal (or whatever launches this script) granted the _“Control your
  computer”_ permission in **System Settings → Privacy & Security → Accessibility**.

Usage
-----
```bash
# Basic yellow note (default colour)
python make_sticky.py "Don’t forget to stretch!"

# Choose a specific Stickies colour
python make_sticky.py "Meeting at 4 PM" --color blue
```

Accepted colours: `yellow` (default), `blue`, `green`, `pink`, `purple`, `gray`.
"""
from __future__ import annotations

import argparse
import subprocess
import textwrap
from typing import Final

# Stickies menu item names (capitalised) – used for the Color menu.
COLOURS: Final[dict[str, str]] = {
    "yellow": "Yellow",
    "blue": "Blue",
    "green": "Green",
    "pink": "Pink",
    "purple": "Purple",
    "gray": "Gray",
}


def _escape_as_quotes(text: str) -> str:
    """Escape text so it can live inside an AppleScript quoted string."""
    return (
        text.replace("\\", "\\\\")  # escape backslashes first
        .replace("\"", "\\\"")        # then double quotes
    )


def build_applescript(body: str, colour: str | None) -> str:
    """Return AppleScript that creates a new Stickies note with *body*."""
    esc_body = _escape_as_quotes(body)

    script_lines: list[str] = [
        # 1. Launch Stickies
        'tell application "Stickies" to activate',
        # 2. GUI‑script the menu to create a note
        'tell application "System Events"',
        '  -- Wait for Stickies to finish launching & expose its menu bar',
        '  repeat until exists (menu bar 1 of process "Stickies")',
        '    delay 0.05',
        '  end repeat',
        '  tell process "Stickies"',
        '    click menu item "New Note" of menu "File" of menu bar 1',
        '    -- Wait for the new note window to exist',
        '    repeat until exists window 1',
        '      delay 0.05',
        '    end repeat',
        # 3. Set clipboard and paste into note (avoids typing‑speed problems)
        f'    set the clipboard to "{esc_body}"',
        '    click menu item "Paste" of menu "Edit" of menu bar 1',
    ]

    if colour:
        menu_name = COLOURS[colour]
        script_lines.append(f'    click menu item "{menu_name}" of menu "Color" of menu bar 1')

    script_lines.extend([
        '  end tell',
        'end tell',
    ])

    return "\n".join(script_lines)


def create_sticky(text: str, colour: str | None) -> None:
    """Generate & run AppleScript that creates a Stickies note."""
    apple_script = build_applescript(text, colour)
    subprocess.run(["osascript", "-"], input=apple_script.encode(), check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=textwrap.dedent(
            """Create a Stickies note on macOS via GUI scripting.

Examples:
  python make_sticky.py "Pay rent" --color pink
  python make_sticky.py "Lunch with Alex – 1 PM"
            """,
        ),
    )
    parser.add_argument("text", help="The note’s body text – wrap in quotes if it contains spaces.")
    parser.add_argument(
        "-c",
        "--color",
        dest="colour",
        choices=sorted(COLOURS),
        help="Background colour of the note (default: yellow).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        create_sticky(args.text, args.colour)
    except subprocess.CalledProcessError:
        print("Failed to talk to Stickies via osascript – check Privacy ➜ Accessibility permissions.")


if __name__ == "__main__":
    main()
