import type { InstrumentType, Step, Note } from "./types"
import { noteNameToMidi } from "./instruments"

export async function generateMusic(
  inspiration: string,
  instruments: InstrumentType[],
  numSteps = 32,
): Promise<Step[]> {
  try {
    console.log("=== Starting music generation ===")
    console.log("Steps requested:", numSteps)

    const prompt = createGeminiPrompt(inspiration, instruments, numSteps)
    console.log("Generated prompt length:", prompt.length)

    const response = await fetch("/api/generate-music", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        instruments,
        numSteps,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
      console.error("API error:", errorData)
      throw new Error(`API Error: ${errorData.error || response.statusText}`)
    }

    const data = await response.json()
    console.log("API response received successfully")
    console.log("Debug info:", data.debug)

    if (data.error) {
      throw new Error(`Server error: ${data.error}`)
    }

    if (!data.music) {
      throw new Error("No music data received from server")
    }

    // Parse the generated music data
    const steps = parseGeminiResponse(data.music, instruments)
    console.log("Successfully parsed", steps.length, "steps")

    // Return the steps, trimming if necessary
    return steps.slice(0, numSteps)
  } catch (error) {
    console.error("Error generating music:", error)
    // Return empty steps array on error
    return []
  }
}

function createGeminiPrompt(inspiration: string, instruments: InstrumentType[], numSteps: number): string {
  const bars = Math.round((numSteps / 8) * 10) / 10

  let prompt = `You are a master composer creating expressive, non-robotic music. Compose a ${bars}-bar piece (${numSteps} eighth-note steps) inspired by: "${inspiration}"\n\n`

  prompt += "INSTRUMENTS:\n"
  instruments.forEach((instrument, index) => {
    prompt += `${index + 1}. ${instrument.name} (ID: "${instrument.id}") - Range: ${midiToNoteName(instrument.range.min)} to ${midiToNoteName(instrument.range.max)}\n`
  })

  prompt += `
MUSICAL COMPOSITION GUIDELINES:

1. COUNTERPOINT & VOICE LEADING:
   - Create independent melodic lines that complement each other
   - Use contrary motion (when one voice goes up, another goes down)
   - Employ oblique motion (one voice moves, another stays)
   - Avoid parallel fifths and octaves between voices

2. MELODIC DEVELOPMENT:
   - Create memorable motifs and develop them through:
     * Sequence (repeating at different pitch levels)
     * Inversion (turning intervals upside down)
     * Augmentation/diminution (longer/shorter note values)
     * Fragmentation (breaking motifs into smaller pieces)

3. RHYTHMIC VARIETY:
   - Use syncopation and off-beat accents
   - Vary note durations (use ties with "T" suffix)
   - Create polyrhythms between instruments
   - Include strategic rests for breathing space

4. HARMONIC PROGRESSION:
   - Use functional harmony with interesting chord progressions
   - Include secondary dominants and borrowed chords
   - Create tension and resolution
   - Consider the emotional arc of "${inspiration}"

5. TEXTURAL VARIETY:
   - Alternate between thick and thin textures
   - Use call-and-response between instruments
   - Create moments of solo lines vs. ensemble playing
   - Build and release musical tension

TECHNICAL FORMAT:
- Output EXACTLY ${numSteps} steps as a JSON array
- Each step = one eighth note
- Use note format: "C4", "F#3", "Bb5", "C4T" (T = tied to next)
- Empty arrays [] = rests
- Respect instrument ranges

EXAMPLE STRUCTURE (adapt to your composition):
[
  {"${instruments[0]?.id}": ["C4"], "${instruments[1]?.id}": ["C2"]},
  {"${instruments[0]?.id}": ["D4"], "${instruments[1]?.id}": []},
  {"${instruments[0]?.id}": ["E4T"], "${instruments[1]?.id}": ["G2"]},
  {"${instruments[0]?.id}": ["E4"], "${instruments[1]?.id}": []},
  ...continue for ${numSteps} total steps
]

INSPIRATION INTERPRETATION:
Based on "${inspiration}", create music that:
- Captures the emotional essence and mood
- Uses appropriate harmonic language (major/minor, consonant/dissonant)
- Reflects any implied tempo, dynamics, or character
- Tells a musical story that unfolds over ${bars} bars

CRITICAL: Respond with ONLY the JSON array of ${numSteps} steps. No explanations, no markdown formatting, just the pure JSON.`

  return prompt
}

function parseGeminiResponse(musicData: any, instruments: InstrumentType[]): Step[] {
  try {
    let parsedData = musicData
    if (typeof musicData === "string") {
      const cleanedData = musicData.replace(/```json\n?|\n?```/g, "").trim()
      parsedData = JSON.parse(cleanedData)
    }

    if (!Array.isArray(parsedData)) {
      throw new Error("Music data is not an array")
    }

    console.log("Processing", parsedData.length, "steps from AI")
    const steps: Step[] = []

    parsedData.forEach((stepData: any, stepIndex: number) => {
      const step: Step = {}

      instruments.forEach((instrument) => {
        const instrumentNotes = stepData[instrument.id]
        if (!instrumentNotes || !Array.isArray(instrumentNotes)) {
          step[instrument.id] = []
          return
        }

        const notes: Note[] = []

        instrumentNotes.forEach((noteString: string) => {
          if (typeof noteString !== "string") return

          const isTiedToNext = noteString.endsWith("T")
          const cleanNoteString = isTiedToNext ? noteString.slice(0, -1) : noteString

          const midiNote = noteNameToMidi(cleanNoteString)

          if (midiNote < 0 || midiNote < instrument.range.min || midiNote > instrument.range.max) {
            console.warn(`Note ${cleanNoteString} outside range for ${instrument.name}`)
            return
          }

          let isTiedFromPrevious = false
          if (stepIndex > 0) {
            const prevStep = steps[stepIndex - 1]
            const prevInstrumentNotes = prevStep[instrument.id] || []
            isTiedFromPrevious = prevInstrumentNotes.some(
              (prevNote) => prevNote.fullNote === cleanNoteString && prevNote.isTiedToNext,
            )
          }

          notes.push({
            fullNote: cleanNoteString,
            midiNote,
            isTiedFromPrevious,
            isTiedToNext,
          })
        })

        step[instrument.id] = notes
      })

      steps.push(step)
    })

    return steps
  } catch (error) {
    console.error("Error parsing music response:", error)
    return []
  }
}

function midiToNoteName(midi: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const octave = Math.floor(midi / 12) - 1
  const note = noteNames[midi % 12]
  return `${note}${octave}`
}
