import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, json } from "@/lib/api-auth.server";
import { emitWebhook } from "@/lib/webhooks.server";

export const Route = createFileRoute("/api/v1/credits")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await authFromRequest(request);
        if (ctx instanceof Response) return ctx;
        const { data: before } = await ctx.supabase
          .from("credit_wallets")
          .select("plan_tokens_reset_at")
          .eq("user_id", ctx.userId)
          .maybeSingle();
        await ctx.supabase.rpc("ensure_credit_wallet", { _user_id: ctx.userId });
        const { data, error } = await ctx.supabase
          .from("credit_wallets")
          .select("*")
          .eq("user_id", ctx.userId)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (
          before?.plan_tokens_reset_at &&
          data?.plan_tokens_reset_at &&
          before.plan_tokens_reset_at !== data.plan_tokens_reset_at
        ) {
          await emitWebhook(ctx.userId, "plan.renewed", {
            plan_remaining: Number(data.plan_tokens_remaining ?? 0),
            resets_at: data.plan_tokens_reset_at,
          });
        }
        return json({
          plan_remaining: Number(data?.plan_tokens_remaining ?? 0),
          extra_remaining: Number(data?.extra_tokens_remaining ?? 0),
          total:
            Number(data?.plan_tokens_remaining ?? 0) + Number(data?.extra_tokens_remaining ?? 0),
          resets_at: data?.plan_tokens_reset_at ?? null,
        });
      },
    },
  },
});
