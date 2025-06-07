import { generateText } from "ai"
import { google } from "@ai-sdk/google"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    console.log("=== API route called ===")

    const { prompt, instruments, numSteps } = await request.json()
    console.log("Request data:", {
      promptLength: prompt?.length,
      instrumentsCount: instruments?.length,
      numSteps,
    })

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not found in environment variables")
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 })
    }

    console.log("Generating music with Gemini...")

    // Use the actual prompt from the client
    const result = await generateText({
      model: google("gemini-2.5-flash-preview-05-20"),
      prompt: prompt,
      temperature: 1.0,
    })

    console.log("Generated text length:", result.text.length)
    console.log("First 500 chars:", result.text.substring(0, 500))

    // Try to extract JSON from the response
    let musicData
    try {
      const text = result.text.trim()

      // Remove any markdown formatting
      let cleanText = text.replace(/```json\n?|\n?```/g, "").trim()

      // If the response starts with explanation text, try to find the JSON array
      const jsonStart = cleanText.indexOf("[")
      const jsonEnd = cleanText.lastIndexOf("]")

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanText = cleanText.substring(jsonStart, jsonEnd + 1)
        console.log("Extracted JSON portion:", cleanText.substring(0, 200) + "...")
      }

      musicData = JSON.parse(cleanText)
      console.log("Successfully parsed JSON, steps:", musicData.length)
    } catch (parseError) {
      console.error("JSON parsing error:", parseError)
      console.log("Raw response:", result.text)
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 })
    }

    return NextResponse.json({
      music: musicData,
      debug: {
        originalTextLength: result.text.length,
        parsedSteps: Array.isArray(musicData) ? musicData.length : 0,
        rawText: result.text.substring(0, 300) + "...",
      },
    })
  } catch (error) {
    console.error("Error in API route:", error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate music",
        details: error instanceof Error ? error.stack?.substring(0, 500) : String(error),
      },
      { status: 500 },
    )
  }
}
