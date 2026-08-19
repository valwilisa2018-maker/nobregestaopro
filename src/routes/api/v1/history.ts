import { createFileRoute } from "@tanstack/react-router";
import { authFromRequest, json, pagination } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await authFromRequest(request);
        if (ctx instanceof Response) return ctx;
        const url = new URL(request.url);
        const { limit, offset } = pagination(url);
        const kind = url.searchParams.get("kind");
        let q = ctx.supabase
          .from("credit_transactions")
          .select("*", { count: "exact" })
          .eq("user_id", ctx.userId)
          .order("occurred_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (kind) q = q.eq("kind", kind);
        const { data, error, count } = await q;
        if (error) return json({ error: error.message }, 500);
        return json({ items: data ?? [], total: count ?? 0, limit, offset });
      },
    },
  },
});
