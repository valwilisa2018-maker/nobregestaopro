import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `Você é um especialista em criação de fluxos conversacionais para WhatsApp, Telegram, Instagram, Messenger, Web Chat e SMS.
Transforme a solicitação do usuário em um fluxo de chatbot pronto para ser desenhado (estilo BotConversa, ManyChat, Typebot).

RESPONDA APENAS COM JSON VÁLIDO no formato:
{
  "name": "string curta",
  "description": "string",
  "trigger": "palavra-chave | webhook | qrcode | campanha | evento",
  "variables": ["nome","telefone","email"],
  "nodes": [
    {
      "id": "n1",
      "name": "Boas-vindas",
      "type": "START|MESSAGE|QUESTION|BUTTONS|LIST|IMAGE|VIDEO|AUDIO|DOCUMENT|WAIT|IF|SWITCH|CAPTURE|SAVE_VAR|UPDATE_VAR|WEBHOOK|HTTP|AI|AGENT|FILE|LOCATION|CONTACT|PRODUCT|TAG|FUNNEL_ADD|FUNNEL_REMOVE|LABEL_ADD|LABEL_REMOVE|TICKET|HANDOFF|END",
      "message": "texto enviado ao usuário (se aplicável)",
      "options": ["Botão 1","Botão 2"],
      "variable": "nome_da_variavel",
      "condition": "expressão (para IF/SWITCH)",
      "next": "id_do_proximo" ,
      "branches": { "Produto A": "n5", "Produto B": "n7", "default": "n9" }
    }
  ]
}

Regras:
- Sempre inclua um nó START e pelo menos um END.
- Sempre ofereça saídas globais: "Menu Principal", "Falar com Atendente", "Cancelar".
- Nunca escreva texto fora do JSON. Nunca use markdown. Nunca comente.
`;

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
    let flow: Record<string, unknown>;
    try { flow = JSON.parse(raw); } catch { throw new Error("Resposta inválida da IA"); }
    return { flow };
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