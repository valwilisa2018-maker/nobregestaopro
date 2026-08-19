import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AuthedCtx = { supabase: SupabaseClient<Database>; userId: string; token: string };

export async function authFromRequest(request: Request): Promise<AuthedCtx | Response> {
  const h = request.headers.get("authorization") ?? "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  if (!token) return json({ error: "missing_bearer" }, 401);
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    },
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json({ error: "invalid_token" }, 401);
  return { supabase, userId: data.user.id, token };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function pagination(url: URL, defLimit = 20, maxLimit = 100) {
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? defLimit) || defLimit, 1),
    maxLimit,
  );
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  return { limit, offset };
}
