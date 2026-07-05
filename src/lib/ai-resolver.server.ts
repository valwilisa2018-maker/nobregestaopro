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

  const { data } = await supabase
    .from("ai_providers")
    .select("provider,api_key,model")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return fallback;
  const provider = (data.provider ?? "lovable").toLowerCase();
  const model = data.model || DEFAULT_MODEL;

  // Lovable native → use the gateway with the platform key.
  if (provider === "lovable") {
    return { endpoint: LOVABLE_GATEWAY, apiKey: lovableKey, model };
  }
  // OpenAI direct
  if (provider === "openai" && data.api_key) {
    return { endpoint: "https://api.openai.com/v1/chat/completions", apiKey: data.api_key, model: model.replace(/^openai\//, "") };
  }
  // Gemini / Anthropic and others → route through Lovable Gateway using the platform key.
  // (Model already carries the vendor prefix set in Configurações Globais.)
  return { endpoint: LOVABLE_GATEWAY, apiKey: lovableKey, model };
}
