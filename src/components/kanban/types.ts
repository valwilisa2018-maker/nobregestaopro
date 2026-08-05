export interface KanbanSale {
  total_amount: number | null;
  paid_amount: number | null;
  payment_status: string | null;
  trello_link?: string | null;
  google_drive_link: string | null;
  platform_link: string | null;
  producer_id: string | null;
  expected_delivery_date: string | null;
  video_duration_seconds: number | null;
  customers: { name: string | null; company: string | null; phone: string | null } | null;
  sellers: { name: string | null; avatar_url?: string | null } | null;
  producers: { name: string | null; avatar_url?: string | null } | null;
}

export interface KanbanCardData {
  id: string;
  title: string;
  description: string | null;
  column_id: string;
  due_date: string | null;
  due_time: string | null;
  color: string | null;
  labels: string[] | null;
  google_drive_link: string | null;
  platform_link: string | null;
  sale_id: string | null;
  producer_id: string | null;
  expected_delivery_date: string | null;
  video_duration_seconds: number | null;
  delivered_at: string | null;
  created_at: string;
  sort_order: number | null;
  producer: { name: string | null; avatar_url?: string | null } | null;
  sales: KanbanSale | null;
}

export interface ProducerOption {
  id: string;
  name: string;
  avatar_url?: string | null;
  custom_kanban_columns?: string[] | null;
}

export interface KanbanColumnData {
  id: string;
  name: string;
  color: string;
  is_default?: boolean | null;
  is_done?: boolean | null;
  producer_id?: string | null;
  sort_order?: number | null;
}

export type CardForm = {
  id?: string;
  column_id: string;
  title: string;
  description: string;
  due_date: string;
  due_time: string;
  color: string;
  labels: string[];
  google_drive_link?: string | null;
  platform_link?: string | null;
  sale_id?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  producer_id?: string | null;
  expected_delivery_date?: string | null;
  video_duration_seconds?: number | null;
  video_duration_input?: string;
};

export const CARD_COLORS: { name: string; value: string }[] = [
  { name: "Padrão", value: "" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Laranja", value: "#f97316" },
  { name: "Amarelo", value: "#eab308" },
  { name: "Verde", value: "#22c55e" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Roxo", value: "#a855f7" },
  { name: "Rosa", value: "#ec4899" },
];

export const LABEL_COLORS: string[] = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#64748b",
];

export const COLUMN_COLORS: string[] = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#10b981",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#64748b",
];

export const parseLabel = (s: string): { name: string; color: string } => {
  const i = s.lastIndexOf("|");
  if (i > 0 && /^#[0-9a-fA-F]{6}$/.test(s.slice(i + 1))) {
    return { name: s.slice(0, i), color: s.slice(i + 1) };
  }
  return { name: s, color: "" };
};
export const formatLabel = (name: string, color: string) => (color ? `${name}|${color}` : name);

export const isOverdue = (date?: string | null, time?: string | null) => {
  if (!date) return false;
  const now = new Date();
  const due = new Date(`${date}T${time || "23:59:59"}`);
  return due < now;
};

// Considera atrasado quando venceu due_date OU expected_delivery_date.
export const isCardOverdue = (c: KanbanCardData) => {
  const exp = c?.expected_delivery_date ?? c?.sales?.expected_delivery_date ?? null;
  return isOverdue(c?.due_date, c?.due_time) || isOverdue(exp, null);
};

// Premium standardized styles
const PAYMENT_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pago_total: { bg: "#10b981", fg: "#fff", label: "Pago total" },
  pago_parcial: { bg: "#f59e0b", fg: "#1a1a1a", label: "Pago parcial" },
  pendente: { bg: "#ef4444", fg: "#fff", label: "Pendente" },
};
export const paymentStyle = (s?: string | null) =>
  PAYMENT_STYLE[s ?? ""] ?? {
    bg: "var(--muted)",
    fg: "var(--foreground)",
    label: (s ?? "—").replace("_", " "),
  };

export const emptyForm = (column_id = ""): CardForm => ({
  column_id,
  title: "",
  description: "",
  due_date: "",
  due_time: "",
  color: "",
  labels: [],
});

// Converte "2:30", "1:02:30", "150s", "2min30s", "2min", "150" para segundos.
// Retorna null se a entrada estiver vazia, 0 se ilegível.
export function parseDurationInput(raw: string): number | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  const mColon = s.match(/^(\d{1,2})(?::(\d{1,2}))(?::(\d{1,2}))?$/);
  if (mColon) {
    const a = Number(mColon[1] || 0);
    const b = Number(mColon[2] || 0);
    const c = mColon[3] != null ? Number(mColon[3]) : null;
    return c != null ? a * 3600 + b * 60 + c : a * 60 + b;
  }
  const mUnits = s.match(/(\d+)\s*(?:min|m)\b(?:\s*(\d+)\s*s\b)?/);
  if (mUnits) return Number(mUnits[1]) * 60 + Number(mUnits[2] || 0);
  const mSec = s.match(/^(\d+)\s*s?$/);
  if (mSec) {
    const n = Number(mSec[1]);
    return n < 60 ? n : n; // "150" => 150 segundos
  }
  return 0;
}
