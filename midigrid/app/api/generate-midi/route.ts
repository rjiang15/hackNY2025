import { GoogleGenerativeAI } from "@google/generative-ai"
import type { GridCell } from "@/types/grid"

// Convert flats to sharps for consistent note matching
function normalizeNote(note: string): string {
  const enharmonicMap: { [key: string]: string } = {
    'Db': 'C#',
    'Eb': 'D#',
    'Gb': 'F#',
    'Ab': 'G#',
    'Bb': 'A#'
  }

  // Extract note name, accidental, and octave
  const match = note.match(/^([A-G])(b|#)?(\d)$/)
  if (!match) return note

  const [, noteName, accidental, octave] = match

  if (accidental === 'b') {
    const flatNote = noteName + accidental
    const sharpEquivalent = enharmonicMap[flatNote]
    if (sharpEquivalent) {
      return sharpEquivalent + octave
    }
  }

  return note
}

export async function POST(request: Request) {
  try {
    const { prompt, rows, cols, notes } = await request.json()

    // Initialize the Gemini API client
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")
    const model = genAI.getGenerativeModel({ model: "models/gemini-2.0-flash" })

    // Create a more specific system prompt for the larger grid
    const systemPrompt = `
      You are a professional composer, musician, and producer.
      Create a musical song for this request: "${prompt}"

      Make sure to vary the chords and melodies so it doesn't get boring. Use ALL chromatic notes, not just C major! 
      Include sharps and flats to create interesting harmonies and melodies.
      
      Return ONLY a JSON array with ${cols} elements (one for each time step).
      Each element should be an array of notes playing at that step.
      Use note format: [note][accidental][octave] (e.g., "C4", "F#3", "Bb2", "C#4", "Eb3")
      
      Available notes span 3 octaves (all 12 chromatic notes per octave):
      - High octave (octave 4): C4, C#4, D4, D#4, E4, F4, F#4, G4, G#4, A4, A#4, B4
      - Mid octave (octave 3): C3, C#3, D3, D#3, E3, F3, F#3, G3, G#3, A3, A#3, B3  
      - Low octave (octave 2): C2, C#2, D2, D#2, E2, F2, F#2, G2, G#2, A2, A#2, B2
      
      You can use either sharps (#) or flats (b) - both work fine:
      - C#4 = Db4, D#4 = Eb4, F#4 = Gb4, G#4 = Ab4, A#4 = Bb4
      
      This format allows for sparse, musical patterns. Each step can have:
      - [] for silence
      - ["C4"] for single notes  
      - ["C4","E4","G4"] for major chords
      - ["C4","Eb4","G4"] for minor chords
      - ["C4","F#4","Bb4"] for complex harmonies
      
      Create interesting patterns that:
      - Use silence effectively (empty arrays)
      - Have rhythmic variation across the ${cols} steps
      - Include musical phrases and development
      - Use chromatic notes for interesting harmonies
      - Don't stick to just one key - explore different scales and modes
      
      Example format: [["C4"], [], ["C4","Eb4"], ["F#3"], [], ["Bb4","D4"], [], ["G#3","C#4"]]
      
      Return ONLY the JSON array, no other text.
    `

    // Generate the response
    const result = await model.generateContent(systemPrompt)
    const response = await result.response
    const text = response.text().trim()

    console.log("=== GEMINI RESPONSE ===")
    console.log(text)
    console.log("=== END RESPONSE ===")
    console.log("Response length:", text.length)

    // Parse the response as JSON with multiple strategies
    let stepData: string[][]

    try {
      // Strategy 1: Try to parse the entire response as JSON
      stepData = JSON.parse(text)
      console.log("Successfully parsed step data:", stepData.length, "steps")
    } catch (error1) {
      try {
        // Strategy 2: Extract JSON array using regex
        const jsonMatch = text.match(/\[\s*\[[\s\S]*\]\s*\]/)
        if (jsonMatch) {
          stepData = JSON.parse(jsonMatch[0])
          console.log("Successfully parsed step data:", stepData.length, "steps")
        } else {
          throw new Error("No JSON array found")
        }
      } catch (error2) {
        try {
          // Strategy 3: Extract any array-like structure
          const arrayMatch = text.match(/\[[\[\]",\s\w#b]*\]/g)
          if (arrayMatch && arrayMatch.length > 0) {
            // Find the largest array (likely our step data)
            const largestArray = arrayMatch.reduce((a, b) => (a.length > b.length ? a : b))
            stepData = JSON.parse(largestArray)
            console.log("Successfully parsed step data:", stepData.length, "steps")
          } else {
            throw new Error("No array structure found")
          }
        } catch (error3) {
          // Strategy 4: Generate a fallback pattern based on the prompt
          console.error("All parsing strategies failed, generating fallback pattern for prompt:", prompt)
          console.log("Original response was:", text)
          stepData = generateFallbackStepPattern(cols, prompt)
        }
      }
    }

    // Validate and normalize the step data
    if (!Array.isArray(stepData) || stepData.length === 0) {
      console.log("Invalid step data, generating fallback")
      stepData = generateFallbackStepPattern(cols, prompt)
    }

    // Convert the step-based format to our GridCell format
    const grid: GridCell[][] = []
    for (let y = 0; y < rows; y++) {
      const row: GridCell[] = []
      for (let x = 0; x < cols; x++) {
        // Check if this note is active in this step
        const stepNotes = stepData[x] || []
        const currentNote = notes[y]

        // Normalize generated notes and check for matches
        const normalizedStepNotes = stepNotes.map(normalizeNote)
        const isActive = normalizedStepNotes.includes(currentNote)

        row.push({
          active: isActive,
          note: currentNote,
          velocity: 100,
        })
      }
      grid.push(row)
    }

    return Response.json({ grid })
  } catch (error) {
    console.error("Error generating MIDI:", error)

    // Return a fallback pattern instead of failing
    const { rows, cols, notes, prompt } = await request.json()
    const fallbackStepData = generateFallbackStepPattern(cols, prompt)

    const grid: GridCell[][] = []
    for (let y = 0; y < rows; y++) {
      const row: GridCell[] = []
      for (let x = 0; x < cols; x++) {
        const stepNotes = fallbackStepData[x] || []
        const currentNote = notes[y]

        // Normalize generated notes and check for matches
        const normalizedStepNotes = stepNotes.map(normalizeNote)
        const isActive = normalizedStepNotes.includes(currentNote)

        row.push({
          active: isActive,
          note: currentNote,
          velocity: 100,
        })
      }
      grid.push(row)
    }

    return Response.json({ grid })
  }
}



// Generate a fallback step pattern for larger grids
function generateFallbackStepPattern(cols: number, prompt: string): string[][] {
  const stepData: string[][] = []
  const lowerPrompt = prompt.toLowerCase()

  // Generate the standard note array (3 octaves)
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const allNotes: string[] = []
  for (let octave = 4; octave >= 2; octave--) {
    for (const noteName of noteNames) {
      allNotes.push(`${noteName}${octave}`)
    }
  }

  for (let x = 0; x < cols; x++) {
    const stepNotes: string[] = []

    for (let y = 0; y < allNotes.length; y++) {
      let active = false

      // Determine which octave we're in (0 = highest, 2 = lowest)
      const octave = Math.floor(y / 12)
      const noteInOctave = y % 12

      if (lowerPrompt.includes("drum") || lowerPrompt.includes("beat")) {
        // Drum pattern: focus on lower octaves
        if (octave >= 1) {
          if (noteInOctave === 0) {
            // C notes (kick)
            active = x % 4 === 0 || x % 8 === 6
          } else if (noteInOctave === 7) {
            // G notes (snare)
            active = x % 4 === 2
          } else if (noteInOctave === 2 || noteInOctave === 9) {
            // D and A notes (hi-hat)
            active = Math.random() > 0.7
          }
        }
      } else if (lowerPrompt.includes("melody") || lowerPrompt.includes("tune")) {
        // Melody pattern: focus on middle and high octaves
        if (octave <= 1) {
          // Create a more musical pattern
          const phase = (x / cols) * Math.PI * 4
          const noteWeight = Math.sin(phase + noteInOctave * 0.5)
          active = noteWeight > 0.3 && Math.random() > 0.6
        }
      } else if (lowerPrompt.includes("bass")) {
        // Bass pattern: focus on lowest octave
        if (octave === 2) {
          active = x % 8 === 0 || (x % 8 === 4 && Math.random() > 0.5)
        }
      } else if (lowerPrompt.includes("chord") || lowerPrompt.includes("harmony")) {
        // Chord pattern: activate notes that form chords
        if (noteInOctave === 0 || noteInOctave === 4 || noteInOctave === 7) {
          // C major triad
          active = x % 16 === 0 || x % 16 === 8
        }
      } else {
        // Default pattern with more musical structure
        const density = 0.1 - octave * 0.02 // Higher notes less dense
        const rhythmicWeight = Math.sin((x / 4) * Math.PI) * 0.5 + 0.5
        active = Math.random() < density * rhythmicWeight
      }

      if (active) {
        stepNotes.push(allNotes[y])
      }
    }
    stepData.push(stepNotes)
  }

  return stepData
}
