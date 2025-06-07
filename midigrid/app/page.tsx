import MidiGrid from "@/components/midi-grid"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-8">
      <div className="w-full max-w-5xl">
        <h1 className="text-3xl font-bold mb-4">MIDI Grid Generator</h1>
        <p className="text-muted-foreground mb-8">
          Generate MIDI patterns with AI, visualize them on a grid, and evolve them using Game of Life rules.
        </p>
        <MidiGrid />
      </div>
    </main>
  )
}
