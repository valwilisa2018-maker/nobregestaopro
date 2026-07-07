import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  audioBase64: z.string().min(1),
  mime: z.string().optional(),
});

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY ?? "";
    if (!key) throw new Error("STT indisponível (LOVABLE_API_KEY ausente).");
    const bin = Buffer.from(data.audioBase64, "base64");
    const mime = data.mime || "audio/webm";
    const ext = mime.includes("mp3") ? "mp3" : mime.includes("wav") ? "wav" : mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
    const blob = new Blob([new Uint8Array(bin)], { type: mime });
    const fd = new FormData();
    fd.append("file", blob, `audio.${ext}`);
    fd.append("model", "openai/gpt-4o-mini-transcribe");
    const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`STT ${r.status}: ${t.slice(0, 200)}`);
    }
    const j = (await r.json().catch(() => null)) as { text?: string } | null;
    return { text: j?.text ?? "" };
  });