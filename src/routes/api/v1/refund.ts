import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authFromRequest, json } from "@/lib/api-auth.server";

const schema = z.object({ order_id: z.string().uuid(), reason: z.string().max(200).optional() });

export const Route = createFileRoute("/api/v1/refund")({
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
    const { data: order, error: oErr } = await supabaseAdmin.from("credit_orders").select("*").eq("id", p.data.order_id).maybeSingle();
    if (oErr || !order) return json({ error: "order_not_found" }, 404);
    if (order.status === "refunded") return json({ error: "already_refunded" }, 409);
    if (order.status !== "paid") return json({ error: "order_not_paid" }, 409);

    const { error: uErr } = await supabaseAdmin.from("credit_orders").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", order.id);
    if (uErr) return json({ error: uErr.message }, 500);
    await supabaseAdmin.rpc("ensure_credit_wallet", { _user_id: order.user_id });
    const { data: w } = await supabaseAdmin.from("credit_wallets").select("extra_tokens_remaining").eq("user_id", order.user_id).maybeSingle();
    const newExtra = Math.max(0, Number(w?.extra_tokens_remaining ?? 0) - Number(order.tokens));
    await supabaseAdmin.from("credit_wallets").update({ extra_tokens_remaining: newExtra, updated_at: new Date().toISOString() }).eq("user_id", order.user_id);
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: order.user_id, total_tokens: -Number(order.tokens), cost_cents: -Number(order.price_cents),
      kind: "refund", status: "ok", metadata: { order_id: order.id, reason: p.data.reason ?? null },
    });
    return json({ ok: true, order_id: order.id });
  } } },
});