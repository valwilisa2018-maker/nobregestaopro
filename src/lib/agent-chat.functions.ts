import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  provider: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().positive().max(8192),
  systemPrompt: z.string(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
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
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const prefix = PROVIDER_PREFIX[data.provider.toLowerCase()] ?? "google/";
    const modelId = data.model.includes("/") ? data.model : `${prefix}${data.model}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
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