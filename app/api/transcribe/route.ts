import { Mistral } from "@mistralai/mistralai";

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const language = (formData.get("language") as string) ?? "en";

    if (!audioFile) {
      return Response.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const content = new Uint8Array(arrayBuffer);

    const result = await mistral.audio.transcriptions.complete({
      model: "voxtral-mini-latest",
      file: {
        content,
        fileName: "recording.webm",
      },
      language,
    });

    return Response.json({ text: result.text });
  } catch (err) {
    console.error("[/api/transcribe] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
