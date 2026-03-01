import { elevenlabs } from "@ai-sdk/elevenlabs";
import { experimental_generateSpeech as generateSpeech } from "ai";

export async function POST(req: Request) {
  const { text } = await req.json();

  if (!text || typeof text !== "string") {
    return Response.json({ error: "No text provided" }, { status: 400 });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return Response.json(
      { error: "ElevenLabs API key not configured" },
      { status: 503 },
    );
  }

  try {
    const result = await generateSpeech({
      model: elevenlabs.speech("eleven_flash_v2_5"),
      text,
      voice: "21m00Tcm4TlvDq8ikWAM",
    });

    const audioData = result.audio.uint8Array;
    const buffer = Buffer.from(audioData);

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/speech] ElevenLabs error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
