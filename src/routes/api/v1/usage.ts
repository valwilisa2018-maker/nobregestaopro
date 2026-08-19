import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, json } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/usage")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await authFromRequest(request);
        if (ctx instanceof Response) return ctx;
        const url = new URL(request.url);
        const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 365);
        const since = new Date(Date.now() - days * 86400_000).toISOString();
        const { data, error } = await ctx.supabase
          .from("credit_transactions")
          .select("total_tokens, cost_cents, model, occurred_at, kind")
          .eq("user_id", ctx.userId)
          .gte("occurred_at", since)
          .eq("status", "ok");
        if (error) return json({ error: error.message }, 500);
        const usage = (data ?? []).filter((t) => t.kind === "usage");
        const byModel: Record<string, number> = {};
        for (const t of usage)
          byModel[t.model ?? "unknown"] =
            (byModel[t.model ?? "unknown"] ?? 0) + Number(t.total_tokens ?? 0);
        // Daily series (UTC day buckets) covering the whole window, zero-filled
        const byDay: Record<string, { tokens: number; cost_cents: number }> = {};
        for (let i = 0; i < days; i++) {
          const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
          byDay[d] = { tokens: 0, cost_cents: 0 };
        }
        for (const t of usage) {
          const d = new Date(t.occurred_at as string).toISOString().slice(0, 10);
          if (!byDay[d]) byDay[d] = { tokens: 0, cost_cents: 0 };
          byDay[d].tokens += Number(t.total_tokens ?? 0);
          byDay[d].cost_cents += Number(t.cost_cents ?? 0);
        }
        const series = Object.entries(byDay)
          .map(([date, v]) => ({ date, tokens: v.tokens, cost_cents: v.cost_cents }))
          .sort((a, b) => a.date.localeCompare(b.date));
        return json({
          days,
          total_tokens: usage.reduce((s, t) => s + Number(t.total_tokens ?? 0), 0),
          total_cost_cents: usage.reduce((s, t) => s + (t.cost_cents ?? 0), 0),
          by_model: byModel,
          series,
        });
      },
    },
  },
});
