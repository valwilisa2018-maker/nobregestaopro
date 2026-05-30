// Brazilian date/time/number formatting helpers.
// Uses pt-BR with America/Sao_Paulo for consistent display.

const TZ = "America/Sao_Paulo";

// Parse "YYYY-MM-DD" or ISO datetime into a Date without TZ shifting for date-only.
function parse(d?: string | Date | null): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  // date-only string -> treat as local Brazil date (avoid UTC off-by-one)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

export function fmtDate(d?: string | Date | null, fallback = "—"): string {
  const dt = parse(d);
  if (!dt) return fallback;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return dt.toLocaleDateString("pt-BR");
  }
  return dt.toLocaleDateString("pt-BR", { timeZone: TZ });
}

export function fmtTime(d?: string | Date | null, fallback = "—"): string {
  const dt = parse(d);
  if (!dt) return fallback;
  return dt.toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateTime(d?: string | Date | null, fallback = "—"): string {
  const dt = parse(d);
  if (!dt) return fallback;
  return dt.toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}