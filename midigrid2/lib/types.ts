export interface InstrumentType {
  id: string
  name: string
  type: string
  range: {
    min: number
    max: number
  }
}

export interface InstrumentOption {
  id: string
  name: string
  type: string
  range: {
    min: number
    max: number
  }
}

export interface Note {
  fullNote: string // e.g., "C4"
  midiNote: number // MIDI note number
  isTiedFromPrevious: boolean
  isTiedToNext: boolean
}

export interface Step {
  [instrumentId: string]: Note[]
}
