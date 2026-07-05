import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authFromRequest, json } from "@/lib/api-auth.server";
import { emitWebhook } from "@/lib/webhooks.server";

const schema = z.object({ package_id: z.string().uuid() });

export const Route = createFileRoute("/api/v1/buy")({
  server: { handlers: { POST: async ({ request }) => {
    const ctx = await authFromRequest(request);
    if (ctx instanceof Response) return ctx;
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const p = schema.safeParse(body);
    if (!p.success) return json({ error: p.error.issues[0].message }, 400);
    const { data, error } = await ctx.supabase.rpc("create_credit_order", { _package_id: p.data.package_id });
    if (error) {
      await emitWebhook(ctx.userId, "order.refused", { package_id: p.data.package_id, reason: error.message });
      return json({ error: error.message }, 400);
    }
    await emitWebhook(ctx.userId, "order.created", { order: data });
    return json({ order: data }, 201);
  } } },
});