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

export const activateLovableProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!process.env.LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada no servidor");
    }
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("ai_providers")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "lovable")
      .maybeSingle();

    const payload = {
      user_id: userId,
      name: "Lovable AI",
      provider: "lovable",
      api_key: "",
      model: "google/gemini-2.5-flash",
      is_active: true,
    };

    // Desativa outros provedores para evitar ambiguidade
    await supabase.from("ai_providers").update({ is_active: false }).eq("user_id", userId);

    if (existing) {
      const { error } = await supabase
        .from("ai_providers")
        .update({ is_active: true, model: payload.model })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("ai_providers").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true, provider: "lovable", model: payload.model };
  });
