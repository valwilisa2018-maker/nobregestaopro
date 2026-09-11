import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TranscribeInput = z.object({
  audio_base64: z.string().min(1),
  format: z.enum(["webm", "mp3", "wav", "m4a", "ogg"]).default("webm"),
});

/**
 * Transcribes a base64-encoded audio clip using the dedicated Lovable AI
 * speech-to-text endpoint. Kept for the organizer chat's short voice notes.
 * Returns plain text in Portuguese.
 */
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TranscribeInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const mimeByFormat = {
      webm: "audio/webm",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      ogg: "audio/ogg",
    } as const;
    const bytes = Uint8Array.from(atob(data.audio_base64), (character) => character.charCodeAt(0));
    if (bytes.byteLength < 2_048) throw new Error("O áudio está vazio ou é curto demais. Grave novamente.");

    const form = new FormData();
    form.append("model", "google/gemini-3.5-transcribe");
    form.append("file", new Blob([bytes], { type: mimeByFormat[data.format] }), `gravacao.${data.format}`);
    form.append("stream", "true");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI Gateway ${res.status}: ${body.slice(0, 300)}`);
    }
    const stream = await res.text();
    let text = "";
    for (const line of stream.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string; text?: string };
        if (event.type === "transcript.text.delta" && event.delta) text += event.delta;
        if (event.type === "transcript.text.done" && event.text) text = event.text;
      } catch {
        // Ignora linhas SSE incompletas ou metadados sem texto.
      }
    }
    return { text: text.trim() };
  });