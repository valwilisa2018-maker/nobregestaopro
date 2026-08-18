export const VIDEO_POINT_SECONDS = 30;
export const JULIA_PRODUCER_ID = "b381e1e9-f556-4ae7-94c0-906ffb59c486";

/** Usa a mesma prioridade exibida no Kanban: card primeiro, venda como fallback. */
export function resolveVideoDurationSeconds(
  cardDuration: number | null | undefined,
  saleDuration: number | null | undefined,
): number {
  const seconds = Number(cardDuration ?? saleDuration ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

const JULIA_CONFIRMED_DELIVERY_DATES: Record<string, string> = {
  "Denis • Video mascote 01": "2026-08-12T22:07:00-03:00",
  "Valdemir • Video mascote 01": "2026-08-12T21:18:00-03:00",
  "Marcia • Video mascote 01": "2026-08-12T21:09:00-03:00",
  "Deivi • Video mascote 01": "2026-08-12T20:56:00-03:00",
  "Deivi • Video mascote 02": "2026-08-12T20:56:00-03:00",
  "Deivi • Video mascote 03": "2026-08-12T20:56:00-03:00",
};

/** Correções confirmadas de dados legados, compartilhadas por todas as telas. */
export function normalizeProductionDeliveredAt(
  producerId: string | null | undefined,
  title: string | null | undefined,
  deliveredAt: string | null | undefined,
): string | null {
  if (!deliveredAt || producerId !== JULIA_PRODUCER_ID) return deliveredAt ?? null;
  const confirmed = JULIA_CONFIRMED_DELIVERY_DATES[title ?? ""];
  if (confirmed) return confirmed;
  // Os registros antigos exibidos em 20/21 de junho foram confirmados como
  // entregues em 12/08/2026. A identificação pela data evita depender do
  // rótulo visual "cliente • serviço", que pode não ser o título salvo.
  if (deliveredAt.startsWith("2026-06-20") || deliveredAt.startsWith("2026-06-21")) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(deliveredAt));
    const timePart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "00";
    return `2026-08-12T${timePart("hour")}:${timePart("minute")}:${timePart("second")}-03:00`;
  }
  return deliveredAt.startsWith("2026-07-")
    ? deliveredAt.replace("2026-07-", "2026-08-")
    : deliveredAt;
}

export function parseDuracaoSegundos(name: string): number {
  if (!name) return 0;

  const s = String(name).toLowerCase();
  const mColon = s.match(/(?<![\d:])(\d{1,2})(?::(\d{1,2}))(?::(\d{1,2}))?(?![\d:])/);
  if (mColon) {
    const a = Number(mColon[1] || 0);
    const b = Number(mColon[2] || 0);
    const c = mColon[3] != null ? Number(mColon[3]) : null;
    if (c != null) return a * 3600 + b * 60 + c;
    return a * 60 + b;
  }

  const mUnits = s.match(/(\d+)\s*(?:min|m)(?:\s*(\d+)\s*s\b)?/);
  if (mUnits) return Number(mUnits[1]) * 60 + Number(mUnits[2] || 0);

  const mSec = s.match(/(\d+)\s*s\b/);
  if (mSec) return Number(mSec[1]);

  return 0;
}

export function calculateVideoPoints(totalSegundos: number | null | undefined): number {
  const segundos = Number(totalSegundos ?? 0);
  if (!Number.isFinite(segundos) || segundos <= 0) return 0;
  return segundos / VIDEO_POINT_SECONDS;
}
