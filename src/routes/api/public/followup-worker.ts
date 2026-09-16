import { createFileRoute } from "@tanstack/react-router";

async function run(request: Request) {
  const url = new URL(request.url);
  const provided = url.searchParams.get("token") ?? request.headers.get("x-worker-token") ?? "";
  if (!provided) return new Response("Unauthorized", { status: 401 });

  const envSecret = process.env.FOLLOWUP_WORKER_SECRET;
  let authorized = Boolean(envSecret) && provided === envSecret;
  if (!authorized) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("evolution_settings")
      .select("worker_token")
      .eq("id", true)
      .maybeSingle();
    authorized = Boolean(data?.worker_token) && provided === data?.worker_token;
  }
  if (!authorized) return new Response("Unauthorized", { status: 401 });


  const { generateScheduledFollowups, processDueFollowups } = await import("@/lib/followup.server");
  try {
    const created = await generateScheduledFollowups();
    const processed = await processDueFollowups(25);
    return Response.json({ ok: true, created, ...processed });
  } catch (e) {
    console.error("[followup-worker]", e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/followup-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
