import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  provider: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().positive().max(8192),
  systemPrompt: z.string(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  providerId: z.string().uuid().nullable().optional(),
});

const PROVIDER_PREFIX: Record<string, string> = {
  gemini: "google/",
  openai: "openai/",
  deepseek: "openai/",
  grok: "openai/",
};

export const chatWithAgent = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    let endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let apiKey = process.env.LOVABLE_API_KEY ?? "";
    const prefix = PROVIDER_PREFIX[data.provider.toLowerCase()] ?? "google/";
    let modelId = data.model.includes("/") ? data.model : `${prefix}${data.model}`;

    if (data.providerId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: p, error } = await supabaseAdmin
        .from("ai_providers")
        .select("api_key, base_url, model, provider")
        .eq("id", data.providerId)
        .maybeSingle();
      if (error || !p) throw new Error("Provedor não encontrado");
      apiKey = p.api_key ?? "";
      if (p.base_url) endpoint = p.base_url.replace(/\/+$/, "") + "/chat/completions";
      // Custom providers use raw model id (no gateway prefix)
      modelId = data.model || p.model || modelId;
    }

    if (!apiKey) throw new Error("Chave de API não configurada");

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        temperature: data.temperature,
        max_tokens: data.maxTokens,
        messages: [
          ...(data.systemPrompt.trim() ? [{ role: "system", content: data.systemPrompt }] : []),
          ...data.messages,
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Erro ${res.status}: ${t.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    return { text };
  });