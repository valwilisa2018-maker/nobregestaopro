import { createHmac } from "crypto";

export type WebhookEvent =
  | "order.created"
  | "order.paid"
  | "order.refused"
  | "order.refunded"
  | "credits.added"
  | "credits.consumed"
  | "credits.low"
  | "credits.zero"
  | "plan.renewed";

export async function emitWebhook(userId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: hooks } = await supabaseAdmin
      .from("webhooks")
      .select("id,url,secret,events,is_active")
      .eq("user_id", userId)
      .eq("is_active", true);
    const targets = (hooks ?? []).filter((h) => Array.isArray(h.events) && h.events.includes(event));
    if (targets.length === 0) return;
    const body = JSON.stringify({ event, user_id: userId, occurred_at: new Date().toISOString(), data: payload });
    await Promise.allSettled(
      targets.map((h) => {
        const sig = h.secret ? createHmac("sha256", h.secret).update(body).digest("hex") : "";
        return fetch(h.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-webhook-event": event,
            ...(sig ? { "x-webhook-signature": sig } : {}),
          },
          body,
        }).catch(() => undefined);
      }),
    );
  } catch {
    // never throw from emitter
  }
}