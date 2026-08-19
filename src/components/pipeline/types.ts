export type Priority = "low" | "medium" | "high" | "urgent";

export interface Stage {
  id: string;
  user_id: string;
  name: string;
  color: string;
  position: number;
  is_system: boolean;
  is_won: boolean;
  is_lost: boolean;
}

export interface Deal {
  id: string;
  user_id: string;
  stage_id: string;
  title: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  avatar_url: string | null;
  value_cents: number;
  product: string | null;
  source: string | null;
  owner_id: string | null;
  owner_name: string | null;
  priority: Priority;
  tags: string[];
  notes: string | null;
  next_contact_at: string | null;
  last_interaction_at: string | null;
  links: Record<string, string>;
  checklist: { label: string; done: boolean }[];
  lost_reason: string | null;
  position: number;
  created_at: string;
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  medium: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  urgent: "bg-red-500/15 text-red-500 border-red-500/30",
};

export const formatBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
