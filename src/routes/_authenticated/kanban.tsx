import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Loader2, Trash2, X, Calendar, Clock, ExternalLink, MessageCircle, ChevronDown, ChevronRight, Layers, MoreVertical, Edit2, UserPlus, AlertCircle, FolderOpen, Link as LinkIcon, Copy } from "lucide-react";
import { waHref, formatPhoneBR } from "@/lib/phone";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { formatCurrency } from "@/lib/auth";
import { autoLinkFolderFromUrl } from "@/lib/project-folders";

// Lembrete de baixa de pagamento — ao mover card(s) para a coluna "Serviços Entregues",
// busca a venda relacionada e, se ainda houver saldo em aberto, mostra um toast com link
// para a tela de Vendas pré-filtrada por aquele cliente.
async function checkDeliveryPaymentReminder(cardIds: string[], columnName?: string | null) {
  if (!columnName || !/entreg/i.test(columnName)) return;
  if (cardIds.length === 0) return;
  const { data: orders } = await supabase
    .from("service_orders")
    .select("id,sale_id,sales(id,customer_id,total_amount,paid_amount,payment_status,customers(name))")
    .in("id", cardIds);
  const seen = new Set<string>();
  for (const o of (orders ?? []) as any[]) {
    const sale = o.sales;
    if (!sale || seen.has(sale.id)) continue;
    seen.add(sale.id);
    const pendente = Number(sale.total_amount ?? 0) - Number(sale.paid_amount ?? 0);
    if (sale.payment_status === "pago_total" || pendente <= 0.0099) continue;
    const nome = sale.customers?.name ?? "Cliente";
    toast.warning(`Confirme a baixa do pagamento — ${nome}`, {
      description: `Ainda falta receber ${formatCurrency(pendente)}. Você já deu baixa no valor restante?`,
      duration: 12000,
      action: {
        label: "Valores pendentes",
        onClick: () => {
          window.location.href = `/pending-payments`;
        },
      },
    });
  }
}

// Formata segundos em rótulo curto: 30s, 1min, 1min30s, 2min...
function fmtVideoDuration(sec?: number | null): string {
  if (!sec || sec < 1) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m === 0 ? `${s}s` : s === 0 ? `${m}min` : `${m}min${s}s`;
}

// Converte "2:30", "1:02:30", "150s", "2min30s", "2min", "150" para segundos.
// Retorna null se a entrada estiver vazia, 0 se ilegível.
function parseDurationInput(raw: string): number | null {
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

export const Route = createFileRoute("/_authenticated/kanban")({
  component: KanbanPage,
  validateSearch: (s: Record<string, unknown>) => ({ card: typeof s.card === "string" ? s.card : undefined }),
});

const CARD_COLORS = [
  { name: "Padrão", value: "" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Laranja", value: "#f97316" },
  { name: "Amarelo", value: "#eab308" },
  { name: "Verde", value: "#22c55e" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Roxo", value: "#a855f7" },
  { name: "Rosa", value: "#ec4899" },
];

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#a855f7", "#ec4899", "#64748b",
];

const parseLabel = (s: string): { name: string; color: string } => {
  const i = s.lastIndexOf("|");
  if (i > 0 && /^#[0-9a-fA-F]{6}$/.test(s.slice(i + 1))) {
    return { name: s.slice(0, i), color: s.slice(i + 1) };
  }
  return { name: s, color: "" };
};
const formatLabel = (name: string, color: string) => color ? `${name}|${color}` : name;

const isOverdue = (date?: string | null, time?: string | null) => {
  if (!date) return false;
  const now = new Date();
  const due = new Date(`${date}T${time || "23:59:59"}`);
  return due < now;
};

type CardForm = {
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

const emptyForm = (column_id = ""): CardForm => ({
  column_id, title: "", description: "", due_date: "", due_time: "", color: "", labels: [],
});

// Premium standardized styles
const PAYMENT_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pago_total:   { bg: "#10b981", fg: "#fff", label: "Pago total" },
  pago_parcial: { bg: "#f59e0b", fg: "#1a1a1a", label: "Pago parcial" },
  pendente:     { bg: "#ef4444", fg: "#fff", label: "Pendente" },
};
const paymentStyle = (s?: string | null) =>
  PAYMENT_STYLE[s ?? ""] ?? { bg: "var(--muted)", fg: "var(--foreground)", label: (s ?? "—").replace("_", " ") };

function KanbanPage() {
  const qc = useQueryClient();
  const { card: cardParam } = Route.useSearch();
  const [dragging, setDragging] = useState<string | null>(null);
  const [draggingGroup, setDraggingGroup] = useState<string[] | null>(null);
  const [draggingFromCol, setDraggingFromCol] = useState<string | null>(null);
  const isProcessingMove = useRef(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const [boardScrollWidth, setBoardScrollWidth] = useState(0);
  const syncingScroll = useRef<"top" | "board" | null>(null);
  const autoScrollSpeed = useRef(0);
  const autoScrollRaf = useRef<number | null>(null);
  const [dragMoved, setDragMoved] = useState(false);
  const [editing, setEditing] = useState<CardForm | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<string>(LABEL_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [producerFilter, setProducerFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [editingColumn, setEditingColumn] = useState<{ id?: string, name: string, color: string, producer_id?: string | null } | null>(null);
  const [savingColumn, setSavingColumn] = useState(false);

  const producers = useQuery({
    queryKey: ["producers-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("producers").select("id,name,avatar_url,custom_kanban_columns").eq("active", true).order("name");
      if (error) { toast.error("Erro ao carregar produtores"); throw error; }
      return data ?? [];
    },
  });

  const cols = useQuery({
    queryKey: ["kanban-cols", producerFilter],
    queryFn: async () => {
      let query = supabase.from("kanban_columns").select("*");
      
      const isFiltered = producerFilter !== "all";
      if (isFiltered) {
        query = query.or(`producer_id.is.null,producer_id.eq.${producerFilter}`);
      } else {
        query = query.is("producer_id", null);
      }
      
      const { data } = await query.order("sort_order");
      const baseCols = data ?? [];

      if (isFiltered) {
        const prod = producers.data?.find((p: any) => p.id === producerFilter);
        const customNames = prod?.custom_kanban_columns as string[] | undefined;
        if (customNames && Array.isArray(customNames) && customNames.length > 0) {
          return baseCols.map((col: any, idx: number) => {
            const customName = customNames[idx];
            if (customName) return { ...col, name: customName };
            return col;
          });
        }
      }
      return baseCols;
    },
    enabled: !!producers.data,
  });

  const cards = useQuery({
    queryKey: ["kanban-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("*, producer:producers!service_orders_producer_id_fkey(name), sales(total_amount, paid_amount, payment_status, trello_link, google_drive_link, platform_link, producer_id, expected_delivery_date, video_duration_seconds, customers(name,company,phone), sellers(name), producers(name))")
        .order("created_at", { ascending: true })
        .order("service_index", { ascending: true });
      if (error) {
        toast.error("Erro ao carregar cards: " + error.message);
        throw error;
      }
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!cardParam || !cards.data) return;
    const found = cards.data.find((c: any) => c.id === cardParam);
    if (!found) return;
    setEditing({
      id: found.id, column_id: found.column_id,
      title: found.title ?? "", description: found.description ?? "",
      due_date: found.due_date ?? "", due_time: (found.due_time ?? "").slice(0, 5),
      color: found.color ?? "", labels: found.labels ?? [],
      google_drive_link:
        (found as any).google_drive_link ?? found.sales?.google_drive_link ?? null,
      platform_link: (found as any).platform_link ?? found.sales?.platform_link ?? null,
      sale_id: found.sale_id ?? null,
      customer_phone: found.sales?.customers?.phone ?? null,
      customer_name: found.sales?.customers?.name ?? null,
      producer_id: found.producer_id ?? null,
      expected_delivery_date: found.expected_delivery_date ?? found.sales?.expected_delivery_date ?? null,
      video_duration_seconds:
        (found as any).video_duration_seconds ?? found.sales?.video_duration_seconds ?? null,
      video_duration_input: fmtVideoDuration(
        (found as any).video_duration_seconds ?? found.sales?.video_duration_seconds ?? null,
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardParam, cards.data]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => setBoardScrollWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c as Element));
    return () => ro.disconnect();
  }, [cols.data, cards.data]);

  const resetDragState = () => {
    setDragging(null);
    setDraggingGroup(null);
    setDraggingFromCol(null);
  };

  const safeMutate = async (fn: () => Promise<void>) => {
    if (isProcessingMove.current) {
      toast.info("Aguarde a movimentação anterior…");
      return;
    }
    isProcessingMove.current = true;
    try {
      await fn();
    } catch (e: any) {
      await logger.error(`Falha no drag-and-drop: ${e?.message ?? e}`, { context: "kanban/safeMutate", details: { error: e } });
      toast.error("Falha ao mover card");
    } finally {
      isProcessingMove.current = false;
      resetDragState();
      qc.invalidateQueries({ queryKey: ["kanban-cards"] });
    }
  };

  const move = async (cardId: string, columnId: string) => {
    const col = cols.data?.find((c: any) => c.id === columnId);
    // Ao mover para uma coluna, novos cards vão para o topo (sort_order menor).
    // Em colunas concluídas isso garante "mais recente em cima".
    // Usa segundos (não ms) para caber em INTEGER (int32). Negativo = mais recente em cima.
    const newSort = -Math.floor(Date.now() / 1000);
    const nowIso = new Date().toISOString();
    // Atualização otimista do cache para feedback instantâneo no UI.
    const prev = qc.getQueryData<any[]>(["kanban-cards"]);
    qc.setQueryData<any[]>(["kanban-cards"], (old) =>
      (old ?? []).map((c: any) =>
        c.id === cardId
          ? { ...c, column_id: columnId, sort_order: newSort, delivered_at: col?.is_done && !c.delivered_at ? nowIso : c.delivered_at }
          : c,
      ),
    );
    const { error } = await supabase
      .from("service_orders")
      .update({ column_id: columnId, sort_order: newSort })
      .eq("id", cardId);
    if (!error && col?.is_done) {
      await supabase
        .from("service_orders")
        .update({ delivered_at: nowIso })
        .eq("id", cardId)
        .is("delivered_at", null);
    }
    if (error) {
      // Reverte cache em caso de falha
      if (prev) qc.setQueryData(["kanban-cards"], prev);
      await logger.error(`Erro ao mover card: ${error.message}`, { context: "kanban/move", details: { cardId, columnId, error } });
    } else {
      toast.success("Card movido");
      qc.invalidateQueries({ queryKey: ["kanban-cards"] });
      void checkDeliveryPaymentReminder([cardId], col?.name);
    }
  };

  const moveMany = async (cardIds: string[], columnId: string) => {
    const col = cols.data?.find((c: any) => c.id === columnId);
    const baseSort = -Math.floor(Date.now() / 1000);
    const nowIso = new Date().toISOString();
    const idSet = new Set(cardIds);
    const orderMap = new Map(cardIds.map((id, i) => [id, baseSort + i]));
    // Atualização otimista do cache
    const prev = qc.getQueryData<any[]>(["kanban-cards"]);
    qc.setQueryData<any[]>(["kanban-cards"], (old) =>
      (old ?? []).map((c: any) =>
        idSet.has(c.id)
          ? { ...c, column_id: columnId, sort_order: orderMap.get(c.id) ?? c.sort_order, delivered_at: col?.is_done && !c.delivered_at ? nowIso : c.delivered_at }
          : c,
      ),
    );
    // Atualiza em paralelo para manter ordem relativa entre os cards do grupo.
    const results = await Promise.all(
      cardIds.map((id, i) =>
        supabase
          .from("service_orders")
          .update({ column_id: columnId, sort_order: baseSort + i })
          .eq("id", id),
      ),
    );
    const error = results.find((r) => r.error)?.error;
    if (!error && col?.is_done) {
      await supabase
        .from("service_orders")
        .update({ delivered_at: nowIso })
        .in("id", cardIds)
        .is("delivered_at", null);
    }
    if (error) {
      if (prev) qc.setQueryData(["kanban-cards"], prev);
      await logger.error(`Erro ao mover vários cards: ${error.message}`, { context: "kanban/moveMany", details: { cardIds, columnId, error } });
    } else {
      toast.success(`${cardIds.length} cards movidos`);
      qc.invalidateQueries({ queryKey: ["kanban-cards"] });
      void checkDeliveryPaymentReminder(cardIds, col?.name);
    }
  };

  // Reordena cards dentro da mesma coluna. beforeCardId = inserir antes desse card
  // (null = colocar no final). Trabalha com IDs individuais; quando um grupo é
  // arrastado, todos os cards do grupo são reposicionados juntos.
  const reorderInColumn = async (
    colId: string,
    movingIds: string[],
    beforeCardId: string | null,
  ) => {
    if (!movingIds.length) return;
    if (beforeCardId && movingIds.includes(beforeCardId)) return;
    const inCol = (cards.data ?? [])
      .filter((c: any) => c.column_id === colId)
      .sort(
        (a: any, b: any) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    if (inCol.length < 2) return;
    const movingSet = new Set(movingIds);
    const moving = inCol.filter((c: any) => movingSet.has(c.id));
    const rest = inCol.filter((c: any) => !movingSet.has(c.id));
    const idx = beforeCardId
      ? rest.findIndex((c: any) => c.id === beforeCardId)
      : rest.length;
    const insertAt = idx < 0 ? rest.length : idx;
    rest.splice(insertAt, 0, ...moving);
    // Atualização otimista do cache: reordena visualmente antes do round-trip
    const newOrderMap = new Map(rest.map((c: any, i: number) => [c.id, (i + 1) * 10]));
    const prev = qc.getQueryData<any[]>(["kanban-cards"]);
    qc.setQueryData<any[]>(["kanban-cards"], (old) =>
      (old ?? []).map((c: any) =>
        newOrderMap.has(c.id) ? { ...c, sort_order: newOrderMap.get(c.id) } : c,
      ),
    );
    const results = await Promise.all(
      rest.map((c: any, i: number) =>
        supabase
          .from("service_orders")
          .update({ sort_order: (i + 1) * 10 })
          .eq("id", c.id),
      ),
    );
    if (results.some((r) => r.error) && prev) {
      qc.setQueryData(["kanban-cards"], prev);
    }
    qc.invalidateQueries({ queryKey: ["kanban-cards"] });
  };

  const transferCard = async (cardId: string, producerId: string) => {
    const { error } = await supabase
      .from("service_orders")
      .update({ producer_id: producerId })
      .eq("id", cardId);
    if (error) {
      await logger.error(`Erro ao transferir card: ${error.message}`, { context: "kanban/transferCard", details: { cardId, producerId, error } });
    } else { 
      toast.success("Serviço transferido"); 
      qc.invalidateQueries({ queryKey: ["kanban-cards"] }); 
    }
  };

  const transferMany = async (cardIds: string[], producerId: string) => {
    const { error } = await supabase
      .from("service_orders")
      .update({ producer_id: producerId })
      .in("id", cardIds);
    if (error) {
      await logger.error(`Erro ao transferir vários cards: ${error.message}`, { context: "kanban/transferMany", details: { cardIds, producerId, error } });
    } else { 
      toast.success(`${cardIds.length} serviços transferidos`); 
      qc.invalidateQueries({ queryKey: ["kanban-cards"] }); 
    }
  };

  const openNew = (column_id: string) => { setEditing(emptyForm(column_id)); setNewLabel(""); };
  const openEdit = (c: any) => {
    setEditing({
      id: c.id, column_id: c.column_id,
      title: c.title ?? "", description: c.description ?? "",
      due_date: c.due_date ?? "", due_time: (c.due_time ?? "").slice(0, 5),
      color: c.color ?? "", labels: c.labels ?? [],
      google_drive_link:
        c.google_drive_link ?? c.sales?.google_drive_link ?? null,
      platform_link: c.platform_link ?? c.sales?.platform_link ?? null,
      sale_id: c.sale_id ?? null,
      customer_phone: c.sales?.customers?.phone ?? null,
      customer_name: c.sales?.customers?.name ?? null,
      producer_id: c.producer_id ?? null,
      expected_delivery_date: c.expected_delivery_date ?? c.sales?.expected_delivery_date ?? null,
      video_duration_seconds:
        (c as any).video_duration_seconds ?? c.sales?.video_duration_seconds ?? null,
      video_duration_input: fmtVideoDuration(
        (c as any).video_duration_seconds ?? c.sales?.video_duration_seconds ?? null,
      ),
    });
    setNewLabel("");
  };

  const saveCard = async () => {
    if (!editing) return;
    if (!editing.title.trim()) { toast.error("Título é obrigatório"); return; }
    const driveRaw = editing.google_drive_link?.trim() || "";
    const platformRaw = editing.platform_link?.trim() || "";
    const durRaw = editing.video_duration_input ?? "";
    const durParsed = parseDurationInput(durRaw);
    if (durRaw.trim() && durParsed === 0) {
      toast.error("Minutagem inválida. Use 2:30, 1:02:30, 2min30s ou 150s.");
      return;
    }
    const isDrive = (u: string) => /(?:drive|docs)\.google\.com|^https?:\/\/[^/]*\.googleusercontent\.com/i.test(u);
    if (driveRaw && !isDrive(driveRaw)) {
      toast.error("O campo 'Link do projeto' deve ser um link do Google Drive (drive.google.com).");
      return;
    }
    if (platformRaw && isDrive(platformRaw)) {
      toast.error("Esse é um link do Google Drive. Cole-o no campo 'Link do projeto', não na Plataforma.");
      return;
    }
    setSaving(true);
    const payload: any = {
      column_id: editing.column_id,
      title: editing.title.trim(),
      description: editing.description || null,
      due_date: editing.due_date || null,
      due_time: editing.due_time || null,
      color: editing.color || null,
      labels: editing.labels,
      google_drive_link: driveRaw || null,
      platform_link: platformRaw || null,
      producer_id: editing.producer_id || null,
      expected_delivery_date: editing.expected_delivery_date || null,
      video_duration_seconds: durParsed,
    };
    try {
      if (editing.id) {
        const { error } = await supabase.from("service_orders").update(payload).eq("id", editing.id);
        if (error) throw error;
        // Auto-vincular pasta da Plataforma somente a partir do link da Plataforma
        try {
          await autoLinkFolderFromUrl(editing.platform_link, {
            saleId: editing.sale_id ?? null,
            kanbanCardId: editing.id,
          });
        } catch (e) { /* não bloqueia o save */ }
        toast.success("Card atualizado");
      } else {
        const { error } = await supabase.from("service_orders").insert({ ...payload, service_index: 1, sort_order: 9999 });
        if (error) throw error;
        toast.success("Card criado");
      }
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["kanban-cards"] });
    } catch (e: any) {
      await logger.error(`Erro ao salvar card: ${e.message}`, { context: "kanban/saveCard", details: { editing, payload, error: e } });
    } finally { setSaving(false); }
  };

  const deleteCard = async () => {
    if (!editing?.id) return;
    if (!confirm("Excluir este card?")) return;
    const { error } = await supabase.from("service_orders").delete().eq("id", editing.id);
    if (error) {
      await logger.error(`Erro ao excluir card: ${error.message}`, { context: "kanban/deleteCard", details: { id: editing.id, error } });
      return;
    }
    toast.success("Card excluído");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["kanban-cards"] });
  };

  const addLabel = () => {
    if (!editing || !newLabel.trim()) return;
    setEditing({ ...editing, labels: [...editing.labels, formatLabel(newLabel.trim(), newLabelColor)] });
    setNewLabel("");
  };
  const removeLabel = (i: number) => {
    if (!editing) return;
    setEditing({ ...editing, labels: editing.labels.filter((_, idx) => idx !== i) });
  };

  const saveColumn = async () => {
    if (!editingColumn) return;
    if (!editingColumn.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSavingColumn(true);
    try {
      if (editingColumn.id) {
        const { error } = await supabase.from("kanban_columns").update({
          name: editingColumn.name.trim(),
          color: editingColumn.color,
          producer_id: editingColumn.producer_id
        }).eq("id", editingColumn.id);
        if (error) throw error;
        toast.success("Coluna atualizada");
      } else {
        const nextOrder = (cols.data?.length ?? 0) > 0 
          ? Math.max(...cols.data!.map((c: any) => c.sort_order)) + 10 
          : 10;
        const { error } = await supabase.from("kanban_columns").insert({
          name: editingColumn.name.trim(),
          color: editingColumn.color,
          sort_order: nextOrder,
          is_default: false,
          is_done: false,
          producer_id: producerFilter !== "all" ? producerFilter : null
        });
        if (error) throw error;
        toast.success("Coluna criada");
      }
      setEditingColumn(null);
      qc.invalidateQueries({ queryKey: ["kanban-cols"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar coluna");
    } finally { setSavingColumn(false); }
  };

  const deleteColumn = async (id: string) => {
    if (!confirm("Excluir esta coluna? Todos os cards nela permanecerão mas podem não aparecer se a coluna sumir. Recomendado mover os cards antes.")) return;
    const { error } = await supabase.from("kanban_columns").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Coluna excluída");
    qc.invalidateQueries({ queryKey: ["kanban-cols"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Produção Trello</h1>
        <p className="text-muted-foreground">Arraste os cards entre as colunas para atualizar o status</p>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button onClick={() => setEditingColumn({ name: "", color: "#64748b" })} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Coluna
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por cliente, serviço, vendedor..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            size="sm"
            variant={producerFilter === "all" ? "default" : "outline"}
            onClick={() => setProducerFilter("all")}
          >
            Todos
          </Button>
          {(producers.data ?? []).map((p: any) => (
            <Button
              key={p.id}
              size="sm"
              variant={producerFilter === p.id ? "default" : "outline"}
              onClick={() => setProducerFilter(p.id)}
              className="whitespace-nowrap gap-2"
            >
              <span className="w-5 h-5 rounded-full bg-muted overflow-hidden border flex items-center justify-center text-[10px] font-bold">
                {p.avatar_url ? <img src={p.avatar_url} alt={p.name} className="w-full h-full object-cover" /> : (p.name?.charAt(0)?.toUpperCase() ?? "?")}
              </span>
              {p.name}
            </Button>
          ))}
        </div>
      </div>

      <div
        ref={topScrollRef}
        className="overflow-x-auto overflow-y-hidden h-3 sticky top-0 z-10 bg-background"
        onScroll={(e) => {
          if (syncingScroll.current === "board") { syncingScroll.current = null; return; }
          syncingScroll.current = "top";
          if (boardRef.current) boardRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div style={{ width: boardScrollWidth, height: 1 }} />
      </div>

      <div
        ref={boardRef}
        className="flex gap-4 overflow-x-auto pb-4"
        onScroll={(e) => {
          if (syncingScroll.current === "top") { syncingScroll.current = null; return; }
          syncingScroll.current = "board";
          if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
        onDragOver={(e) => {
          const el = boardRef.current;
          if (!el) return;
          const r = el.getBoundingClientRect();
          const edge = 80;
          const max = 24;
          let speed = 0;
          if (e.clientX > r.right - edge) {
            speed = Math.min(max, ((e.clientX - (r.right - edge)) / edge) * max);
          } else if (e.clientX < r.left + edge) {
            speed = -Math.min(max, (((r.left + edge) - e.clientX) / edge) * max);
          }
          autoScrollSpeed.current = speed;
          if (speed !== 0 && autoScrollRaf.current == null) {
            const tick = () => {
              const node = boardRef.current;
              if (node && autoScrollSpeed.current !== 0) {
                node.scrollLeft += autoScrollSpeed.current;
                autoScrollRaf.current = requestAnimationFrame(tick);
              } else {
                if (autoScrollRaf.current != null) cancelAnimationFrame(autoScrollRaf.current);
                autoScrollRaf.current = null;
              }
            };
            autoScrollRaf.current = requestAnimationFrame(tick);
          }
        }}
        onDragLeave={() => { autoScrollSpeed.current = 0; }}
        onDrop={() => { autoScrollSpeed.current = 0; }}
        onDragEnd={() => { autoScrollSpeed.current = 0; resetDragState(); }}
      >
        {(cols.data ?? []).map((col: any) => {
          const q = search.trim().toLowerCase();
          const colCards = (cards.data ?? []).filter((c: any) => {
            if (c.column_id !== col.id) return false;
            
            // Quando há pesquisa ativa, ignora o filtro de produtor
            // para também trazer serviços entregues (e quaisquer cards
            // sem produtor atribuído) nos resultados.
            if (producerFilter !== "all" && !q) {
              const cardProducerId = c.producer_id;
              const saleProducerId = c.sales?.producer_id;
              
              if (cardProducerId) {
                if (cardProducerId !== producerFilter) return false;
              } else if (saleProducerId) {
                if (saleProducerId !== producerFilter) return false;
              } else {
                return false;
              }
            }

            if (q) {
              const hay = [
                c.title, c.description,
                c.sales?.customers?.name, c.sales?.customers?.company,
                c.sales?.sellers?.name,
                c.producer?.name, c.sales?.producers?.name,
                ...(c.labels ?? []),
              ].filter(Boolean).join(" ").toLowerCase();
              if (!hay.includes(q)) return false;
            }
            return true;
          });
          // Ordena pela posição manual (sort_order). Como `move` define
          // sort_order = -Date.now() ao mover, os mais recentes ficam no topo
          // (essencial para a coluna "Serviços Entregues").
          colCards.sort((a: any, b: any) =>
            (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
          // Group by sale_id (same customer/sale = same package). Cards without sale_id stay solo.
          const groupsMap = new Map<string, any[]>();
          const soloCards: any[] = [];
          for (const c of colCards) {
            if (c.sale_id) {
              const arr = groupsMap.get(c.sale_id) ?? [];
              arr.push(c);
              groupsMap.set(c.sale_id, arr);
            } else {
              soloCards.push(c);
            }
          }
          type Item = { kind: "solo"; card: any } | { kind: "group"; saleId: string; cards: any[] };
          const items: Item[] = [];
          for (const [saleId, arr] of groupsMap) {
            if (arr.length > 1) items.push({ kind: "group", saleId, cards: arr });
            else items.push({ kind: "solo", card: arr[0] });
          }
          for (const c of soloCards) items.push({ kind: "solo", card: c });
          return (
            <div
              key={col.id}
              className="min-w-[280px] w-[280px] flex-shrink-0 rounded-lg border-2 border-foreground bg-muted p-3 shadow-md overflow-hidden"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const targetCol = cols.data?.find((c: any) => c.id === col.id);
                if (!targetCol) { resetDragState(); return; }
                const movingIds = draggingGroup && draggingGroup.length
                  ? draggingGroup
                  : dragging ? [dragging] : [];
                if (!movingIds.length) { resetDragState(); return; }
                if (draggingFromCol === col.id) {
                  safeMutate(() => reorderInColumn(col.id, movingIds, null));
                } else if (draggingGroup && draggingGroup.length) {
                  safeMutate(() => moveMany(draggingGroup, col.id));
                } else if (dragging) {
                  safeMutate(() => move(dragging, col.id));
                } else {
                  resetDragState();
                }
              }}
            >
              <div className="flex items-center justify-between px-4 py-3 rounded-t-md bg-foreground text-background -m-3 mb-3">
                <div className="flex items-center gap-2 overflow-hidden mr-1">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="font-semibold text-sm truncate">{col.name}</span>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-5 w-5 text-background/50 hover:text-background hover:bg-background/10"
                    onClick={() => setEditingColumn({ id: col.id, name: col.name, color: col.color })}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="border-background/40 text-background">
                    {colCards.length}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-background hover:bg-background/10 hover:text-background" onClick={() => openNew(col.id)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {items.map((it) => {
                  if (it.kind === "group") {
                    const groupKey = `${col.id}:${it.saleId}`;
                    const isOpen = !!expandedGroups[groupKey];
                    const first = it.cards[0];
                    const customerName = first.sales?.customers?.name ?? "Cliente";
                    const company = first.sales?.customers?.company;
                    return (
                      <div
                        key={groupKey}
                        className="space-y-2"
                        onDragOver={(e) => {
                          if (draggingFromCol === col.id) {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                        onDrop={(e) => {
                          if (draggingFromCol !== col.id) { resetDragState(); return; }
                          e.preventDefault();
                          e.stopPropagation();
                          const movingIds = draggingGroup && draggingGroup.length
                            ? draggingGroup
                            : dragging ? [dragging] : [];
                          if (movingIds.length && !movingIds.includes(first.id)) {
                            safeMutate(() => reorderInColumn(col.id, movingIds, first.id));
                          } else {
                            resetDragState();
                          }
                        }}
                      >
                        {(first.sales?.payment_status === "pago_parcial" || (first as any).video_duration_seconds || first.sales?.video_duration_seconds) && (
                          <div className="flex justify-end gap-1 flex-wrap">
                            {((first as any).video_duration_seconds || first.sales?.video_duration_seconds) ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm" style={{ background: "#3b82f6", color: "#fff" }}>
                                🎬 {fmtVideoDuration((first as any).video_duration_seconds ?? first.sales?.video_duration_seconds)}
                              </span>
                            ) : null}
                            {first.sales?.payment_status === "pago_parcial" && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm" style={{ background: "#f59e0b", color: "#1a1a1a" }}>
                                A receber: {formatCurrency(Number(first.sales.total_amount ?? 0) - Number(first.sales.paid_amount ?? 0))}
                              </span>
                            )}
                          </div>
                        )}
                        <Card
                          draggable
                          onDragStart={() => { setDraggingGroup(it.cards.map((x: any) => x.id)); setDraggingFromCol(col.id); setDragMoved(false); }}
                          onDrag={() => setDragMoved(true)}
                          onDragEnd={() => { setDraggingGroup(null); setDraggingFromCol(null); setTimeout(() => setDragMoved(false), 0); }}
                          onClick={() => { if (!dragMoved) setExpandedGroups((s) => ({ ...s, [groupKey]: !s[groupKey] })); }}
                          className="cursor-grab active:cursor-grabbing bg-background hover:border-primary/70 transition-all overflow-hidden border-2 border-foreground/15 shadow-md"
                          style={{ boxShadow: "var(--shadow-card)", borderLeft: `4px solid ${col.color || "var(--primary)"}` }}>
                          <CardContent className="p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                <Layers className="w-4 h-4 text-primary" />
                                <span className="text-sm font-medium">{customerName}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                                      <UserPlus className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuLabel>Transferir Pacote</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {(producers.data ?? []).map((p: any) => (
                                      <DropdownMenuItem key={p.id} onClick={(e) => { e.stopPropagation(); transferMany(it.cards.map((x: any) => x.id), p.id); }}>
                                        {p.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Badge variant="secondary" className="text-[10px]">{it.cards.length} serviços</Badge>
                              </div>
                            </div>
                            {company && <div className="text-xs text-muted-foreground pl-6">{company}</div>}
                            <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground pl-6">
                              <span>Vendedor: <span className="font-semibold text-success" style={{}}>{first.sales?.sellers?.name ?? "—"}</span></span>
                              <div className="flex items-center gap-1">
                                <span>Produtor: <span className="font-semibold text-success" style={{}}>{first.producer?.name ?? first.sales?.producers?.name ?? "—"}</span></span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="text-primary hover:underline ml-1" onClick={(e) => e.stopPropagation()}>
                                      <UserPlus className="w-3 h-3" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="w-48">
                                    <DropdownMenuLabel>Transferir Pacote</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {(producers.data ?? []).map((p: any) => (
                                      <DropdownMenuItem key={p.id} onClick={(e: any) => { e.stopPropagation(); transferMany(it.cards.map((x: any) => x.id), p.id); }}>
                                        {p.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                            {first.sales?.payment_status && (
                              <div className="pl-6 pt-1">
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                                  style={{
                                    background: paymentStyle(first.sales.payment_status).bg,
                                    color: paymentStyle(first.sales.payment_status).fg,
                                  }}
                                >
                                  {paymentStyle(first.sales.payment_status).label}
                                </span>
                              </div>
                            )}
                            <CardLinkButtons
                              driveLink={first.google_drive_link ?? first.sales?.google_drive_link ?? null}
                              platformLink={first.platform_link ?? first.sales?.platform_link ?? null}
                            />
                          </CardContent>
                        </Card>
                        {isOpen && it.cards.map((c: any) => {
                          const phone = c.sales?.customers?.phone;
                          const waUrl = waHref(phone, `Olá ${c.sales?.customers?.name ?? ""}!`.trim());
                          return (
                          <div key={c.id} className="relative ml-4">
                          {waUrl && (
                            <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigator.clipboard.writeText(formatPhoneBR(phone)).then(
                                  () => toast.success(`Número copiado: ${formatPhoneBR(phone)}`),
                                  () => toast.error("Não foi possível copiar")
                                );
                              }}
                              className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#25D366] text-white shadow-md hover:scale-110 transition-transform"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                              </TooltipTrigger>
                              <TooltipContent side="top">Abrir WhatsApp</TooltipContent>
                            </Tooltip>
                            </TooltipProvider>
                          )}
                          {waUrl && (
                            <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigator.clipboard.writeText(formatPhoneBR(phone)).then(
                                  () => toast.success(`Número copiado: ${formatPhoneBR(phone)}`),
                                  () => toast.error("Não foi possível copiar")
                                );
                              }}
                              className="absolute top-2 right-10 z-10 inline-flex items-center justify-center w-6 h-6 rounded-full bg-foreground/80 text-background shadow-md hover:scale-110 transition-transform"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Copiar número</TooltipContent>
                            </Tooltip>
                            </TooltipProvider>
                          )}
                          <Card draggable
                            onDragStart={() => { setDragging(c.id); setDraggingFromCol(col.id); setDragMoved(false); }}
                            onDrag={() => setDragMoved(true)}
                            onDragEnd={() => { setDragging(null); setDraggingFromCol(null); setTimeout(() => setDragMoved(false), 0); }}
                            onClick={() => { if (!dragMoved) openEdit(c); }}
                            className="cursor-pointer bg-background hover:border-primary/70 transition-all overflow-hidden border-2 border-foreground/15 shadow-md"
                            style={{
                              boxShadow: "var(--shadow-card)",
                              borderLeft: `4px solid ${col.color || "var(--primary)"}`,
                            }}>
                            <CardContent className="p-3 space-y-2">
                              {(c.labels?.length ?? 0) > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {c.labels.map((raw: string, i: number) => {
                                    const { name, color } = parseLabel(raw);
                                    return (
                                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                        style={{ background: color || "color-mix(in oklab, var(--primary) calc(0.15 * 100%), transparent)", color: color ? "#fff" : "var(--primary)" }}>
                                        {name}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              <div className="text-sm font-medium leading-tight">
                                {c.title}
                                {isOverdue(c.due_date, c.due_time) && !col.is_done && (
                                  <div className="flex items-center gap-1 text-[10px] font-bold text-destructive uppercase animate-pulse">
                                    <AlertCircle className="w-3 h-3" /> Atrasado
                                  </div>
                                )}
                              </div>
                              {(c.due_date || c.due_time || c.expected_delivery_date || c.sales?.expected_delivery_date) && (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                  {c.due_date && (<span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Prazo: {fmtDate(c.due_date)}</span>)}
                                  {(c.expected_delivery_date || c.sales?.expected_delivery_date) && (
                                    <span className="flex items-center gap-1 text-primary font-medium">
                                      <Calendar className="w-3 h-3" /> Entrega: {fmtDate(c.expected_delivery_date || c.sales?.expected_delivery_date)}
                                    </span>
                                  )}
                                  {c.due_time && (<span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.due_time.slice(0, 5)}</span>)}
                                </div>
                              )}
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex flex-col gap-0.5 text-muted-foreground">
                                  <span>Vendedor: <span className="font-semibold text-success" style={{}}>{c.sales?.sellers?.name ?? "—"}</span></span>
                                  <div className="flex items-center gap-1">
                                    <span>Produtor: <span className="font-semibold text-success" style={{}}>{c.producer?.name ?? c.sales?.producers?.name ?? "—"}</span></span>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button className="text-primary hover:underline ml-1" onClick={(e) => e.stopPropagation()}>
                                          <UserPlus className="w-3 h-3" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="start" className="w-48">
                                        <DropdownMenuLabel>Transferir Serviço</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {(producers.data ?? []).map((p: any) => (
                                          <DropdownMenuItem key={p.id} onClick={(e: any) => { e.stopPropagation(); transferCard(c.id, p.id); }}>
                                            {p.name}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                                {c.sales?.payment_status && (
                                  <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                                    style={{
                                      background: paymentStyle(c.sales.payment_status).bg,
                                      color: paymentStyle(c.sales.payment_status).fg,
                                    }}
                                  >
                                    {paymentStyle(c.sales.payment_status).label}
                                  </span>
                                )}
                              </div>
                              <CardLinkButtons
                                driveLink={c.google_drive_link ?? c.sales?.google_drive_link ?? null}
                                platformLink={c.platform_link ?? c.sales?.platform_link ?? null}
                              />
                            </CardContent>
                          </Card>
                          </div>
                          );
                        })}
                      </div>
                    );
                  }
                  const c = it.card;
                  return (
                    <div
                      key={c.id}
                      className="space-y-1"
                      onDragOver={(e) => {
                        if (draggingFromCol === col.id) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      onDrop={(e) => {
                        if (draggingFromCol !== col.id) { resetDragState(); return; }
                        e.preventDefault();
                        e.stopPropagation();
                        const movingIds = draggingGroup && draggingGroup.length
                          ? draggingGroup
                          : dragging ? [dragging] : [];
                        if (movingIds.length && !movingIds.includes(c.id)) {
                          safeMutate(() => reorderInColumn(col.id, movingIds, c.id));
                        } else {
                          resetDragState();
                        }
                      }}
                    >
                    {(c.sales?.payment_status === "pago_parcial" || c.sales?.video_duration_seconds) && (
                      <div className="flex justify-end gap-1 flex-wrap">
                        {c.sales?.video_duration_seconds ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm" style={{ background: "#3b82f6", color: "#fff" }}>
                            🎬 {fmtVideoDuration(c.sales.video_duration_seconds)}
                          </span>
                        ) : null}
                        {c.sales?.payment_status === "pago_parcial" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm" style={{ background: "#f59e0b", color: "#1a1a1a" }}>
                            A receber: {formatCurrency(Number(c.sales.total_amount ?? 0) - Number(c.sales.paid_amount ?? 0))}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="relative">
                    {(() => {
                      const phone = c.sales?.customers?.phone;
                      const waUrl = waHref(phone, `Olá ${c.sales?.customers?.name ?? ""}!`.trim());
                      if (!waUrl) return null;
                      return (
                        <>
                        <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigator.clipboard.writeText(formatPhoneBR(phone)).then(
                              () => toast.success(`Número copiado: ${formatPhoneBR(phone)}`),
                              () => toast.error("Não foi possível copiar")
                            );
                          }}
                          className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#25D366] text-white shadow-md hover:scale-110 transition-transform"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                          </TooltipTrigger>
                          <TooltipContent side="top">Abrir WhatsApp</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigator.clipboard.writeText(formatPhoneBR(phone)).then(
                              () => toast.success(`Número copiado: ${formatPhoneBR(phone)}`),
                              () => toast.error("Não foi possível copiar")
                            );
                          }}
                          className="absolute top-2 right-10 z-10 inline-flex items-center justify-center w-6 h-6 rounded-full bg-foreground/80 text-background shadow-md hover:scale-110 transition-transform"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">Copiar número</TooltipContent>
                        </Tooltip>
                        </TooltipProvider>
                        </>
                      );
                    })()}
                    <Card draggable
                    onDragStart={() => { setDragging(c.id); setDraggingFromCol(col.id); setDragMoved(false); }}
                    onDrag={() => setDragMoved(true)}
                    onDragEnd={() => { setDragging(null); setDraggingFromCol(null); setTimeout(() => setDragMoved(false), 0); }}
                    onClick={() => { if (!dragMoved) openEdit(c); }}
                    className="cursor-pointer bg-background hover:border-primary/70 transition-all overflow-hidden border-2 border-foreground/15 shadow-md"
                    style={{
                      boxShadow: "var(--shadow-card)",
                      borderLeft: `4px solid ${col.color || "var(--primary)"}`,
                    }}>
                    <CardContent className="p-3 space-y-2">
                      {(c.labels?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.labels.map((raw: string, i: number) => {
                            const { name, color } = parseLabel(raw);
                            return (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{ background: color || "color-mix(in oklab, var(--primary) calc(0.15 * 100%), transparent)", color: color ? "#fff" : "var(--primary)" }}>
                                {name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="text-sm font-medium leading-tight">
                        {c.title}
                        {isOverdue(c.due_date, c.due_time) && !col.is_done && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-destructive uppercase animate-pulse">
                            <AlertCircle className="w-3 h-3" /> Atrasado
                          </div>
                        )}
                      </div>
                      {c.sales?.customers?.company && (
                        <div className="text-xs text-muted-foreground">{c.sales.customers.company}</div>
                      )}
                      {(c.due_date || c.due_time || c.expected_delivery_date || c.sales?.expected_delivery_date) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {c.due_date && (<span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Prazo: {fmtDate(c.due_date)}</span>)}
                          {(c.expected_delivery_date || c.sales?.expected_delivery_date) && (
                            <span className="flex items-center gap-1 text-primary font-medium">
                              <Calendar className="w-3 h-3" /> Entrega: {fmtDate(c.expected_delivery_date || c.sales?.expected_delivery_date)}
                            </span>
                          )}
                          {c.due_time && (<span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.due_time.slice(0, 5)}</span>)}
                        </div>
                      )}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex flex-col gap-0.5 text-muted-foreground">
                            <span>Vendedor: <span className="font-semibold text-success" style={{}}>{c.sales?.sellers?.name ?? "—"}</span></span>
                            <div className="flex items-center gap-1">
                              <span>Produtor: <span className="font-semibold text-success" style={{}}>{c.producer?.name ?? c.sales?.producers?.name ?? "—"}</span></span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="text-primary hover:underline ml-1" onClick={(e) => e.stopPropagation()}>
                                    <UserPlus className="w-3 h-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                  <DropdownMenuLabel>Transferir Serviço</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {(producers.data ?? []).map((p: any) => (
                                    <DropdownMenuItem key={p.id} onClick={(e: any) => { e.stopPropagation(); transferCard(c.id, p.id); }}>
                                      {p.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        {c.sales?.payment_status && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                            style={{
                              background: paymentStyle(c.sales.payment_status).bg,
                              color: paymentStyle(c.sales.payment_status).fg,
                            }}
                          >
                            {paymentStyle(c.sales.payment_status).label}
                          </span>
                        )}
                      </div>
                      <CardLinkButtons
                        driveLink={c.google_drive_link ?? c.sales?.google_drive_link ?? null}
                        platformLink={c.platform_link ?? c.sales?.platform_link ?? null}
                      />
                    </CardContent>
                  </Card>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar card" : "Novo card"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Título *</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>Descrição</Label><Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Coluna</Label>
                  <Select value={editing.column_id} onValueChange={(v) => setEditing({ ...editing, column_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{(cols.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Cor do card</Label>
                  <Select value={editing.color || "_none"} onValueChange={(v) => setEditing({ ...editing, color: v === "_none" ? "" : v })}>
                    <SelectTrigger>
                      <div className="flex items-center gap-2">
                        {editing.color && <span className="w-3 h-3 rounded-full" style={{ background: editing.color }} />}
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_COLORS.map((c) => (
                        <SelectItem key={c.value || "_none"} value={c.value || "_none"}>
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full border" style={{ background: c.value || "transparent" }} />
                            {c.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Prazo Interno</Label><Input type="date" value={editing.due_date} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} /></div>
                <div><Label>Horário</Label><Input type="time" value={editing.due_time} onChange={(e) => setEditing({ ...editing, due_time: e.target.value })} /></div>
                <div className="col-span-2"><Label className="text-primary">Data de Entrega (Sincronizada da Venda)</Label><Input type="date" value={editing.expected_delivery_date || ""} onChange={(e) => setEditing({ ...editing, expected_delivery_date: e.target.value })} /></div>
              </div>
              <div>
                <Label>Produtor</Label>
                <Select
                  value={editing.producer_id || "_none"}
                  onValueChange={(v) => setEditing({ ...editing, producer_id: v === "_none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecionar produtor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhum</SelectItem>
                    {(producers.data ?? []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Link do projeto</Label>
                <Input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={editing.google_drive_link ?? ""}
                  onChange={(e) => setEditing({ ...editing, google_drive_link: e.target.value })}
                />
                {editing.google_drive_link && (
                  <a href={editing.google_drive_link} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-500 hover:underline break-all mt-1">
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    Abrir Google Drive
                  </a>
                )}
              </div>
              <div>
                <Label>Minutagem do vídeo (deste card)</Label>
                <Input
                  type="text"
                  placeholder="Ex: 2:30, 1:02:30, 2min30s ou 150s"
                  value={editing.video_duration_input ?? ""}
                  onChange={(e) => setEditing({ ...editing, video_duration_input: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1 opacity-70">
                  Cada vídeo do pacote pode ter sua própria minutagem. Deixe em branco para herdar da venda.
                </p>
              </div>
              <div>
                <Label>Link da pasta da plataforma</Label>
                <Input
                  type="url"
                  placeholder="https://.../pastas-arquivos/..."
                  value={editing.platform_link ?? ""}
                  onChange={(e) => setEditing({ ...editing, platform_link: e.target.value })}
                />
                {editing.platform_link ? (
                  <a href={editing.platform_link} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-red-500 hover:underline break-all mt-1">
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    Abrir na Plataforma
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1 opacity-60">
                    Cole o link da pasta da plataforma para ativar o botão
                  </p>
                )}
              </div>
              {editing.customer_phone && waHref(editing.customer_phone) && (
                <div>
                  <Label>Cliente</Label>
                  <a
                    href={waHref(editing.customer_phone, `Olá ${editing.customer_name ?? ""}!`.trim())!}
                    target="_blank" rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp {formatPhoneBR(editing.customer_phone)}
                  </a>
                </div>
              )}
              <div>
                <Label>Etiquetas</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }}
                    placeholder="Nova etiqueta…" />
                  <Button type="button" variant="outline" onClick={addLabel}>Adicionar</Button>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[11px] text-muted-foreground mr-1">Cor:</span>
                  {LABEL_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setNewLabelColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition-all ${newLabelColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ background: c }} aria-label={c} />
                  ))}
                </div>
                {editing.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {editing.labels.map((raw, i) => {
                      const { name, color } = parseLabel(raw);
                      return (
                        <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded font-medium"
                          style={{ background: color || "var(--muted)", color: color ? "#fff" : "var(--foreground)" }}>
                          {name}
                          <button type="button" onClick={() => removeLabel(i)}
                            className="hover:opacity-70" style={{ color: color ? "#fff" : undefined }}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {editing?.id && (
              <Button variant="destructive" onClick={deleteCard} className="mr-auto">
                <Trash2 className="w-4 h-4 mr-2" />Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveCard} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingColumn} onOpenChange={(o) => !o && setEditingColumn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingColumn?.id ? "Editar Coluna" : "Nova Coluna"}</DialogTitle>
          </DialogHeader>
          {editingColumn && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome da Coluna</Label>
                <Input 
                  value={editingColumn.name} 
                  onChange={(e) => setEditingColumn({ ...editingColumn, name: e.target.value })}
                  placeholder="Ex: Em Revisão"
                />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981", "#3b82f6", "#a855f7", "#ec4899", "#64748b"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 transition-all ${editingColumn.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ background: c }}
                      onClick={() => setEditingColumn({ ...editingColumn, color: c })}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between sm:justify-between w-full">
            {editingColumn?.id && (
              <Button 
                variant="destructive" 
                onClick={() => {
                  deleteColumn(editingColumn.id!);
                  setEditingColumn(null);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Excluir
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setEditingColumn(null)}>Cancelar</Button>
              <Button onClick={saveColumn} disabled={savingColumn}>
                {savingColumn && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardLinkButtons({
  driveLink,
  platformLink,
}: {
  driveLink?: string | null;
  platformLink?: string | null;
}) {
  const hasDrive = !!driveLink;
  const hasPlatform = !!platformLink;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="flex items-center gap-1 pt-1 border-t border-dashed" onClick={stop}>
      {hasDrive ? (
        <a
          href={driveLink!}
          target="_blank"
          rel="noreferrer"
          onClick={stop}
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition whitespace-nowrap"
        >
          <LinkIcon className="w-3 h-3 shrink-0" /> <span className="truncate">Google Drive</span>
        </a>
      ) : (
        <span
          aria-disabled
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-blue-600/20 text-blue-700 dark:text-blue-300 opacity-50 cursor-not-allowed whitespace-nowrap"
          title="Sem link do Google Drive"
        >
          <LinkIcon className="w-3 h-3 shrink-0" /> <span className="truncate">Google Drive</span>
        </span>
      )}
      {hasPlatform ? (
        <a
          href={platformLink!}
          target="_blank"
          rel="noreferrer"
          onClick={stop}
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition whitespace-nowrap"
        >
          <FolderOpen className="w-3 h-3 shrink-0" /> <span className="truncate">Plataforma</span>
        </a>
      ) : (
        <span
          aria-disabled
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-red-600/20 text-red-700 dark:text-red-300 opacity-50 cursor-not-allowed whitespace-nowrap"
          title="Sem link da Plataforma"
        >
          <FolderOpen className="w-3 h-3 shrink-0" /> <span className="truncate">Plataforma</span>
        </span>
      )}
    </div>
  );
}
