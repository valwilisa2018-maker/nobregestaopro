import { createFileRoute } from "@tanstack/react-router";

type WebhookPayload = Record<string, unknown>;

function asRecord(value: unknown): WebhookPayload {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as WebhookPayload)
    : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value : null;
}

function mapState(payload: WebhookPayload): string | null {
  const event = String(payload.event ?? "").toLowerCase();
  const data = asRecord(payload.data);
  if (event.includes("connection")) {
    return str(data.state) ?? str(data.connection) ?? str(data.status);
  }
  if (event.includes("qrcode")) return "qrcode";
  if (event.includes("logout")) return "disconnected";
  return null;
}

function extractPhone(payload: WebhookPayload) {
  const data = asRecord(payload.data);
  const key = asRecord(data.key);
  const raw =
    str(data.wuid) ?? str(data.owner) ?? str(data.number) ?? str(key.remoteJid) ?? str(payload.sender);
  return raw ? raw.replace(/@.*/, "").replace(/\D/g, "") : null;
}

function extractText(payload: WebhookPayload) {
  const data = asRecord(payload.data);
  const message = asRecord(data.message);
  return (
    str(message.conversation) ??
    str(asRecord(message.extendedTextMessage).text) ??
    str(data.text) ??
    null
  );
}

export const Route = createFileRoute("/api/public/evolution-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
        if (expected) {
          const url = new URL(request.url);
          const provided =
            url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";
          if (provided !== expected) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        let payload: WebhookPayload = {};
        try {
          payload = asRecord(await request.json());
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const data = asRecord(payload.data);
        const instance =
          str(payload.instance) ?? str(payload.instanceName) ?? str(data.instance) ?? null;
        const eventType = str(payload.event) ?? "UNKNOWN";
        const key = asRecord(data.key);
        const eventKey =
          str(key.id) && instance
            ? `${instance}:${eventType}:${str(key.id)}`
            : `${instance ?? "sem-instancia"}:${eventType}:${Date.now()}`;

        console.log("[evolution-webhook]", { event: eventType, instance });

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { normalizeState } = await import("@/lib/whatsapp.server");

          const { error: eventError } = await supabaseAdmin.from("whatsapp_webhook_events").insert({
            event_key: eventKey,
            instance_name: instance,
            event_type: eventType,
            payload: payload as never,
          });
          // Duplicate delivery: já processado.
          if (eventError && /duplicate|unique/i.test(eventError.message)) {
            return new Response("ok (duplicado)", { status: 200 });
          }

          if (instance) {
            const state = mapState(payload);
            const phone = extractPhone(payload);
            const patch: Record<string, unknown> = { last_event: eventType };
            if (state) {
              const normalized = normalizeState(state);
              patch.state = normalized;
              if (normalized === "connected") {
                patch.connected_at = new Date().toISOString();
                if (phone) patch.phone_number = phone;
              }
              if (normalized === "disconnected") patch.phone_number = null;
            }
            const profilePic =
              str(data.profilePictureUrl) ?? str(asRecord(data.instance).profilePictureUrl);
            if (profilePic) patch.profile_pic_url = profilePic;
            await supabaseAdmin
              .from("whatsapp_connections")
              .update(patch as never)
              .eq("instance_name", instance);

            // Mensagens
            const isIncoming =
              eventType.toUpperCase().includes("MESSAGES_UPSERT") && key.fromMe !== true;
            const isOutgoing =
              eventType.toUpperCase().includes("SEND_MESSAGE") || key.fromMe === true;
            if ((isIncoming || isOutgoing) && phone) {
              const { data: connection } = await supabaseAdmin
                .from("whatsapp_connections")
                .select("id")
                .eq("instance_name", instance)
                .maybeSingle();
              const tail = phone.slice(-8);
              const { data: customers } = await supabaseAdmin
                .from("customers")
                .select("id")
                .ilike("phone", `%${tail}%`)
                .limit(1);
              const customerId = customers?.[0]?.id ?? null;
              await supabaseAdmin.from("whatsapp_messages").insert({
                connection_id: connection?.id ?? null,
                instance_name: instance,
                customer_id: customerId,
                phone,
                direction: isIncoming ? "in" : "out",
                body: extractText(payload),
                origin: "webhook",
                external_id: str(key.id) ? `${instance}:${str(key.id)}` : null,
              });
              if (customerId) {
                await supabaseAdmin
                  .from("customers")
                  .update({ last_interaction_at: new Date().toISOString() })
                  .eq("id", customerId);
                if (isIncoming) {
                  const { cancelNoResponseFollowups } = await import("@/lib/followup.server");
                  await cancelNoResponseFollowups(customerId);
                }
              }
            }
          }
        } catch (e) {
          console.error("[evolution-webhook] erro ao processar", e);
        }

        return new Response("ok", { status: 200 });
      },
      GET: async () => Response.json({ ok: true }),
    },
  },
});
