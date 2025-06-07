"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import * as Tone from "tone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Play, Pause, SkipForward, SkipBack, Wand2, ZoomIn, ZoomOut } from "lucide-react"
import { generateMidiFromPrompt } from "@/lib/gemini"
import { applyGameOfLife, createEmptyGrid } from "@/lib/grid-utils"

// Define types
type GridCell = {
  active: boolean
  note: string
  velocity: number
}

type CustomRuleFunction = (grid: GridCell[][], x: number, y: number) => boolean

// 3 octaves of notes from C3 to C6
const NOTES = [
  "C6",
  "B5",
  "A#5",
  "A5",
  "G#5",
  "G5",
  "F#5",
  "F5",
  "E5",
  "D#5",
  "D5",
  "C#5",
  "C5",
  "B4",
  "A#4",
  "A4",
  "G#4",
  "G4",
  "F#4",
  "F4",
  "E4",
  "D#4",
  "D4",
  "C#4",
  "C4",
  "B3",
  "A#3",
  "A3",
  "G#3",
  "G3",
  "F#3",
  "F3",
  "E3",
  "D#3",
  "D3",
  "C#3",
  "C3",
]

const GRID_COLS = 160 // 10 times longer
const GRID_ROWS = NOTES.length

// Define instrument types
type InstrumentType = "piano" | "bass" | "drums"

const INSTRUMENTS: { name: string; type: InstrumentType; color: string }[] = [
  { name: "Piano", type: "piano", color: "#2563eb" },
  { name: "Bass", type: "bass", color: "#dc2626" },
  { name: "Drums", type: "drums", color: "#16a34a" },
]

export default function MidiGrid() {
  const [grids, setGrids] = useState<{ [key in InstrumentType]: GridCell[][] }>({
    piano: createEmptyGrid(GRID_ROWS, GRID_COLS, NOTES),
    bass: createEmptyGrid(GRID_ROWS, GRID_COLS, NOTES),
    drums: createEmptyGrid(GRID_ROWS, GRID_COLS, NOTES),
  })
  const [activeInstrument, setActiveInstrument] = useState<InstrumentType>("piano")
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [prompt, setPrompt] = useState("")
  const [bpm, setBpm] = useState(120)
  const [useGameOfLife, setUseGameOfLife] = useState(true)
  const [customRuleCode, setCustomRuleCode] = useState(
    `// Return true if cell should be active, false otherwise
function customRule(grid, x, y) {
  const cell = grid[y][x];
  const neighbors = countNeighbors(grid, x, y);
  
  // Default Game of Life rules
  if (cell.active) {
    return neighbors === 2 || neighbors === 3;
  } else {
    return neighbors === 3;
  }
}

// Helper function to count active neighbors
function countNeighbors(grid, x, y) {
  let count = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      
      const newY = (y + i + grid.length) % grid.length;
      const newX = (x + j + grid[0].length) % grid[0].length;
      
      if (grid[newY][newX].active) count++;
    }
  }
  return count;
}`,
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState("")
  const [evolutionMode, setEvolutionMode] = useState<"cycle" | "step" | "manual">("manual")
  const [zoom, setZoom] = useState(1)
  const [scrollX, setScrollX] = useState(0)
  const [scrollY, setScrollY] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const customRuleFunction = useRef<CustomRuleFunction | null>(null)
  const synths = useRef<{ [key in InstrumentType]: Tone.Synth | Tone.PolySynth | Tone.MonoSynth | Tone.NoiseSynth | null }>({
    piano: null,
    bass: null,
    drums: null,
  })
  const stepInterval = useRef<NodeJS.Timeout | null>(null)

  // Initialize Tone.js instruments
  useEffect(() => {
    // Piano - rich polyphonic sound
    synths.current.piano = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.3, release: 1 },
    }).toDestination()

    // Bass - deeper monophonic sound
    synths.current.bass = new Tone.MonoSynth({
      oscillator: { type: "square" },
      envelope: { attack: 0.02, decay: 0.8, sustain: 0.4, release: 1.4 },
      filter: { Q: 2, frequency: 400, rolloff: -24 },
      filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 1, release: 0.7, baseFrequency: 50, octaves: 4.4 },
    }).toDestination()

    // Drums - noise-based percussive sounds
    synths.current.drums = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
    }).toDestination()

    return () => {
      Object.values(synths.current).forEach((synth) => {
        if (synth) {
          synth.dispose()
        }
      })
      if (stepInterval.current) {
        clearInterval(stepInterval.current)
      }
    }
  }, [])

  // Update BPM
  useEffect(() => {
    Tone.Transport.bpm.value = bpm
  }, [bpm])

  // Handle play/pause
  useEffect(() => {
    if (isPlaying) {
      const intervalTime = ((60 / bpm) * 1000) / 4 // 16th notes

      stepInterval.current = setInterval(() => {
        setCurrentStep((prev) => {
          const nextStep = (prev + 1) % GRID_COLS

          // Play active notes at this step for all instruments
          Object.entries(grids).forEach(([instrumentType, grid]) => {
            const instrument = instrumentType as InstrumentType
            const synth = synths.current[instrument]

            grid.forEach((row, rowIndex) => {
              if (row[prev].active && synth) {
                if (instrument === "drums") {
                  // For drums, trigger noise with different frequencies for different "drums"
                  const frequency = 100 + (GRID_ROWS - rowIndex) * 20 // Higher notes = higher frequency
                    ; (synth as Tone.NoiseSynth).triggerAttackRelease("16n")
                } else {
                  // For piano and bass, play the actual note
                  if ("triggerAttackRelease" in synth) {
                    synth.triggerAttackRelease(row[prev].note, "16n", undefined, row[prev].velocity / 127)
                  }
                }
              }
            })
          })

          // Auto-scroll to follow the current step
          const canvas = canvasRef.current
          if (canvas) {
            const cellWidth = (canvas.width * zoom) / GRID_COLS
            const stepPosition = prev * cellWidth
            const containerWidth = containerRef.current?.clientWidth || 800

            if (stepPosition < scrollX || stepPosition > scrollX + containerWidth - 100) {
              setScrollX(Math.max(0, stepPosition - containerWidth / 2))
            }
          }

          // Apply Game of Life or custom rule based on evolution mode
          if (evolutionMode === "step" || (evolutionMode === "cycle" && nextStep === 0)) {
            setGrids((prevGrids) => {
              const newGrids = { ...prevGrids }
              Object.keys(newGrids).forEach((instrumentType) => {
                const instrument = instrumentType as InstrumentType
                if (useGameOfLife) {
                  newGrids[instrument] = applyGameOfLife(prevGrids[instrument])
                } else if (customRuleFunction.current) {
                  newGrids[instrument] = applyCustomRule(prevGrids[instrument], customRuleFunction.current)
                }
              })
              return newGrids
            })
          }

          return nextStep
        })
      }, intervalTime)

      return () => {
        if (stepInterval.current) {
          clearInterval(stepInterval.current)
        }
      }
    }
  }, [isPlaying, grids, bpm, useGameOfLife, evolutionMode, zoom, scrollX])

  // Draw grid on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size based on zoom
    const baseWidth = 1600 // Base width for full grid
    const baseHeight = 800 // Base height for full grid
    canvas.width = baseWidth * zoom
    canvas.height = baseHeight * zoom

    const cellWidth = canvas.width / GRID_COLS
    const cellHeight = canvas.height / GRID_ROWS

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Only draw visible cells for performance
    const startCol = Math.max(0, Math.floor(scrollX / cellWidth) - 5)
    const endCol = Math.min(
      GRID_COLS,
      Math.ceil((scrollX + (containerRef.current?.clientWidth || 800)) / cellWidth) + 5,
    )

    const startRow = Math.max(0, Math.floor(scrollY / cellHeight) - 2)
    const endRow = Math.min(
      GRID_ROWS,
      Math.ceil((scrollY + (containerRef.current?.clientHeight || 384)) / cellHeight) + 2,
    )

    // Get current grid and instrument color
    const currentGrid = grids[activeInstrument]
    const instrumentColor = INSTRUMENTS.find(inst => inst.type === activeInstrument)?.color || "#2563eb"

    // Draw grid
    for (let y = startRow; y < endRow; y++) {
      for (let x = startCol; x < endCol; x++) {
        const cell = currentGrid[y][x]

        // Draw cell background
        ctx.fillStyle = cell.active ? instrumentColor : "#f8fafc"
        ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight)

        // Draw cell border (only if zoomed in enough)
        if (cellWidth > 3) {
          ctx.strokeStyle = "#e2e8f0"
          ctx.lineWidth = 0.5
          ctx.strokeRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight)
        }
      }
    }

    // Highlight current step
    if (currentStep >= startCol && currentStep < endCol) {
      ctx.fillStyle = "rgba(37, 99, 235, 0.3)"
      ctx.fillRect(currentStep * cellWidth, 0, cellWidth, canvas.height)
    }

    // Draw octave separators
    ctx.strokeStyle = "#94a3b8"
    ctx.lineWidth = 2
    for (let i = 12; i < GRID_ROWS; i += 12) {
      if (i >= startRow && i <= endRow) {
        ctx.beginPath()
        ctx.moveTo(startCol * cellWidth, i * cellHeight)
        ctx.lineTo(endCol * cellWidth, i * cellHeight)
        ctx.stroke()
      }
    }
  }, [grids, currentStep, zoom, scrollX, scrollY])

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const cellWidth = canvas.width / GRID_COLS
    const cellHeight = canvas.height / GRID_ROWS

    const x = Math.floor((e.clientX - rect.left + scrollX) / cellWidth)
    const y = Math.floor((e.clientY - rect.top + scrollY) / cellHeight)

    if (x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS) {
      setGrids((prevGrids) => {
        const newGrids = { ...prevGrids }
        const currentGrid = [...newGrids[activeInstrument]]
        currentGrid[y] = [...currentGrid[y]]
        currentGrid[y][x] = {
          ...currentGrid[y][x],
          active: !currentGrid[y][x].active,
          velocity: 100,
        }
        newGrids[activeInstrument] = currentGrid
        return newGrids
      })

      // Play the note when clicked
      const currentGrid = grids[activeInstrument]
      if (!currentGrid[y][x].active) {
        const synth = synths.current[activeInstrument]
        if (synth) {
          if (activeInstrument === "drums") {
            ; (synth as Tone.NoiseSynth).triggerAttackRelease("16n")
          } else if ("triggerAttackRelease" in synth) {
            synth.triggerAttackRelease(NOTES[y], "16n")
          }
        }
      }
    }
  }

  // Apply custom rule to grid
  const applyCustomRule = (grid: GridCell[][], ruleFunction: CustomRuleFunction) => {
    const newGrid = createEmptyGrid(GRID_ROWS, GRID_COLS, NOTES)

    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const shouldBeActive = ruleFunction(grid, x, y)
        newGrid[y][x] = {
          ...grid[y][x],
          active: shouldBeActive,
        }
      }
    }

    return newGrid
  }

  // Update custom rule function
  const updateCustomRuleFunction = () => {
    try {
      const functionBody = `
        ${customRuleCode}
        return customRule(grid, x, y);
      `
      customRuleFunction.current = new Function("grid", "x", "y", functionBody) as CustomRuleFunction
      setError("")
    } catch (err) {
      setError("Error in custom rule code: " + (err as Error).message)
      customRuleFunction.current = null
    }
  }

  // Generate MIDI from prompt
  const generateFromPrompt = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)
    try {
      const generatedGrid = await generateMidiFromPrompt(prompt, GRID_ROWS, GRID_COLS, NOTES)
      setGrids((prevGrids) => ({
        ...prevGrids,
        [activeInstrument]: generatedGrid,
      }))
    } catch (err) {
      setError("Failed to generate MIDI: " + (err as Error).message)
    } finally {
      setIsGenerating(false)
    }
  }

  // Step forward one step
  const stepForward = () => {
    setCurrentStep((prev) => {
      const nextStep = (prev + 1) % GRID_COLS

      // Play active notes at this step for all instruments
      Object.entries(grids).forEach(([instrumentType, grid]) => {
        const instrument = instrumentType as InstrumentType
        const synth = synths.current[instrument]

        grid.forEach((row, rowIndex) => {
          if (row[prev].active && synth) {
            if (instrument === "drums") {
              ; (synth as Tone.NoiseSynth).triggerAttackRelease("16n")
            } else if ("triggerAttackRelease" in synth) {
              synth.triggerAttackRelease(row[prev].note, "16n", undefined, row[prev].velocity / 127)
            }
          }
        })
      })

      // Apply Game of Life or custom rule based on evolution mode
      if (evolutionMode === "step" || (evolutionMode === "cycle" && nextStep === 0)) {
        setGrids((prevGrids) => {
          const newGrids = { ...prevGrids }
          Object.keys(newGrids).forEach((instrumentType) => {
            const instrument = instrumentType as InstrumentType
            if (useGameOfLife) {
              newGrids[instrument] = applyGameOfLife(prevGrids[instrument])
            } else if (customRuleFunction.current) {
              newGrids[instrument] = applyCustomRule(prevGrids[instrument], customRuleFunction.current)
            }
          })
          return newGrids
        })
      }

      return nextStep
    })
  }

  // Rewind to beginning
  const rewind = () => {
    setCurrentStep(0)
  }

  // Manually evolve the grid
  const evolveGrid = () => {
    setGrids((prevGrids) => {
      const newGrids = { ...prevGrids }
      Object.keys(newGrids).forEach((instrumentType) => {
        const instrument = instrumentType as InstrumentType
        if (useGameOfLife) {
          newGrids[instrument] = applyGameOfLife(prevGrids[instrument])
        } else if (customRuleFunction.current) {
          newGrids[instrument] = applyCustomRule(prevGrids[instrument], customRuleFunction.current)
        }
      })
      return newGrids
    })
  }

  // Clear grid
  const clearGrid = () => {
    setGrids({
      piano: createEmptyGrid(GRID_ROWS, GRID_COLS, NOTES),
      bass: createEmptyGrid(GRID_ROWS, GRID_COLS, NOTES),
      drums: createEmptyGrid(GRID_ROWS, GRID_COLS, NOTES),
    })
    setCurrentStep(0)
    setScrollX(0)
    setScrollY(0)
  }

  // Clear current instrument grid only
  const clearCurrentGrid = () => {
    setGrids((prevGrids) => ({
      ...prevGrids,
      [activeInstrument]: createEmptyGrid(GRID_ROWS, GRID_COLS, NOTES),
    }))
  }

  // Handle scroll
  const handleScroll = (e: React.WheelEvent) => {
    e.preventDefault()

    if (e.shiftKey) {
      // Horizontal scroll when holding Shift
      const delta = e.deltaY
      const maxScrollX = Math.max(0, (canvasRef.current?.width || 0) - (containerRef.current?.clientWidth || 800))
      setScrollX((prev) => Math.max(0, Math.min(maxScrollX, prev + delta)))
    } else {
      // Vertical scroll by default
      const delta = e.deltaY
      const maxScrollY = Math.max(0, (canvasRef.current?.height || 0) - (containerRef.current?.clientHeight || 384))
      setScrollY((prev) => Math.max(0, Math.min(maxScrollY, prev + delta)))
    }

    // Handle horizontal scroll wheel (trackpad)
    if (e.deltaX !== 0) {
      const maxScrollX = Math.max(0, (canvasRef.current?.width || 0) - (containerRef.current?.clientWidth || 800))
      setScrollX((prev) => Math.max(0, Math.min(maxScrollX, prev + e.deltaX)))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="mb-4">
          <Label htmlFor="prompt">Generate MIDI with AI (3 octaves, 160 steps)</Label>
          <div className="flex mt-1.5">
            <Input
              id="prompt"
              placeholder={`Describe the ${activeInstrument} pattern you want...`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="rounded-r-none"
            />
            <Button onClick={generateFromPrompt} disabled={isGenerating || !prompt.trim()} className="rounded-l-none">
              {isGenerating ? "Generating..." : <Wand2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Instrument Selection */}
        <div className="mb-4">
          <Label className="mb-2 block">Active Instrument</Label>
          <div className="flex gap-2">
            {INSTRUMENTS.map((instrument) => (
              <Button
                key={instrument.type}
                variant={activeInstrument === instrument.type ? "default" : "outline"}
                onClick={() => setActiveInstrument(instrument.type)}
                className="flex items-center gap-2"
                style={{
                  backgroundColor: activeInstrument === instrument.type ? instrument.color : undefined,
                  borderColor: instrument.color,
                }}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: instrument.color }}
                />
                {instrument.name}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Currently editing: <strong style={{ color: INSTRUMENTS.find(i => i.type === activeInstrument)?.color }}>
              {INSTRUMENTS.find(i => i.type === activeInstrument)?.name}
            </strong> - All instruments play simultaneously
          </p>
        </div>

        <div className="border rounded-lg p-4 bg-background">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => setZoom(Math.max(0.1, zoom - 0.2))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
              <Button size="icon" variant="outline" onClick={() => setZoom(Math.min(3, zoom + 0.2))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              Step {currentStep + 1} / {GRID_COLS} | Scroll: vertical (mouse wheel), horizontal (Shift + wheel)
            </div>
          </div>

          <div ref={containerRef} className="relative overflow-hidden border rounded h-96" onWheel={handleScroll}>
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className="cursor-pointer"
              style={{
                transform: `translate(-${scrollX}px, -${scrollY}px)`,
                imageRendering: "pixelated",
              }}
            />
          </div>

          <div className="flex flex-col gap-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" onClick={rewind} disabled={isPlaying}>
                  <SkipBack className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => setIsPlaying(!isPlaying)}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="outline" onClick={stepForward} disabled={isPlaying}>
                  <SkipForward className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={clearCurrentGrid} className="ml-2">
                  Clear {INSTRUMENTS.find(i => i.type === activeInstrument)?.name}
                </Button>
                <Button variant="outline" onClick={clearGrid} className="ml-1">
                  Clear All
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm">BPM:</span>
                <Slider
                  value={[bpm]}
                  min={60}
                  max={240}
                  step={1}
                  onValueChange={(value) => setBpm(value[0])}
                  className="w-32"
                />
                <span className="text-sm w-8">{bpm}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Evolution:</Label>
                <select
                  value={evolutionMode}
                  onChange={(e) => setEvolutionMode(e.target.value as "cycle" | "step" | "manual")}
                  className="border rounded px-2 py-1 text-sm"
                  aria-label="Evolution mode"
                >
                  <option value="cycle">On Cycle</option>
                  <option value="step">Every Step</option>
                  <option value="manual">Manual</option>
                </select>
                {evolutionMode === "manual" && (
                  <Button variant="outline" onClick={evolveGrid} className="ml-2">
                    Evolve
                  </Button>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                {evolutionMode === "cycle" && "Grid evolves after each complete cycle (160 steps)"}
                {evolutionMode === "step" && "Grid evolves on every step"}
                {evolutionMode === "manual" && "Grid evolves only when you click Evolve"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="gameOfLife">
        <TabsList>
          <TabsTrigger value="gameOfLife">Evolution Rules</TabsTrigger>
          <TabsTrigger value="customRule">Custom Rule</TabsTrigger>
        </TabsList>
        <TabsContent value="gameOfLife" className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch id="use-game-of-life" checked={useGameOfLife} onCheckedChange={setUseGameOfLife} />
            <Label htmlFor="use-game-of-life">Use Game of Life Rules</Label>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>
              Conway&apos;s Game of Life rules applied to a {GRID_ROWS}×{GRID_COLS} musical grid:
            </p>
            <ul className="list-disc pl-5 mt-2">
              <li>Any live cell with fewer than two live neighbors dies (underpopulation)</li>
              <li>Any live cell with two or three live neighbors lives on</li>
              <li>Any live cell with more than three live neighbors dies (overpopulation)</li>
              <li>Any dead cell with exactly three live neighbors becomes a live cell (reproduction)</li>
            </ul>
            <p className="mt-2">Note: Octave separators are shown as horizontal lines every 12 notes.</p>
          </div>
        </TabsContent>
        <TabsContent value="customRule" className="space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Switch
              id="use-custom-rule"
              checked={!useGameOfLife}
              onCheckedChange={(checked) => setUseGameOfLife(!checked)}
            />
            <Label htmlFor="use-custom-rule">Use Custom Rule</Label>
          </div>
          <Textarea
            value={customRuleCode}
            onChange={(e) => setCustomRuleCode(e.target.value)}
            className="font-mono text-sm h-64"
          />
          <div className="flex justify-between">
            <Button onClick={updateCustomRuleFunction}>Update Rule</Button>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
