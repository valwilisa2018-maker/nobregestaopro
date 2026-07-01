import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/evolution/$instance")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const instance = params.instance;
        let payload: any = null;
        try { payload = await request.json(); } catch { payload = null; }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find connection by instance_name
        const { data: conn } = await supabaseAdmin
          .from("connections").select("id,user_id").eq("instance_name", instance).maybeSingle();

        if (!conn) return Response.json({ ok: false, reason: "instance not found" }, { status: 404 });

        // Log the raw event
        await supabaseAdmin.from("logs").insert({
          user_id: conn.user_id,
          level: "info",
          source: `evolution:${instance}`,
          message: payload?.event ?? "webhook",
          metadata: payload ?? {},
        } as never);

        // Handle connection state updates
        const event = payload?.event;
        if (event === "connection.update" || event === "CONNECTION_UPDATE") {
          const state = payload?.data?.state;
          const status = state === "open" ? "online" : state === "connecting" ? "connecting" : "offline";
          await supabaseAdmin.from("connections").update({
            status,
            last_sync: new Date().toISOString(),
            phone_number: payload?.data?.wuid?.split?.("@")?.[0] ?? undefined,
          }).eq("id", conn.id);
        }

        return Response.json({ ok: true });
      },
      GET: async ({ params }) =>
        Response.json({ ok: true, instance: params.instance, hint: "POST events here" }),
    },
  },
});