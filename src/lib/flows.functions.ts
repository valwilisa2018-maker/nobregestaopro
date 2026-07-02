import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `Você é um especialista em criação de fluxos conversacionais para WhatsApp (estilo BotConversa, ManyChat, Typebot).
Transforme a solicitação do usuário em um fluxo COMPLETO, PRONTO PARA USO, com todos os blocos já conectados e com mensagens de exemplo escritas em português — o cliente só precisará editar os textos.

RESPONDA APENAS COM JSON VÁLIDO (sem markdown, sem comentários) no formato:
{
  "name": "string curta",
  "description": "string",
  "trigger": "palavra-chave curta que aciona o fluxo",
  "variables": ["nome","telefone","email"],
  "nodes": [
    {
      "id": "n1",
      "name": "Rótulo curto do bloco",
      "type": "START|MESSAGE|QUESTION|YESNO|IMAGE|VIDEO|AUDIO|WAIT|TYPING|RECORDING|CONDITION|CAPTURE_NAME|TAGS|SCHEDULE|BROADCAST|WEBHOOK|HANDOFF|END",
      "message": "texto de exemplo já escrito, natural, com emojis quando fizer sentido",
      "variable": "nome_da_variavel",
      "seconds": 3,
      "condition": "expressão (para CONDITION)",
      "next": "id_do_proximo",
      "branches": { "sim": "n5", "nao": "n7" }
    }
  ]
}

REGRAS OBRIGATÓRIAS:
- Gere de 6 a 14 blocos, com fluxo lógico do início ao fim.
- SEMPRE 1 nó START e pelo menos 1 END.
- TODO bloco (exceto END) deve ter "next" preenchido, OU "branches" se for YESNO/CONDITION.
- Blocos YESNO precisam de branches { "sim": "id", "nao": "id" }.
- Toda MESSAGE/QUESTION/IMAGE/VIDEO/AUDIO deve ter "message" com texto de exemplo real (não deixar em branco).
- Intercale TYPING (2-3s) antes de mensagens longas para parecer natural.
- Inclua pelo menos 1 CAPTURE_NAME e 1 QUESTION quando fizer sentido coletar dados.
- Ids sequenciais n1, n2, n3...
- Nunca escreva nada fora do JSON.`;

const Input = z.object({ prompt: z.string().min(3).max(4000) });

export const generateFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: data.prompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Limite de IA atingido. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Erro ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    try { JSON.parse(raw); } catch { throw new Error("Resposta inválida da IA"); }
    return { flowJson: raw };
  });

const SaveInput = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  trigger: z.string().optional().nullable(),
  definition: z.record(z.string(), z.any()),
  is_active: z.boolean().optional(),
});

export const saveFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveInput.parse(raw))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      name: data.name,
      description: data.description ?? null,
      trigger: data.trigger ?? null,
      definition: data.definition,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase.from("flows").update(payload).eq("id", data.id).eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("flows").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const listFlows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("flows")
      .select("id,name,description,trigger,is_active,definition,updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { flows: data ?? [] };
  });

export const deleteFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("flows").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });