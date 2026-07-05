import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, json } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/credits")({
  server: { handlers: { GET: async ({ request }) => {
    const ctx = await authFromRequest(request);
    if (ctx instanceof Response) return ctx;
    await ctx.supabase.rpc("ensure_credit_wallet", { _user_id: ctx.userId });
    const { data, error } = await ctx.supabase.from("credit_wallets").select("*").eq("user_id", ctx.userId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({
      plan_remaining: Number(data?.plan_tokens_remaining ?? 0),
      extra_remaining: Number(data?.extra_tokens_remaining ?? 0),
      total: Number(data?.plan_tokens_remaining ?? 0) + Number(data?.extra_tokens_remaining ?? 0),
      resets_at: data?.plan_tokens_reset_at ?? null,
    });
  } } },
});