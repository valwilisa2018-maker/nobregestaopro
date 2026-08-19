import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { transcribeAudioBase64 } from "@/lib/audio-transcription.server";

const Input = z.object({
  audioBase64: z.string().min(1),
  mime: z.string().optional(),
});

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await transcribeAudioBase64({
      supabase: supabaseAdmin,
      userId: context.userId,
      audioBase64: data.audioBase64,
      mime: data.mime,
    });
    if (!result.text && result.error) {
      const detail = result.status ? `STT ${result.status}` : "STT indisponivel";
      throw new Error(`${detail}: ${result.error}`);
    }
    return { text: result.text ?? "" };
  });
