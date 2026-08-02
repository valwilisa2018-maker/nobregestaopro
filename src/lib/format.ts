// Camada única de formatação (datas, moeda, duração) em pt-BR / America/Sao_Paulo.
// Regra do projeto: nenhum componente deve declarar formatadores próprios —
// importe daqui para manter a saída idêntica em todas as telas.

export const TZ = "America/Sao_Paulo";

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
/* ------------------------------------------------------------------ *
 * Moeda
 * ------------------------------------------------------------------ */

export const formatCurrency = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
};

/* ------------------------------------------------------------------ *
 * Chaves de data — comparação textual, imune a fuso horário
 * ------------------------------------------------------------------ */

/** Data local como "YYYY-MM-DD". */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Mês local como "YYYY-MM". */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Normaliza qualquer data do banco ("YYYY-MM-DD" ou ISO) para "YYYY-MM-DD". */
export function toDateKey(value?: string | null): string {
  return value ? String(value).slice(0, 10) : "";
}

/** Normaliza qualquer data do banco para "YYYY-MM". */
export function toMonthKey(value?: string | null): string {
  return value ? String(value).slice(0, 7) : "";
}

/* ------------------------------------------------------------------ *
 * Duração
 * ------------------------------------------------------------------ */

/** Duração longa: "1h05min", "3min20s", "45s". */
export function formatDuracao(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "0min";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}min`;
  if (m > 0) return s > 0 ? `${m}min${s.toString().padStart(2, "0")}s` : `${m}min`;
  return `${s}s`;
}

/** Rótulo curto de vídeo: "30s", "2min", "2min30s". Vazio quando não há duração. */
export function formatVideoDuration(sec?: number | null): string {
  if (!sec || sec < 1) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m === 0 ? `${s}s` : s === 0 ? `${m}min` : `${m}min${s}s`;
}

/* ------------------------------------------------------------------ *
 * Relógio de Brasília
 * ------------------------------------------------------------------ */

export function formatBrasiliaTime(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}
