import { createFileRoute } from "@tanstack/react-router";

/**
 * Trello webhook receiver.
 * - HEAD: Trello validates the URL on registration. Must return 200.
 * - POST: action payload. We pick `updateCard` actions whose `listAfter`
 *   is mapped to an event in `om_trello_list_map`, resolve the producer
 *   via `om_trello_member_map`, and insert an idempotent row in
 *   `om_eventos` (UNIQUE producer_id, evento, card_key prevents duplicates).
 *
 * Note: HMAC signature check is intentionally permissive while the integration
 * is being configured — once `om_settings.trello_webhook_secret` is set we
 * verify `x-trello-webhook` header.
 */
export const Route = createFileRoute("/api/public/trello-webhook")({
  server: {
    handlers: {
      HEAD: async () => new Response("ok", { status: 200 }),
      GET: async () => new Response("ok", { status: 200 }),
      POST: async ({ request }) => {
        const body = await request.text();
        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Optional signature verification when secret is configured
        const { data: settings } = await supabaseAdmin
          .from("om_settings" as any)
          .select("trello_webhook_secret")
          .eq("id", true)
          .maybeSingle();
        const secret = (settings as any)?.trello_webhook_secret as string | null;
        if (secret) {
          const sig = request.headers.get("x-trello-webhook");
          if (sig) {
            const callbackURL =
              new URL(request.url).origin + "/api/public/trello-webhook";
            const { createHmac } = await import("crypto");
            const expected = createHmac("sha1", secret)
              .update(body + callbackURL)
              .digest("base64");
            if (sig !== expected) {
              return new Response("invalid signature", { status: 401 });
            }
          }
        }

        const action = payload?.action;
        if (!action || action.type !== "updateCard") {
          return Response.json({ ok: true, skipped: "not updateCard" });
        }
        const listAfter = action?.data?.listAfter;
        const card = action?.data?.card;
        const memberId = action?.idMemberCreator || action?.memberCreator?.id;
        if (!listAfter?.id || !card?.id || !memberId) {
          return Response.json({ ok: true, skipped: "missing fields" });
        }

        // Map list -> evento
        const { data: listMap } = await supabaseAdmin
          .from("om_trello_list_map" as any)
          .select("evento")
          .eq("list_id", listAfter.id)
          .maybeSingle();
        const evento = (listMap as any)?.evento as string | undefined;
        if (!evento) {
          return Response.json({ ok: true, skipped: "list not mapped" });
        }

        // Map member -> producer
        const { data: memMap } = await supabaseAdmin
          .from("om_trello_member_map" as any)
          .select("producer_id")
          .eq("trello_member_id", memberId)
          .maybeSingle();
        const producerId = (memMap as any)?.producer_id as string | undefined;
        if (!producerId) {
          return Response.json({ ok: true, skipped: "member not mapped" });
        }

        // Scoring multiplier
        const { data: scoring } = await supabaseAdmin
          .from("om_scoring" as any)
          .select("multiplicador")
          .eq("evento", evento)
          .maybeSingle();
        const multiplicador = Number((scoring as any)?.multiplicador ?? 1);

        // Points base = 1 (per-card service points integration is TODO)
        const cardName: string = String(card.name ?? "").trim();
        const cardKey = cardName.toLowerCase();
        const pontos = Math.round(1 * multiplicador);

        const { error } = await supabaseAdmin.from("om_eventos" as any).insert({
          producer_id: producerId,
          evento,
          card_key: cardKey,
          card_name: cardName,
          trello_card_id: card.id,
          pontos,
          raw: payload,
        });

        // 23505 = unique_violation → idempotent, already counted
        if (error && (error as any).code !== "23505") {
          console.error("trello-webhook insert error", error);
          return new Response("insert failed", { status: 500 });
        }

        return Response.json({
          ok: true,
          inserted: !error,
          duplicate: !!error,
          evento,
          pontos,
        });
      },
    },
  },
});