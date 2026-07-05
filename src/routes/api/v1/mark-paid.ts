import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authFromRequest, json } from "@/lib/api-auth.server";
import { emitWebhook } from "@/lib/webhooks.server";

const schema = z.object({ order_id: z.string().uuid() });

export const Route = createFileRoute("/api/v1/mark-paid")({
  server: { handlers: { POST: async ({ request }) => {
    const ctx = await authFromRequest(request);
    if (ctx instanceof Response) return ctx;
    const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const p = schema.safeParse(body);
    if (!p.success) return json({ error: p.error.issues[0].message }, 400);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin.rpc("mark_credit_order_paid", { _order_id: p.data.order_id });
    if (error || !order) return json({ error: error?.message ?? "not_found" }, 400);
    const o = order as { id: string; user_id: string; tokens: number; price_cents: number; status: string };
    await emitWebhook(o.user_id, "order.paid", { order_id: o.id, tokens: Number(o.tokens), price_cents: Number(o.price_cents) });
    await emitWebhook(o.user_id, "credits.added", { order_id: o.id, tokens: Number(o.tokens), source: "purchase" });
    return json({ ok: true, order: o });
  } } },
});