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
      POST: async ({ request }) => {
        await request.text(); // ack; TODO: processar mensagens e status de templates
        return new Response("ok", { status: 200 });
      },
    },
  },
});