import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { formatCurrency, formatVideoDuration } from "@/lib/format";
import { useAuth, isAdmin as isAdminRole } from "@/lib/auth";
import { autoLinkFolderFromUrl } from "@/lib/project-folders";
import { KanbanHeader } from "@/components/kanban/kanban-header";
import { KanbanFilters } from "@/components/kanban/kanban-filters";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { CardEditDialog } from "@/components/kanban/card-edit-dialog";
import { ColumnEditDialog, type EditingColumnState } from "@/components/kanban/column-edit-dialog";
import {
  emptyForm,
  formatLabel,
  parseDurationInput,
  type CardForm,
  type KanbanCardData,
  type KanbanColumnData,
  type ProducerOption,
} from "@/components/kanban/types";

const fmtVideoDuration = formatVideoDuration;

// Lembrete de baixa de pagamento — ao mover card(s) para a coluna "Serviços Entregues",
// busca a venda relacionada e, se ainda houver saldo em aberto, mostra um toast com link
// para a tela de Vendas pré-filtrada por aquele cliente.
async function checkDeliveryPaymentReminder(cardIds: string[], columnName?: string | null) {
  if (!columnName || !/entreg/i.test(columnName)) return;
  if (cardIds.length === 0) return;
  const { data: orders } = await supabase
    .from("service_orders")
    .select(
      "id,sale_id,sales(id,customer_id,total_amount,paid_amount,payment_status,customers(name))",
    )
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

export const Route = createFileRoute("/_authenticated/kanban")({
  component: KanbanPage,
  validateSearch: (s: Record<string, unknown>) => ({
    card: typeof s.card === "string" ? s.card : undefined,
  }),
});

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
  const [newLabelColor, setNewLabelColor] = useState<string>("#ef4444");
  const [saving, setSaving] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [producerFilter, setProducerFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [editingColumn, setEditingColumn] = useState<EditingColumnState | null>(null);
  const [savingColumn, setSavingColumn] = useState(false);
  const { roles } = useAuth();
  const canTransferProducer = isAdminRole(roles);

  const producers = useQuery({
    queryKey: ["producers-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producers")
        .select("id,name,avatar_url,custom_kanban_columns")
        .eq("active", true)
        .order("name");
      if (error) {
        toast.error("Erro ao carregar produtores");
        throw error;
      }
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
        .select(
          "*, producer:producers!service_orders_producer_id_fkey(name), sales(total_amount, paid_amount, payment_status, trello_link, google_drive_link, platform_link, producer_id, expected_delivery_date, video_duration_seconds, customers(name,company,phone), sellers(name), producers(name))",
        )
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
      id: found.id,
      column_id: found.column_id,
      title: found.title ?? "",
      description: found.description ?? "",
      due_date: found.due_date ?? "",
      due_time: (found.due_time ?? "").slice(0, 5),
      color: found.color ?? "",
      labels: found.labels ?? [],
      google_drive_link: (found as any).google_drive_link ?? found.sales?.google_drive_link ?? null,
      platform_link: (found as any).platform_link ?? found.sales?.platform_link ?? null,
      sale_id: found.sale_id ?? null,
      customer_phone: found.sales?.customers?.phone ?? null,
      customer_name: found.sales?.customers?.name ?? null,
      producer_id: found.producer_id ?? null,
      expected_delivery_date:
        found.expected_delivery_date ?? found.sales?.expected_delivery_date ?? null,
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
      await logger.error(`Falha no drag-and-drop: ${e?.message ?? e}`, {
        context: "kanban/safeMutate",
        details: { error: e },
      });
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
          ? {
              ...c,
              column_id: columnId,
              sort_order: newSort,
              delivered_at: col?.is_done && !c.delivered_at ? nowIso : c.delivered_at,
            }
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
      await logger.error(`Erro ao mover card: ${error.message}`, {
        context: "kanban/move",
        details: { cardId, columnId, error },
      });
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
          ? {
              ...c,
              column_id: columnId,
              sort_order: orderMap.get(c.id) ?? c.sort_order,
              delivered_at: col?.is_done && !c.delivered_at ? nowIso : c.delivered_at,
            }
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
      await logger.error(`Erro ao mover vários cards: ${error.message}`, {
        context: "kanban/moveMany",
        details: { cardIds, columnId, error },
      });
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
    const idx = beforeCardId ? rest.findIndex((c: any) => c.id === beforeCardId) : rest.length;
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
    if (!canTransferProducer) {
      toast.error("Somente o admin pode transferir serviços. Procure seu admin.");
      return;
    }
    const { data: so, error: soErr } = await supabase
      .from("service_orders")
      .update({ producer_id: producerId })
      .eq("id", cardId)
      .select("sale_id")
      .maybeSingle();
    if (soErr) {
      await logger.error(`Erro ao transferir card: ${soErr.message}`, {
        context: "kanban/transferCard",
        details: { cardId, producerId, error: soErr },
      });
    } else {
      if (so?.sale_id) {
        const { error: saleErr } = await supabase
          .from("sales")
          .update({ producer_id: producerId })
          .eq("id", so.sale_id);
        if (saleErr) {
          await logger.error(`Erro ao transferir venda/comissão: ${saleErr.message}`, {
            context: "kanban/transferCard",
            details: { cardId, producerId, saleErr },
          });
          toast.error("Card transferido, mas falha ao mover a comissão.");
        } else {
          toast.success("Serviço e comissão transferidos");
        }
      } else {
        toast.success("Serviço transferido");
      }
      qc.invalidateQueries({ queryKey: ["kanban-cards"] });
      qc.invalidateQueries({ queryKey: ["commissions-sales"] });
      qc.invalidateQueries({ queryKey: ["commissions-delivered-sales"] });
    }
  };

  const transferMany = async (cardIds: string[], producerId: string) => {
    if (!canTransferProducer) {
      toast.error("Somente o admin pode transferir serviços. Procure seu admin.");
      return;
    }
    const { data: sos, error } = await supabase
      .from("service_orders")
      .update({ producer_id: producerId })
      .in("id", cardIds)
      .select("sale_id");
    if (error) {
      await logger.error(`Erro ao transferir vários cards: ${error.message}`, {
        context: "kanban/transferMany",
        details: { cardIds, producerId, error },
      });
    } else {
      const saleIds = Array.from(new Set((sos ?? []).map((r: any) => r.sale_id).filter(Boolean)));
      if (saleIds.length > 0) {
        const { error: saleErr } = await supabase
          .from("sales")
          .update({ producer_id: producerId })
          .in("id", saleIds);
        if (saleErr) {
          await logger.error(`Erro ao transferir vendas/comissões: ${saleErr.message}`, {
            context: "kanban/transferMany",
            details: { saleIds, producerId, saleErr },
          });
          toast.error("Cards transferidos, mas falha ao mover comissões.");
        } else {
          toast.success(`${cardIds.length} serviços e comissões transferidos`);
        }
      } else {
        toast.success(`${cardIds.length} serviços transferidos`);
      }
      qc.invalidateQueries({ queryKey: ["kanban-cards"] });
      qc.invalidateQueries({ queryKey: ["commissions-sales"] });
      qc.invalidateQueries({ queryKey: ["commissions-delivered-sales"] });
    }
  };

  const openNew = (column_id: string) => {
    setEditing(emptyForm(column_id));
    setNewLabel("");
  };
  const openEdit = (c: any) => {
    setEditing({
      id: c.id,
      column_id: c.column_id,
      title: c.title ?? "",
      description: c.description ?? "",
      due_date: c.due_date ?? "",
      due_time: (c.due_time ?? "").slice(0, 5),
      color: c.color ?? "",
      labels: c.labels ?? [],
      google_drive_link: c.google_drive_link ?? c.sales?.google_drive_link ?? null,
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
    if (!editing.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    const driveRaw = editing.google_drive_link?.trim() || "";
    const platformRaw = editing.platform_link?.trim() || "";
    const durRaw = editing.video_duration_input ?? "";
    const durParsed = parseDurationInput(durRaw);
    if (durRaw.trim() && durParsed === 0) {
      toast.error("Minutagem inválida. Use 2:30, 1:02:30, 2min30s ou 150s.");
      return;
    }
    const isDrive = (u: string) =>
      /(?:drive|docs)\.google\.com|^https?:\/\/[^/]*\.googleusercontent\.com/i.test(u);
    if (driveRaw && !isDrive(driveRaw)) {
      toast.error("O campo 'Link do projeto' deve ser um link do Google Drive (drive.google.com).");
      return;
    }
    if (platformRaw && isDrive(platformRaw)) {
      toast.error(
        "Esse é um link do Google Drive. Cole-o no campo 'Link do projeto', não na Plataforma.",
      );
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
      producer_id: canTransferProducer ? editing.producer_id || null : undefined,
      expected_delivery_date: editing.expected_delivery_date || null,
      video_duration_seconds: durParsed,
    };
    if (payload.producer_id === undefined) delete payload.producer_id;
    try {
      if (editing.id) {
        const { error } = await supabase
          .from("service_orders")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        // Auto-vincular pasta da Plataforma somente a partir do link da Plataforma
        try {
          await autoLinkFolderFromUrl(editing.platform_link, {
            saleId: editing.sale_id ?? null,
            kanbanCardId: editing.id,
          });
        } catch (e) {
          /* não bloqueia o save */
        }
        toast.success("Card atualizado");
      } else {
        const { error } = await supabase
          .from("service_orders")
          .insert({ ...payload, service_index: 1, sort_order: 9999 });
        if (error) throw error;
        toast.success("Card criado");
      }
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["kanban-cards"] });
    } catch (e: any) {
      await logger.error(`Erro ao salvar card: ${e.message}`, {
        context: "kanban/saveCard",
        details: { editing, payload, error: e },
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async () => {
    if (!editing?.id) return;
    if (!confirm("Excluir este card?")) return;
    const { error } = await supabase.from("service_orders").delete().eq("id", editing.id);
    if (error) {
      await logger.error(`Erro ao excluir card: ${error.message}`, {
        context: "kanban/deleteCard",
        details: { id: editing.id, error },
      });
      return;
    }
    toast.success("Card excluído");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["kanban-cards"] });
  };

  const addLabel = () => {
    if (!editing || !newLabel.trim()) return;
    setEditing({
      ...editing,
      labels: [...editing.labels, formatLabel(newLabel.trim(), newLabelColor)],
    });
    setNewLabel("");
  };
  const removeLabel = (i: number) => {
    if (!editing) return;
    setEditing({ ...editing, labels: editing.labels.filter((_, idx) => idx !== i) });
  };

  const saveColumn = async () => {
    if (!editingColumn) return;
    if (!editingColumn.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSavingColumn(true);
    try {
      if (editingColumn.id) {
        const { error } = await supabase
          .from("kanban_columns")
          .update({
            name: editingColumn.name.trim(),
            color: editingColumn.color,
            producer_id: editingColumn.producer_id,
          })
          .eq("id", editingColumn.id);
        if (error) throw error;
        toast.success("Coluna atualizada");
      } else {
        const nextOrder =
          (cols.data?.length ?? 0) > 0
            ? Math.max(...cols.data!.map((c: any) => c.sort_order)) + 10
            : 10;
        const { error } = await supabase.from("kanban_columns").insert({
          name: editingColumn.name.trim(),
          color: editingColumn.color,
          sort_order: nextOrder,
          is_default: false,
          is_done: false,
          producer_id: producerFilter !== "all" ? producerFilter : null,
        });
        if (error) throw error;
        toast.success("Coluna criada");
      }
      setEditingColumn(null);
      qc.invalidateQueries({ queryKey: ["kanban-cols"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar coluna");
    } finally {
      setSavingColumn(false);
    }
  };

  const deleteColumn = async (id: string) => {
    if (
      !confirm(
        "Excluir esta coluna? Todos os cards nela permanecerão mas podem não aparecer se a coluna sumir. Recomendado mover os cards antes.",
      )
    )
      return;
    const { error } = await supabase.from("kanban_columns").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Coluna excluída");
    qc.invalidateQueries({ queryKey: ["kanban-cols"] });
  };

  const producersData: ProducerOption[] = (producers.data ?? []) as unknown as ProducerOption[];
  const colsData: KanbanColumnData[] = cols.data ?? [];
  const cardsData: KanbanCardData[] = (cards.data ?? []) as unknown as KanbanCardData[];

  return (
    <div className="space-y-6">
      <KanbanHeader onNewColumn={() => setEditingColumn({ name: "", color: "#64748b" })} />

      <KanbanFilters
        search={search}
        onSearchChange={setSearch}
        producers={producersData}
        producerFilter={producerFilter}
        onProducerFilterChange={setProducerFilter}
      />

      <div
        ref={topScrollRef}
        className="overflow-x-auto overflow-y-hidden h-3 sticky top-0 z-10 bg-background"
        onScroll={(e) => {
          if (syncingScroll.current === "board") {
            syncingScroll.current = null;
            return;
          }
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
          if (syncingScroll.current === "top") {
            syncingScroll.current = null;
            return;
          }
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
            speed = -Math.min(max, ((r.left + edge - e.clientX) / edge) * max);
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
        onDragLeave={() => {
          autoScrollSpeed.current = 0;
        }}
        onDrop={() => {
          autoScrollSpeed.current = 0;
        }}
        onDragEnd={() => {
          autoScrollSpeed.current = 0;
          resetDragState();
        }}
      >
        {colsData.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            cards={cardsData}
            producers={producersData}
            search={search}
            producerFilter={producerFilter}
            expandedGroups={expandedGroups}
            setExpandedGroups={setExpandedGroups}
            dragging={dragging}
            draggingGroup={draggingGroup}
            draggingFromCol={draggingFromCol}
            dragMoved={dragMoved}
            setDragging={setDragging}
            setDraggingGroup={setDraggingGroup}
            setDraggingFromCol={setDraggingFromCol}
            setDragMoved={setDragMoved}
            resetDragState={resetDragState}
            safeMutate={safeMutate}
            move={move}
            moveMany={moveMany}
            reorderInColumn={reorderInColumn}
            transferCard={transferCard}
            transferMany={transferMany}
            openNew={openNew}
            openEdit={openEdit}
            onEditColumn={(c) =>
              setEditingColumn({ id: c.id, name: c.name, color: c.color, producer_id: c.producer_id })
            }
          />
        ))}
      </div>

      <CardEditDialog
        editing={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onChange={setEditing}
        columns={colsData}
        producers={producersData}
        canTransferProducer={canTransferProducer}
        newLabel={newLabel}
        onNewLabelChange={setNewLabel}
        newLabelColor={newLabelColor}
        onNewLabelColorChange={setNewLabelColor}
        onAddLabel={addLabel}
        onRemoveLabel={removeLabel}
        saving={saving}
        onSave={saveCard}
        onDelete={deleteCard}
      />

      <ColumnEditDialog
        editingColumn={editingColumn}
        onOpenChange={(o) => !o && setEditingColumn(null)}
        onChange={setEditingColumn}
        saving={savingColumn}
        onSave={saveColumn}
        onDelete={deleteColumn}
      />
    </div>
  );
}
