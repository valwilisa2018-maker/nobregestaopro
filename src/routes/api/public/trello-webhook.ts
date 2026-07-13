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
          if (!sig) {
            return new Response("missing signature", { status: 401 });
          }
          const callbackURL =
            new URL(request.url).origin + "/api/public/trello-webhook";
          const { createHmac, timingSafeEqual } = await import("crypto");
          const expected = createHmac("sha1", secret)
            .update(body + callbackURL)
            .digest("base64");
          const a = Buffer.from(sig);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("invalid signature", { status: 401 });
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

        // Pontuação:
        // - "pronto": 1 ponto a cada 30s de vídeo, lendo a duração do nome do card.
        //   Formatos aceitos no título: "2:30", "02:30", "(2:30)", "150s",
        //   "2min", "2 min 30 s", "2m30s". Sem duração reconhecida → 0 pontos.
        // - "distribuicao_edicao": 1 ponto fixo × multiplicador.
        // - "alteracao" / "entregue": registrados para contagem, valem 0 pontos.
        const cardName: string = String(card.name ?? "").trim();
        // Idempotência: usa o ID do card do Trello como chave única.
        // Garante que cada card é contabilizado uma vez só, mesmo que dois
        // cards diferentes tenham o mesmo título.
        const cardKey = String(card.id);

        let pontos = 0;
        let duracaoSegundos = 0;
        if (evento === "pronto") {
          duracaoSegundos = parseDuracaoSegundos(cardName);
          if (duracaoSegundos > 0) {
            const { data: scoring } = await supabaseAdmin
              .from("om_scoring" as any)
              .select("multiplicador")
              .eq("evento", "pronto")
              .maybeSingle();
            const multiplicador = Number((scoring as any)?.multiplicador ?? 1);
            // 1 ponto a cada 30s — contagem completa (arredonda pra cima).
            const blocos = Math.ceil(duracaoSegundos / 30);
            pontos = Math.round(blocos * multiplicador);
          }
        } else if (evento === "distribuicao_edicao") {
          const { data: scoring } = await supabaseAdmin
            .from("om_scoring" as any)
            .select("multiplicador")
            .eq("evento", "distribuicao_edicao")
            .maybeSingle();
          const multiplicador = Number((scoring as any)?.multiplicador ?? 1);
          pontos = Math.round(1 * multiplicador);
        }

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
          duracao_segundos: duracaoSegundos,
        });
      },
    },
  },
});

/**
 * Extrai a duração (em segundos) a partir do nome do card.
 * Suporta os formatos mais comuns usados pelos produtores:
 *   "2:30", "02:30", "(2:30)", "- 2:30"   → mm:ss
 *   "1:02:30"                              → hh:mm:ss
 *   "150s", "150 s"                        → segundos
 *   "2min", "2 min", "2m"                  → minutos
 *   "2min30s", "2m 30s", "2 min 30 s"      → minutos + segundos
 * Retorna 0 se não encontrar nada confiável.
 */
function parseDuracaoSegundos(name: string): number {
  if (!name) return 0;
  const s = name.toLowerCase();

  // hh:mm:ss ou mm:ss (com borda para não pegar dentro de palavras)
  const mColon = s.match(/(?<![\d:])(\d{1,2})(?::(\d{1,2}))(?::(\d{1,2}))?(?![\d:])/);
  if (mColon) {
    const a = Number(mColon[1] || 0);
    const b = Number(mColon[2] || 0);
    const c = mColon[3] != null ? Number(mColon[3]) : null;
    if (c != null) return a * 3600 + b * 60 + c; // hh:mm:ss
    return a * 60 + b; // mm:ss
  }

  // "2min30s" / "2m 30s" / "2 min"
  const mUnits = s.match(/(\d+)\s*(?:min|m)\b(?:\s*(\d+)\s*s\b)?/);
  if (mUnits) {
    return Number(mUnits[1]) * 60 + Number(mUnits[2] || 0);
  }

  // "150s"
  const mSec = s.match(/(\d+)\s*s\b/);
  if (mSec) return Number(mSec[1]);

  return 0;
}