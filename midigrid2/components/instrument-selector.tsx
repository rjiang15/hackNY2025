"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import type { InstrumentType, InstrumentOption } from "@/lib/types"
import { useState } from "react"

interface InstrumentSelectorProps {
  instrument: InstrumentType
  onUpdate: (updates: Partial<InstrumentType>) => void
  onRemove: () => void
  canRemove: boolean
  instrumentOptions: InstrumentOption[]
}

export default function InstrumentSelector({
  instrument,
  onUpdate,
  onRemove,
  canRemove,
  instrumentOptions,
}: InstrumentSelectorProps) {
  const [isCustomName, setIsCustomName] = useState(false)

  const handlePresetChange = (preset: string) => {
    const selectedOption = instrumentOptions.find((option) => option.id === preset)
    if (selectedOption) {
      onUpdate({
        name: selectedOption.name,
        type: selectedOption.type,
        range: { ...selectedOption.range },
      })
      setIsCustomName(false)
    }
  }

  const handleRangeChange = (values: number[]) => {
    onUpdate({
      range: { min: values[0], max: values[1] },
    })
  }

  return (
    <div className="border rounded-md p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex-1 space-y-1">
          {isCustomName ? (
            <Input
              value={instrument.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="max-w-[200px]"
            />
          ) : (
            <div className="font-medium">{instrument.name}</div>
          )}
          <div className="text-sm text-muted-foreground">
            {instrument.type} ({midiToNoteName(instrument.range.min)} - {midiToNoteName(instrument.range.max)})
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={() => setIsCustomName(!isCustomName)}>
            {isCustomName ? "Done" : "Rename"}
          </Button>
          {canRemove && (
            <Button variant="outline" size="sm" onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Instrument Type</Label>
        <Select value={getPresetId(instrument, instrumentOptions)} onValueChange={handlePresetChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select instrument" />
          </SelectTrigger>
          <SelectContent>
            {instrumentOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label>Note Range</Label>
          <span className="text-sm text-muted-foreground">
            {midiToNoteName(instrument.range.min)} - {midiToNoteName(instrument.range.max)}
          </span>
        </div>
        <Slider
          min={21}
          max={108}
          step={1}
          value={[instrument.range.min, instrument.range.max]}
          onValueChange={handleRangeChange}
          className="my-4"
        />
      </div>
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

// Helper function to get preset ID based on instrument configuration
function getPresetId(instrument: InstrumentType, options: InstrumentOption[]): string {
  const match = options.find((option) => option.type === instrument.type && option.name === instrument.name)

  return match?.id || "custom"
}
