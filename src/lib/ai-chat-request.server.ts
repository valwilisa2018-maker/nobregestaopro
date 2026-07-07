export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

type ChatCallParams = {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number | null;
  messages: ChatMessage[];
  timeoutMs?: number;
  maxAttempts?: number;
};

type ChatJson = {
  choices?: Array<{ message?: { content?: string; refusal?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string; code?: string; param?: string };
};

export function isReasoningModel(modelId: string) {
  return /(^|\/)(gpt-5|o1|o3|o4)/i.test(modelId);
}

export function normalizedMaxTokens(modelId: string, value?: number | null) {
  const n = Number(value ?? 2048);
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 2048;
  return isReasoningModel(modelId) ? Math.max(safe, 2048) : safe;
}

export function buildChatCompletionsBody(params: Pick<ChatCallParams, "model" | "temperature" | "maxTokens" | "messages">) {
  const max = normalizedMaxTokens(params.model, params.maxTokens);
  return {
    model: params.model,
    ...(isReasoningModel(params.model)
      ? { max_completion_tokens: max }
      : { temperature: Number(params.temperature ?? 0.7), max_tokens: max }),
    messages: params.messages,
  };
}

export async function callChatCompletions(params: ChatCallParams) {
  const body = JSON.stringify(buildChatCompletionsBody(params));
  const maxAttempts = Math.max(1, params.maxAttempts ?? 3);
  let res: Response | null = null;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs ?? 45_000);
    try {
      res = await fetch(params.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.apiKey}` },
        signal: controller.signal,
        body,
      });
      clearTimeout(timeoutId);
      if (res.ok || res.status < 500) break;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      clearTimeout(timeoutId);
      lastErr = e;
      const aborted = (e as { name?: string })?.name === "AbortError";
      if (!aborted && !(e instanceof TypeError)) throw e;
    }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 800 * attempt));
  }

  if (!res) {
    const aborted = (lastErr as { name?: string })?.name === "AbortError";
    throw new Error(aborted ? "Tempo esgotado ao chamar a IA." : "Falha de rede ao chamar a IA.");
  }

  const json = (await res.json().catch(() => ({}))) as ChatJson;
  return { res, json };
}

export function extractAssistantText(json: ChatJson) {
  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (text.trim()) return text;
  if (choice?.message?.refusal) return choice.message.refusal;
  if (choice?.finish_reason === "length") {
    return "A resposta foi cortada por limite de tokens. Aumente Max Tokens e tente novamente.";
  }
  return null;
}

export function chatErrorMessage(status: number, json: ChatJson) {
  if (status === 429) return "Limite de requisições atingido. Tente novamente em instantes.";
  if (status === 402) return "Créditos de IA esgotados.";
  const detail = json.error?.message ?? "erro upstream";
  return `Erro ${status}: ${detail.slice(0, 200)}`;
}