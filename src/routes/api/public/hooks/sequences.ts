import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sequences")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async () =>
        Response.json({
          ok: true,
          hint: "POST with Authorization: Bearer <FOLLOWUP_TRIGGER_SECRET>",
        }),
    },
  },
});

async function run(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return Response.json({ ok: false }, { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cfg } = await supabaseAdmin
    .from("internal_config" as never)
    .select("value")
    .eq("key", "followup_trigger_secret")
    .maybeSingle<{ value: string }>();
  const expected = cfg?.value ?? process.env.FOLLOWUP_TRIGGER_SECRET ?? "";
  if (!expected || token !== expected) return Response.json({ ok: false }, { status: 401 });

  const { processDueEnrollments } = await import("@/lib/sequences-runner.server");
  const result = await processDueEnrollments(supabaseAdmin as never, 40);
  return Response.json({ ok: true, ...result });
}
