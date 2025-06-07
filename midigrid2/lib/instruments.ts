import type { InstrumentOption } from "./types"

export const instrumentOptions: InstrumentOption[] = [
  {
    id: "piano",
    name: "Piano",
    type: "Synth",
    range: { min: 36, max: 84 }, // C2 to C6
  },
  {
    id: "bass",
    name: "Bass",
    type: "MonoSynth",
    range: { min: 24, max: 48 }, // C1 to C3
  },
  {
    id: "drums",
    name: "Drums",
    type: "MembraneSynth",
    range: { min: 36, max: 60 }, // C2 to C4
  },
  {
    id: "violin",
    name: "Violin",
    type: "FMSynth",
    range: { min: 55, max: 88 }, // G3 to E6
  },
  {
    id: "guitar",
    name: "Guitar",
    type: "PluckSynth",
    range: { min: 40, max: 76 }, // E2 to E5
  },
  {
    id: "flute",
    name: "Flute",
    type: "AMSynth",
    range: { min: 60, max: 96 }, // C4 to C7
  },
  {
    id: "brass",
    name: "Brass",
    type: "FMSynth",
    range: { min: 48, max: 84 }, // C3 to C6
  },
  {
    id: "synth-lead",
    name: "Synth Lead",
    type: "DuoSynth",
    range: { min: 60, max: 96 }, // C4 to C7
  },
  {
    id: "percussion",
    name: "Percussion",
    type: "NoiseSynth",
    range: { min: 36, max: 60 }, // C2 to C4
  },
  {
    id: "metal",
    name: "Metal",
    type: "MetalSynth",
    range: { min: 48, max: 84 }, // C3 to C6
  },
]

// Helper function to convert note name to MIDI number
export function noteNameToMidi(noteName: string): number {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

  // Parse the note name to get the note and octave
  const note = noteName.substring(0, noteName.length - 1)
  const octave = Number.parseInt(noteName.substring(noteName.length - 1))

  // Find the note index
  let noteIndex = noteNames.indexOf(note)
  if (noteIndex === -1) {
    // Try with flat notation
    noteIndex = noteNames.indexOf(
      note.replace("Db", "C#").replace("Eb", "D#").replace("Gb", "F#").replace("Ab", "G#").replace("Bb", "A#"),
    )
  }

  if (noteIndex === -1) return -1

  return (octave + 1) * 12 + noteIndex
}

// Helper function to convert MIDI number to note name
export function midiToNoteName(midi: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const octave = Math.floor(midi / 12) - 1
  const note = noteNames[midi % 12]
  return `${note}${octave}`
}
