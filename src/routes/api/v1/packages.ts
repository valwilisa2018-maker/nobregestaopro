import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { json, pagination } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/packages")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const { limit, offset } = pagination(url, 50, 200);
    const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data, error, count } = await supabase.from("credit_packages")
      .select("id, name, tokens, price_cents, badge, sort_order", { count: "exact" })
      .eq("is_active", true).order("sort_order", { ascending: true }).range(offset, offset + limit - 1);
    if (error) return json({ error: error.message }, 500);
    return json({ items: data ?? [], total: count ?? 0, limit, offset });
  } } },
});