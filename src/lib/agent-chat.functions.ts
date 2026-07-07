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
    const { callChatCompletions, chatErrorMessage, extractAssistantText } = await import("./ai-chat-request.server");
    const { endpoint, apiKey, model: modelId } = await resolveAIConfig(context.supabase, context.userId);
    if (!apiKey) throw new Error("Nenhum provedor de IA ativo. Configure em Configurações Globais.");

    const bal = await checkAiBalance(context.supabase, context.userId);
    if (!bal.ok) throw new Error("Saldo de créditos de IA esgotado. Compre mais créditos para continuar.");

    const { res, json } = await callChatCompletions({
      endpoint,
      apiKey,
      model: modelId,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      messages: [
        ...(data.systemPrompt.trim() ? [{ role: "system", content: data.systemPrompt }] : []),
        ...data.messages,
      ],
    });

    if (!res.ok) {
      throw new Error(chatErrorMessage(res.status, json));
    }

    const text = extractAssistantText(json);
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