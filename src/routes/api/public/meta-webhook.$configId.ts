import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/meta-webhook/$configId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfg } = await supabaseAdmin
          .from("meta_wa_configs").select("webhook_verify_token")
          .eq("id", params.configId).maybeSingle();
        if (mode === "subscribe" && cfg?.webhook_verify_token && token === cfg.webhook_verify_token) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },
      POST: async ({ request, params }) => {
        const body = await request.text();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("logs").insert({
            level: "info", source: "meta_webhook",
            message: `payload cfg=${params.configId}`,
            metadata: { body: body.slice(0, 8000) } as never,
          } as never);
        } catch { /* ignore */ }
        return new Response("ok", { status: 200 });
      },
    },
  },
});