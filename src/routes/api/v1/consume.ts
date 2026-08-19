import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authFromRequest, json } from "@/lib/api-auth.server";
import { emitWebhook } from "@/lib/webhooks.server";

const schema = z.object({
  model: z.string().min(1).max(120),
  input_tokens: z.number().int().min(0).max(10_000_000),
  output_tokens: z.number().int().min(0).max(10_000_000),
  cost_cents: z.number().int().min(0).max(10_000_000).default(0),
  agent_id: z.string().uuid().nullable().optional(),
});

export const Route = createFileRoute("/api/v1/consume")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authFromRequest(request);
        if (ctx instanceof Response) return ctx;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        const p = schema.safeParse(body);
        if (!p.success) return json({ error: p.error.issues[0].message }, 400);
        const { data, error } = await ctx.supabase.rpc("consume_ai_tokens", {
          _user_id: ctx.userId,
          _agent_id: (p.data.agent_id ?? null) as unknown as string,
          _model: p.data.model,
          _input_tokens: p.data.input_tokens,
          _output_tokens: p.data.output_tokens,
          _cost_cents: p.data.cost_cents,
        });
        if (error) return json({ error: error.message }, 400);
        const result = data as { allowed: boolean; remaining?: number };
        if (result?.allowed) {
          await emitWebhook(ctx.userId, "credits.consumed", {
            model: p.data.model,
            input_tokens: p.data.input_tokens,
            output_tokens: p.data.output_tokens,
            cost_cents: p.data.cost_cents,
            agent_id: p.data.agent_id ?? null,
            remaining: result.remaining ?? null,
          });
          const remaining = Number(result.remaining ?? 0);
          if (remaining <= 0) await emitWebhook(ctx.userId, "credits.zero", { remaining });
          else if (remaining < 1000) await emitWebhook(ctx.userId, "credits.low", { remaining });
        }
        return json(result, result?.allowed ? 200 : 402);
      },
    },
  },
});
