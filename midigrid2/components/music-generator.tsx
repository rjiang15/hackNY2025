"use client"

import { useState, useEffect, useRef } from "react"
import * as Tone from "tone"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { generateMusic } from "@/lib/generate-music"
import InstrumentSelector from "./instrument-selector"
import PianoRoll from "./piano-roll"
import type { InstrumentType, Step } from "@/lib/types"
import { instrumentOptions } from "@/lib/instruments"

export default function MusicGenerator() {
  const [inspiration, setInspiration] = useState("")
  const [instruments, setInstruments] = useState<InstrumentType[]>([
    { id: "1", name: "Piano", type: "Synth", range: { min: 36, max: 84 } },
    { id: "2", name: "Bass", type: "MonoSynth", range: { min: 24, max: 48 } },
    { id: "3", name: "Violin", type: "FMSynth", range: { min: 55, max: 88 } },
    { id: "4", name: "Drums", type: "MembraneSynth", range: { min: 36, max: 60 } },
  ])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [tempo, setTempo] = useState(120)
  const [numSteps, setNumSteps] = useState(32)
  const [focusedInstrument, setFocusedInstrument] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const synthsRef = useRef<Record<string, Tone.PolySynth>>({})
  const sequenceRef = useRef<Tone.Sequence | null>(null)

  // Initialize synths when instruments change
  useEffect(() => {
    // Clean up previous synths
    Object.values(synthsRef.current).forEach((synth) => {
      synth.dispose()
    })

    // Create new synths for each instrument
    const newSynths: Record<string, any> = {}

    instruments.forEach((instrument) => {
      // Synths that work with PolySynth (extend Monophonic)
      const polySynthCompatible = ["Synth", "MonoSynth", "FMSynth", "AMSynth", "DuoSynth"]

      if (polySynthCompatible.includes(instrument.type)) {
        let synthType
        switch (instrument.type) {
          case "MonoSynth":
            synthType = Tone.MonoSynth
            break
          case "FMSynth":
            synthType = Tone.FMSynth
            break
          case "AMSynth":
            synthType = Tone.AMSynth
            break
          case "DuoSynth":
            synthType = Tone.DuoSynth
            break
          default:
            synthType = Tone.Synth
        }
        newSynths[instrument.id] = new Tone.PolySynth(synthType).toDestination()
      } else {
        // Synths that don't work with PolySynth - use directly
        switch (instrument.type) {
          case "MembraneSynth":
            newSynths[instrument.id] = new Tone.MembraneSynth().toDestination()
            break
          case "MetalSynth":
            newSynths[instrument.id] = new Tone.MetalSynth().toDestination()
            break
          case "PluckSynth":
            newSynths[instrument.id] = new Tone.PluckSynth().toDestination()
            break
          case "NoiseSynth":
            newSynths[instrument.id] = new Tone.NoiseSynth().toDestination()
            break
          default:
            newSynths[instrument.id] = new Tone.PolySynth(Tone.Synth).toDestination()
        }
      }
    })

    synthsRef.current = newSynths

    // Update Tone.js tempo
    Tone.Transport.bpm.value = tempo

    return () => {
      // Clean up synths when component unmounts
      Object.values(newSynths).forEach((synth) => {
        synth.dispose()
      })
    }
  }, [instruments, tempo])

  // Clean up sequence when component unmounts
  useEffect(() => {
    return () => {
      if (sequenceRef.current) {
        sequenceRef.current.dispose()
      }
      Tone.Transport.stop()
    }
  }, [])

  const handleGenerate = async () => {
    if (!inspiration.trim()) return

    setIsGenerating(true)
    setError(null)

    try {
      // Stop any playing sequence
      if (isPlaying) {
        handleStop()
      }

      const generatedSteps = await generateMusic(inspiration, instruments, numSteps)

      if (generatedSteps.length === 0) {
        setError("Failed to generate music. Please try again with a different inspiration.")
      } else {
        setSteps(generatedSteps)
      }
    } catch (error) {
      console.error("Error generating music:", error)
      setError(`Error: ${error instanceof Error ? error.message : "Failed to generate music"}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePlay = async () => {
    if (!steps.length) return

    // Initialize Tone.js if not already started
    if (Tone.context.state !== "running") {
      await Tone.start()
    }

    // Stop any existing sequence
    if (sequenceRef.current) {
      sequenceRef.current.dispose()
    }

    // Create a new sequence
    const sequence = new Tone.Sequence(
      (time, stepIndex) => {
        const step = steps[stepIndex]

        // Play notes for each instrument
        instruments.forEach((instrument) => {
          const instrumentNotes = step[instrument.id]
          if (!instrumentNotes || !instrumentNotes.length) return

          const synth = synthsRef.current[instrument.id]
          const polySynthCompatible = ["Synth", "MonoSynth", "FMSynth", "AMSynth", "DuoSynth"]

          if (polySynthCompatible.includes(instrument.type)) {
            // Use PolySynth methods
            const notesToPlay: string[] = []
            const noteDurations: string[] = []

            instrumentNotes.forEach((note) => {
              if (!note.isTiedFromPrevious) {
                notesToPlay.push(note.fullNote)

                if (note.isTiedToNext) {
                  let tieLength = 1
                  let nextStepIndex = stepIndex + 1

                  while (
                    nextStepIndex < steps.length &&
                    steps[nextStepIndex][instrument.id]?.some(
                      (n) => n.fullNote === note.fullNote && n.isTiedFromPrevious,
                    )
                  ) {
                    tieLength++
                    nextStepIndex++
                  }

                  noteDurations.push(`${tieLength}n`)
                } else {
                  noteDurations.push("8n")
                }
              }
            })

            if (notesToPlay.length) {
              synth.triggerAttackRelease(notesToPlay, noteDurations, time)
            }
          } else {
            // Use individual synth methods for non-PolySynth compatible synths
            instrumentNotes.forEach((note) => {
              if (!note.isTiedFromPrevious) {
                let duration = "8n"

                if (note.isTiedToNext) {
                  let tieLength = 1
                  let nextStepIndex = stepIndex + 1

                  while (
                    nextStepIndex < steps.length &&
                    steps[nextStepIndex][instrument.id]?.some(
                      (n) => n.fullNote === note.fullNote && n.isTiedFromPrevious,
                    )
                  ) {
                    tieLength++
                    nextStepIndex++
                  }

                  duration = `${tieLength}n`
                }

                // For drum-like synths, we might not need the note frequency
                if (instrument.type === "MembraneSynth" || instrument.type === "NoiseSynth") {
                  synth.triggerAttackRelease(duration, time)
                } else {
                  synth.triggerAttackRelease(note.fullNote, duration, time)
                }
              }
            })
          }
        })
      },
      Array.from({ length: steps.length }, (_, i) => i),
      "8n", // Eighth note subdivision
    )

    // Start the sequence
    sequence.start(0)
    sequenceRef.current = sequence

    Tone.Transport.start()
    setIsPlaying(true)
  }

  const handleStop = () => {
    Tone.Transport.stop()
    if (sequenceRef.current) {
      sequenceRef.current.stop()
    }
    setIsPlaying(false)
  }

  const handleAddInstrument = () => {
    if (instruments.length >= 5) return // Limit to 5 instruments

    const newId = String(Date.now())
    setInstruments([
      ...instruments,
      {
        id: newId,
        name: "New Instrument",
        type: "Synth",
        range: { min: 36, max: 84 },
      },
    ])
  }

  const handleRemoveInstrument = (id: string) => {
    if (instruments.length <= 1) return // Keep at least one instrument

    setInstruments(instruments.filter((inst) => inst.id !== id))

    // If focused instrument is removed, reset focus
    if (focusedInstrument === id) {
      setFocusedInstrument(null)
    }
  }

  const handleUpdateInstrument = (id: string, updates: Partial<InstrumentType>) => {
    setInstruments(instruments.map((inst) => (inst.id === id ? { ...inst, ...updates } : inst)))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="inspiration">Enter text to inspire your music</Label>
              <Textarea
                id="inspiration"
                placeholder="Enter text to inspire the music generation... (e.g., 'peaceful morning by the lake', 'epic battle scene', 'melancholic jazz in the rain')"
                value={inspiration}
                onChange={(e) => setInspiration(e.target.value)}
                className="h-24"
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Instruments</h3>
                <Button variant="outline" size="sm" onClick={handleAddInstrument} disabled={instruments.length >= 5}>
                  Add Instrument
                </Button>
              </div>

              {instruments.map((instrument) => (
                <InstrumentSelector
                  key={instrument.id}
                  instrument={instrument}
                  onUpdate={(updates) => handleUpdateInstrument(instrument.id, updates)}
                  onRemove={() => handleRemoveInstrument(instrument.id)}
                  canRemove={instruments.length > 1}
                  instrumentOptions={instrumentOptions}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tempo">Tempo: {tempo} BPM</Label>
                <Slider
                  id="tempo"
                  min={60}
                  max={200}
                  step={1}
                  value={[tempo]}
                  onValueChange={(value) => setTempo(value[0])}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="steps">
                  Length: {numSteps} steps ({Math.round((numSteps / 8) * 10) / 10} bars)
                </Label>
                <Slider
                  id="steps"
                  min={8}
                  max={256}
                  step={8}
                  value={[numSteps]}
                  onValueChange={(value) => setNumSteps(value[0])}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">{error}</div>
            )}

            <div className="flex space-x-2">
              <Button onClick={handleGenerate} disabled={isGenerating || !inspiration.trim()} className="flex-1">
                {isGenerating ? "Generating..." : "Generate Music"}
              </Button>

              <Button
                onClick={isPlaying ? handleStop : handlePlay}
                disabled={!steps.length || isGenerating}
                variant={isPlaying ? "destructive" : "default"}
                className="flex-1"
              >
                {isPlaying ? "Stop" : "Play"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {steps.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Piano Roll ({steps.length} steps)</h3>
                <div className="flex space-x-2">
                  {instruments.map((instrument) => (
                    <Button
                      key={instrument.id}
                      variant={focusedInstrument === instrument.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFocusedInstrument(focusedInstrument === instrument.id ? null : instrument.id)}
                    >
                      {instrument.name}
                    </Button>
                  ))}
                </div>
              </div>

              <PianoRoll steps={steps} instruments={instruments} focusedInstrument={focusedInstrument} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
