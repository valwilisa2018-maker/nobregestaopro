import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authFromRequest, json } from "@/lib/api-auth.server";
import { emitWebhook } from "@/lib/webhooks.server";

const schema = z.object({ order_id: z.string().uuid(), reason: z.string().max(200).optional() });

export const Route = createFileRoute("/api/v1/refund")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await authFromRequest(request);
        if (ctx instanceof Response) return ctx;
        const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
          _user_id: ctx.userId,
          _role: "admin",
        });
        if (!isAdmin) return json({ error: "forbidden" }, 403);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }
        const p = schema.safeParse(body);
        if (!p.success) return json({ error: p.error.issues[0].message }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order, error } = await supabaseAdmin.rpc("refund_credit_order" as never, {
          _order_id: p.data.order_id,
          _reason: p.data.reason ?? null,
        } as never);
        if (error || !order) {
          const message = error?.message ?? "refund_failed";
          if (message.includes("order_not_found")) return json({ error: "order_not_found" }, 404);
          if (message.includes("already_refunded")) return json({ error: "already_refunded" }, 409);
          if (message.includes("order_not_paid")) return json({ error: "order_not_paid" }, 409);
          return json({ error: message }, 400);
        }

        const refundedOrder = order as {
          id: string;
          user_id: string;
          tokens: number;
          price_cents: number;
          status: string;
        };
        await emitWebhook(refundedOrder.user_id, "order.refunded", {
          order_id: refundedOrder.id,
          tokens: Number(refundedOrder.tokens),
          price_cents: Number(refundedOrder.price_cents),
          reason: p.data.reason ?? null,
        });
        return json({ ok: true, order: refundedOrder });
      },
    },
  },
});
