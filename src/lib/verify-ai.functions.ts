import { createServerFn } from "@tanstack/react-start";

type Provider = "openai" | "gemini" | "anthropic" | "lovable";

type Input = { provider: Provider; api_key: string; model?: string };

function isProvider(v: unknown): v is Provider {
  return v === "openai" || v === "gemini" || v === "anthropic" || v === "lovable";
}

export const verifyAIProvider = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): Input => {
    const o = (input ?? {}) as Record<string, unknown>;
    if (!isProvider(o.provider)) throw new Error("provider inválido");
    return {
      provider: o.provider,
      api_key: typeof o.api_key === "string" ? o.api_key : "",
      model: typeof o.model === "string" ? o.model : undefined,
    };
  })
  .handler(async ({ data }) => {
    const { provider, api_key } = data;
    try {
      if (provider === "lovable") {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return { ok: false, error: "LOVABLE_API_KEY não configurada" };
        return { ok: true, message: "Gateway Lovable ativo" };
      }
      if (!api_key) return { ok: false, error: "Informe a API Key" };

      if (provider === "openai") {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${api_key}` },
        });
        if (!r.ok) return { ok: false, error: `OpenAI ${r.status}: chave inválida` };
        return { ok: true, message: "Chave OpenAI verificada" };
      }
      if (provider === "gemini") {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(api_key)}`,
        );
        if (!r.ok) return { ok: false, error: `Gemini ${r.status}: chave inválida` };
        return { ok: true, message: "Chave Gemini verificada" };
      }
      if (provider === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": api_key, "anthropic-version": "2023-06-01" },
        });
        if (!r.ok) return { ok: false, error: `Anthropic ${r.status}: chave inválida` };
        return { ok: true, message: "Chave Anthropic verificada" };
      }
      return { ok: false, error: "Provedor não suportado" };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Falha na verificação" };
    }
  });
