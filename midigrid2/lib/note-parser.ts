import type { Note } from "./types"
import { noteNameToMidi } from "./instruments"

// Parse a note string into a Note object
export function parseNote(noteString: string, previousNote?: Note): Note {
  // Check if the note is tied
  const isTiedToNext = noteString.endsWith("T")

  // Remove the tie indicator if present
  const cleanNoteString = isTiedToNext ? noteString.slice(0, -1) : noteString

  // Convert to MIDI note number
  const midiNote = noteNameToMidi(cleanNoteString)

  // Determine if this note is tied from the previous note
  const isTiedFromPrevious = previousNote
    ? previousNote.fullNote === cleanNoteString && previousNote.isTiedToNext
    : false

  return {
    fullNote: cleanNoteString,
    midiNote,
    isTiedFromPrevious,
    isTiedToNext,
  }
}
