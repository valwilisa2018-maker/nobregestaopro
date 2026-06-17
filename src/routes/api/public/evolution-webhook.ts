import { createFileRoute } from "@tanstack/react-router";

function mapState(payload: any): string | null {
  const ev = String(payload?.event ?? "").toLowerCase();
  const d = payload?.data ?? {};
  if (ev.includes("connection")) {
    const s = d?.state ?? d?.connection ?? d?.status;
    if (typeof s === "string") return s;
  }
  if (ev.includes("qrcode")) return "qrcode";
  if (ev.includes("logout")) return "disconnected";
  return null;
}

function extractNumber(payload: any): string | null {
  const d = payload?.data ?? {};
  return d?.wuid ?? d?.owner ?? d?.number ?? payload?.sender ?? null;
}

export const Route = createFileRoute("/api/public/evolution-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json().catch(() => null);
          const instance =
            payload?.instance ?? payload?.instanceName ?? payload?.data?.instance;
          console.log("[evolution-webhook]", {
            event: payload?.event,
            instance,
            at: new Date().toISOString(),
          });
          if (instance) {
            const state = mapState(payload);
            const number = extractNumber(payload);
            const { supabaseAdmin } = await import(
              "@/integrations/supabase/client.server"
            );
            const row: Record<string, any> = {
              instance_name: instance,
              last_event: payload?.event ?? null,
              updated_at: new Date().toISOString(),
            };
            if (state) row.state = state;
            if (number) row.number = number;
            await supabaseAdmin
              .from("whatsapp_status")
              .upsert(row, { onConflict: "instance_name" });
          }
        } catch (e) {
          console.error("[evolution-webhook] parse error", e);
        }
        return new Response("ok", { status: 200 });
      },
      GET: async () => Response.json({ ok: true }),
    },
  },
});