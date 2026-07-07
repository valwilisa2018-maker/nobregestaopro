import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().positive().max(8192),
  systemPrompt: z.string(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

export const chatWithAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const { resolveAIConfig } = await import("./ai-resolver.server");
    const { checkAiBalance, consumeAiTokens, InsufficientCreditsError } = await import("./ai-credits.server");
    const { endpoint, apiKey, model: modelId } = await resolveAIConfig(context.supabase, context.userId);
    if (!apiKey) throw new Error("Nenhum provedor de IA ativo. Configure em Configurações Globais.");

    const bal = await checkAiBalance(context.supabase, context.userId);
    if (!bal.ok) throw new Error("Saldo de créditos de IA esgotado. Compre mais créditos para continuar.");

    const isGpt5 = /(^|\/)(gpt-5|o1|o3|o4)/i.test(modelId);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelId,
          ...(isGpt5
            ? { max_completion_tokens: data.maxTokens }
            : { temperature: data.temperature, max_tokens: data.maxTokens }),
          messages: [
            ...(data.systemPrompt.trim() ? [{ role: "system", content: data.systemPrompt }] : []),
            ...data.messages,
          ],
        }),
      });
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") {
        throw new Error("Tempo esgotado ao chamar a IA (45s). Tente novamente.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Erro ${res.status}: ${t.slice(0, 200)}`);
    }

    const json = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
      choices_finish_reason?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const finish = (json.choices?.[0] as { finish_reason?: string } | undefined)?.finish_reason;
    let text = json.choices?.[0]?.message?.content ?? "";
    if (!text && finish === "length") {
      text = "(A resposta foi cortada por limite de tokens. Aumente Max Tokens.)";
    }
    try {
      await consumeAiTokens(context.supabase, {
        userId: context.userId,
        agentId: null,
        model: modelId,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) {
        throw new Error("Saldo insuficiente para debitar o consumo. Compre mais créditos.");
      }
      throw e;
    }
    return { text };
  });