import MusicGenerator from "@/components/music-generator"

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">AI Music Generator</h1>
      <MusicGenerator />
    </main>
  )
}
