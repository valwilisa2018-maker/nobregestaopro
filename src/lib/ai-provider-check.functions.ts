import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkActiveAIProvider = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAIConfig } = await import("./ai-resolver.server");
    const { apiKey, model } = await resolveAIConfig(context.supabase, context.userId);
    const provider = model.includes("/") ? model.split("/")[0] : "lovable";
    return { ok: !!apiKey, provider, model };
  });