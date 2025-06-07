import type { GridCell } from "@/types/grid"

// Function to generate MIDI grid from a prompt using Gemini API
export async function generateMidiFromPrompt(
  prompt: string,
  rows: number,
  cols: number,
  notes: string[],
): Promise<GridCell[][]> {
  try {
    // Create the API request to Gemini
    const response = await fetch("/api/generate-midi", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        rows,
        cols,
        notes,
      }),
    })

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`)
    }

    const data = await response.json()
    return data.grid
  } catch (error) {
    console.error("Error generating MIDI:", error)
    throw error
  }
}
