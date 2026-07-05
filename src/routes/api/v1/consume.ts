import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authFromRequest, json } from "@/lib/api-auth.server";

const schema = z.object({
  model: z.string().min(1).max(120),
  input_tokens: z.number().int().min(0).max(10_000_000),
  output_tokens: z.number().int().min(0).max(10_000_000),
  cost_cents: z.number().int().min(0).max(10_000_000).default(0),
  agent_id: z.string().uuid().nullable().optional(),
});

export const Route = createFileRoute("/api/v1/consume")({
  server: { handlers: { POST: async ({ request }) => {
    const ctx = await authFromRequest(request);
    if (ctx instanceof Response) return ctx;
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const p = schema.safeParse(body);
    if (!p.success) return json({ error: p.error.issues[0].message }, 400);
    const { data, error } = await ctx.supabase.rpc("consume_ai_tokens", {
      _user_id: ctx.userId, _agent_id: p.data.agent_id ?? null, _model: p.data.model,
      _input_tokens: p.data.input_tokens, _output_tokens: p.data.output_tokens, _cost_cents: p.data.cost_cents,
    });
    if (error) return json({ error: error.message }, 400);
    const result = data as { allowed: boolean };
    return json(result, result?.allowed ? 200 : 402);
  } } },
});