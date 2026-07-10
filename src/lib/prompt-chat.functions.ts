import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MASTER_PROMPT_CONTENT } from "@/lib/master-prompt";

const Msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const Input = z.object({
  messages: z.array(Msg).min(1).max(60),
});

export const promptChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.6,
        messages: [
          { role: "system", content: MASTER_PROMPT_CONTENT },
          ...data.messages,
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      if (r.status === 429) throw new Error("Limite de uso atingido. Tente novamente em instantes.");
      if (r.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`IA ${r.status}: ${t.slice(0, 200)}`);
    }
    const j = (await r.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const text = j?.choices?.[0]?.message?.content ?? "";
    return { text };
  });