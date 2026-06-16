import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TranscribeInput = z.object({
  audio_base64: z.string().min(1),
  format: z.enum(["webm", "mp3", "wav", "m4a", "ogg"]).default("webm"),
});

/**
 * Transcribes a base64-encoded audio clip using the Lovable AI Gateway
 * (google/gemini-2.5-flash supports audio inputs).
 * Returns plain text in Portuguese.
 */
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TranscribeInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você transcreve áudios em português brasileiro. Responda APENAS com a transcrição literal, sem comentários, sem aspas, sem prefixos. Se não houver fala clara, responda com uma string vazia.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva este áudio:" },
              {
                type: "input_audio",
                input_audio: { data: data.audio_base64, format: data.format },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI Gateway ${res.status}: ${body.slice(0, 300)}`);
    }
    const json: any = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    return { text: typeof text === "string" ? text.trim() : "" };
  });