"use client"

import { useRef, useEffect } from "react"
import type { InstrumentType, Step } from "@/lib/types"

interface PianoRollProps {
  steps: Step[]
  instruments: InstrumentType[]
  focusedInstrument: string | null
}

export default function PianoRoll({ steps, instruments, focusedInstrument }: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Constants for drawing
  const CELL_WIDTH = 30
  const CELL_HEIGHT = 12
  const KEYBOARD_WIDTH = 60
  const HEADER_HEIGHT = 30

  // Find the overall min and max MIDI notes across all instruments
  const minNote = Math.min(...instruments.map((inst) => inst.range.min))
  const maxNote = Math.max(...instruments.map((inst) => inst.range.max))
  const noteRange = maxNote - minNote + 1

  // Calculate canvas dimensions
  const canvasWidth = KEYBOARD_WIDTH + steps.length * CELL_WIDTH
  const canvasHeight = HEADER_HEIGHT + noteRange * CELL_HEIGHT

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions with higher resolution for retina displays
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr

    // Scale the context to ensure correct drawing dimensions
    ctx.scale(dpr, dpr)

    // Set the CSS dimensions
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw piano roll background
    drawBackground(ctx)

    // Draw notes
    drawNotes(ctx)
  }, [steps, instruments, focusedInstrument])

  const drawBackground = (ctx: CanvasRenderingContext2D) => {
    // Draw header background
    ctx.fillStyle = "#f3f4f6"
    ctx.fillRect(0, 0, canvasWidth, HEADER_HEIGHT)

    // Draw keyboard background
    ctx.fillStyle = "#e5e7eb"
    ctx.fillRect(0, HEADER_HEIGHT, KEYBOARD_WIDTH, canvasHeight - HEADER_HEIGHT)

    // Draw grid
    ctx.strokeStyle = "#d1d5db"
    ctx.lineWidth = 0.5

    // Draw horizontal lines (note divisions)
    for (let i = 0; i <= noteRange; i++) {
      const y = HEADER_HEIGHT + i * CELL_HEIGHT

      // Highlight C notes with darker lines
      const noteNumber = maxNote - i
      if (noteNumber % 12 === 0) {
        // C notes
        ctx.strokeStyle = "#9ca3af"
        ctx.lineWidth = 1
      } else {
        ctx.strokeStyle = "#d1d5db"
        ctx.lineWidth = 0.5
      }

      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvasWidth, y)
      ctx.stroke()
    }

    // Draw vertical lines (step divisions)
    for (let i = 0; i <= steps.length; i++) {
      const x = KEYBOARD_WIDTH + i * CELL_WIDTH

      // Highlight beat divisions (assuming 4/4 time)
      if (i % 4 === 0) {
        ctx.strokeStyle = "#9ca3af"
        ctx.lineWidth = 1
      } else {
        ctx.strokeStyle = "#d1d5db"
        ctx.lineWidth = 0.5
      }

      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }

    // Draw step numbers
    ctx.fillStyle = "#374151"
    ctx.font = "12px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    for (let i = 0; i < steps.length; i++) {
      const x = KEYBOARD_WIDTH + i * CELL_WIDTH + CELL_WIDTH / 2
      ctx.fillText(`${i + 1}`, x, HEADER_HEIGHT / 2)
    }

    // Draw keyboard (note names)
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"

    for (let i = 0; i < noteRange; i++) {
      const noteNumber = maxNote - i
      const y = HEADER_HEIGHT + i * CELL_HEIGHT + CELL_HEIGHT / 2

      // Highlight C notes
      if (noteNumber % 12 === 0) {
        ctx.fillStyle = "#374151"
        ctx.font = "bold 10px sans-serif"
      } else {
        ctx.fillStyle = "#6b7280"
        ctx.font = "10px sans-serif"
      }

      ctx.fillText(midiToNoteName(noteNumber), KEYBOARD_WIDTH - 5, y)

      // Draw keyboard black/white keys
      const isBlackKey = [1, 3, 6, 8, 10].includes(noteNumber % 12)
      ctx.fillStyle = isBlackKey ? "#4b5563" : "#f9fafb"
      ctx.fillRect(5, y - CELL_HEIGHT / 2, 20, CELL_HEIGHT)
      ctx.strokeStyle = "#d1d5db"
      ctx.strokeRect(5, y - CELL_HEIGHT / 2, 20, CELL_HEIGHT)
    }
  }

  const drawNotes = (ctx: CanvasRenderingContext2D) => {
    // Assign colors to each instrument
    const colors = [
      { main: "#3b82f6", light: "#93c5fd" }, // blue
      { main: "#ef4444", light: "#fca5a5" }, // red
      { main: "#10b981", light: "#6ee7b7" }, // green
      { main: "#f59e0b", light: "#fcd34d" }, // amber
      { main: "#8b5cf6", light: "#c4b5fd" }, // purple
    ]

    // Draw notes for each instrument
    instruments.forEach((instrument, instrumentIndex) => {
      const color = colors[instrumentIndex % colors.length]

      // Determine if this instrument is focused or if no instrument is focused
      const isFocused = focusedInstrument === instrument.id || focusedInstrument === null
      const noteColor = isFocused ? color.main : color.light

      steps.forEach((step, stepIndex) => {
        const instrumentNotes = step[instrument.id]
        if (!instrumentNotes) return

        instrumentNotes.forEach((note) => {
          // Convert note to y position
          const noteNumber = note.midiNote
          const y = HEADER_HEIGHT + (maxNote - noteNumber) * CELL_HEIGHT
          const x = KEYBOARD_WIDTH + stepIndex * CELL_WIDTH

          // Draw note rectangle
          ctx.fillStyle = noteColor
          ctx.fillRect(x + 1, y + 1, CELL_WIDTH - 2, CELL_HEIGHT - 2)

          // Add border
          ctx.strokeStyle = isFocused ? color.main : color.light
          ctx.lineWidth = 1
          ctx.strokeRect(x + 1, y + 1, CELL_WIDTH - 2, CELL_HEIGHT - 2)

          // Draw tie indicator if note is tied
          if (note.isTiedToNext) {
            ctx.fillStyle = "#ffffff"
            ctx.beginPath()
            ctx.arc(x + CELL_WIDTH - 5, y + CELL_HEIGHT / 2, 2, 0, Math.PI * 2)
            ctx.fill()
          }
        })
      })
    })
  }

  return (
    <div className="overflow-auto border rounded-md" style={{ maxHeight: "500px" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: canvasWidth,
          height: canvasHeight,
        }}
      />
    </div>
  )
}

// Helper function to convert MIDI note number to note name
function midiToNoteName(midi: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const octave = Math.floor(midi / 12) - 1
  const note = noteNames[midi % 12]
  return `${note}${octave}`
}
