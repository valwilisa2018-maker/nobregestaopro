import { createFileRoute } from "@tanstack/react-router";

type WebhookPayload = Record<string, unknown>;

function asRecord(value: unknown): WebhookPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as WebhookPayload) : {};
}

function mapState(payload: WebhookPayload): string | null {
  const ev = String(payload.event ?? "").toLowerCase();
  const d = asRecord(payload.data);
  if (ev.includes("connection")) {
    const s = d.state ?? d.connection ?? d.status;
    if (typeof s === "string") return s;
  }
  if (ev.includes("qrcode")) return "qrcode";
  if (ev.includes("logout")) return "disconnected";
  return null;
}

function extractNumber(payload: WebhookPayload): string | null {
  const d = asRecord(payload.data);
  const number = d.wuid ?? d.owner ?? d.number ?? payload.sender;
  return typeof number === "string" ? number : null;
}

export const Route = createFileRoute("/api/public/evolution-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = asRecord(await request.json().catch(() => null));
          const data = asRecord(payload.data);
          const instance = payload.instance ?? payload.instanceName ?? data.instance;
          console.log("[evolution-webhook]", {
            event: payload.event,
            instance,
            at: new Date().toISOString(),
          });
          if (typeof instance === "string") {
            const state = mapState(payload);
            const number = extractNumber(payload);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const row: Record<string, string | null> = {
              instance_name: instance,
              last_event: typeof payload.event === "string" ? payload.event : null,
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