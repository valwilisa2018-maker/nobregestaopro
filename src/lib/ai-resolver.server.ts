// Resolve the active AI provider configured in Configurações Globais (ai_providers)
// for a given user. Falls back to the native Lovable AI Gateway when nothing is
// configured or the "lovable" row is active.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedAI = {
  endpoint: string;
  apiKey: string;
  model: string;
};

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export async function resolveAIConfig(
  supabase: SupabaseClient,
  userId: string,
): Promise<ResolvedAI> {
  const lovableKey = process.env.LOVABLE_API_KEY ?? "";
  const fallback: ResolvedAI = { endpoint: LOVABLE_GATEWAY, apiKey: lovableKey, model: DEFAULT_MODEL };

  let { data } = await supabase
    .from("ai_providers")
    .select("provider,api_key,model")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Global fallback: use the active provider configured by any admin/master
  // account so every new user inherits the platform-wide AI key automatically.
  if (!data) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adminIds } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "master"]);
    const ids = (adminIds ?? []).map((r) => r.user_id);
    if (ids.length) {
      const { data: globalRow } = await supabaseAdmin
        .from("ai_providers")
        .select("provider,api_key,model")
        .in("user_id", ids)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (globalRow) data = globalRow;
    }
  }

  if (!data) return fallback;
  const provider = (data.provider ?? "lovable").toLowerCase();
  const rawModel = data.model || DEFAULT_MODEL;

  // Lovable native → use the gateway with the platform key.
  if (provider === "lovable") {
    return { endpoint: LOVABLE_GATEWAY, apiKey: lovableKey, model: rawModel };
  }
  // OpenAI direct (user's own key)
  if (provider === "openai" && data.api_key) {
    return { endpoint: "https://api.openai.com/v1/chat/completions", apiKey: data.api_key, model: rawModel.replace(/^openai\//, "") };
  }
  // Gemini / Anthropic → route through Lovable Gateway (OpenAI-compatible) using the platform key.
  // Ensure the model carries the vendor prefix the gateway expects.
  let model = rawModel;
  if (provider === "gemini" && !model.includes("/")) model = `google/${model}`;
  if (provider === "anthropic" && !model.includes("/")) model = `anthropic/${model}`;
  if (provider === "openai" && !model.includes("/")) model = `openai/${model}`;
  return { endpoint: LOVABLE_GATEWAY, apiKey: lovableKey, model };
}
