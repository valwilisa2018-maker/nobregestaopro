import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Trash2, X, Calendar, Clock, ExternalLink, MessageCircle, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { fmtDate } from "@/lib/format";

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

type CardForm = {
  id?: string;
  column_id: string;
  title: string;
  description: string;
  due_date: string;
  due_time: string;
  color: string;
  labels: string[];
  trello_link?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  producer_id?: string | null;
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
  PAYMENT_STYLE[s ?? ""] ?? { bg: "hsl(var(--muted))", fg: "hsl(var(--foreground))", label: (s ?? "—").replace("_", " ") };

function KanbanPage() {
  const qc = useQueryClient();
  const { card: cardParam } = Route.useSearch();
  const [dragging, setDragging] = useState<string | null>(null);
  const [draggingGroup, setDraggingGroup] = useState<string[] | null>(null);
  const [dragMoved, setDragMoved] = useState(false);
  const [editing, setEditing] = useState<CardForm | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState<string>(LABEL_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const cols = useQuery({
    queryKey: ["kanban-cols"],
    queryFn: async () => (await supabase.from("kanban_columns").select("*").order("sort_order")).data ?? [],
  });

  const cards = useQuery({
    queryKey: ["kanban-cards"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_orders")
        .select("*, producer:producers!service_orders_producer_id_fkey(name), sales(total_amount, payment_status, trello_link, customers(name,company,phone), sellers(name), producers(name))")
        .order("sort_order");
      return data ?? [];
    },
  });

  const producers = useQuery({
    queryKey: ["producers-select"],
    queryFn: async () => (await supabase.from("producers").select("id,name").eq("active", true).order("name")).data ?? [],
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
      trello_link: found.trello_link ?? found.sales?.trello_link ?? null,
      customer_phone: found.sales?.customers?.phone ?? null,
      customer_name: found.sales?.customers?.name ?? null,
      producer_id: found.producer_id ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardParam, cards.data]);

  const move = async (cardId: string, columnId: string) => {
    const { error } = await supabase
      .from("service_orders")
      .update({ column_id: columnId, delivered_at: null })
      .eq("id", cardId);
    if (error) toast.error(error.message);
    else { toast.success("Card movido"); qc.invalidateQueries({ queryKey: ["kanban-cards"] }); }
  };

  const moveMany = async (cardIds: string[], columnId: string) => {
    const { error } = await supabase
      .from("service_orders")
      .update({ column_id: columnId, delivered_at: null })
      .in("id", cardIds);
    if (error) toast.error(error.message);
    else { toast.success(`${cardIds.length} cards movidos`); qc.invalidateQueries({ queryKey: ["kanban-cards"] }); }
  };

  const openNew = (column_id: string) => { setEditing(emptyForm(column_id)); setNewLabel(""); };
  const openEdit = (c: any) => {
    setEditing({
      id: c.id, column_id: c.column_id,
      title: c.title ?? "", description: c.description ?? "",
      due_date: c.due_date ?? "", due_time: (c.due_time ?? "").slice(0, 5),
      color: c.color ?? "", labels: c.labels ?? [],
      trello_link: c.trello_link ?? c.sales?.trello_link ?? null,
      customer_phone: c.sales?.customers?.phone ?? null,
      customer_name: c.sales?.customers?.name ?? null,
      producer_id: c.producer_id ?? null,
    });
    setNewLabel("");
  };

  const saveCard = async () => {
    if (!editing) return;
    if (!editing.title.trim()) { toast.error("Título é obrigatório"); return; }
    setSaving(true);
    const payload: any = {
      column_id: editing.column_id,
      title: editing.title.trim(),
      description: editing.description || null,
      due_date: editing.due_date || null,
      due_time: editing.due_time || null,
      color: editing.color || null,
      labels: editing.labels,
      trello_link: editing.trello_link?.trim() || null,
      producer_id: editing.producer_id || null,
    };
    try {
      if (editing.id) {
        const { error } = await supabase.from("service_orders").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Card atualizado");
      } else {
        const { error } = await supabase.from("service_orders").insert({ ...payload, service_index: 1, sort_order: 9999 });
        if (error) throw error;
        toast.success("Card criado");
      }
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["kanban-cards"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const deleteCard = async () => {
    if (!editing?.id) return;
    if (!confirm("Excluir este card?")) return;
    const { error } = await supabase.from("service_orders").delete().eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Produção Trello</h1>
        <p className="text-muted-foreground">Arraste os cards entre as colunas para atualizar o status</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {(cols.data ?? []).map((col: any) => {
          const colCards = (cards.data ?? []).filter((c: any) => c.column_id === col.id);
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
              className="min-w-[280px] w-[280px] flex-shrink-0 rounded-lg border-2 border-black bg-muted/50 p-3 shadow-md"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggingGroup && draggingGroup.length) moveMany(draggingGroup, col.id);
                else if (dragging) move(dragging, col.id);
                setDragging(null);
                setDraggingGroup(null);
              }}
            >
              <div className="flex items-center justify-between mb-3 px-2 py-2 rounded-md bg-black text-white">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                  <span className="font-semibold text-sm">{col.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="border-white/40 text-white">{colCards.length}</Badge>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-white hover:bg-white/10 hover:text-white" onClick={() => openNew(col.id)}>
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
                      <div key={groupKey} className="space-y-2">
                        <Card
                          draggable
                          onDragStart={() => { setDraggingGroup(it.cards.map((x: any) => x.id)); setDragMoved(false); }}
                          onDrag={() => setDragMoved(true)}
                          onDragEnd={() => { setDraggingGroup(null); setTimeout(() => setDragMoved(false), 0); }}
                          onClick={() => { if (!dragMoved) setExpandedGroups((s) => ({ ...s, [groupKey]: !s[groupKey] })); }}
                          className="cursor-grab active:cursor-grabbing bg-background hover:border-primary/70 transition-all overflow-hidden border-2 border-foreground/15 shadow-md"
                          style={{ boxShadow: "var(--shadow-card)", borderLeft: `4px solid ${col.color || "hsl(var(--primary))"}` }}>
                          <CardContent className="p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                <Layers className="w-4 h-4 text-primary" />
                                <span className="text-sm font-medium">{customerName}</span>
                              </div>
                              <Badge variant="secondary" className="text-[10px]">{it.cards.length} serviços</Badge>
                            </div>
                            {company && <div className="text-xs text-muted-foreground pl-6">{company}</div>}
                            <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground pl-6">
                              <span>Vendedor: {first.sales?.sellers?.name ?? "—"}</span>
                              <span>Produtor: {first.producer?.name ?? first.sales?.producers?.name ?? "—"}</span>
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
                          </CardContent>
                        </Card>
                        {isOpen && it.cards.map((c: any) => (
                          <Card key={c.id} draggable
                            onDragStart={() => { setDragging(c.id); setDragMoved(false); }}
                            onDrag={() => setDragMoved(true)}
                            onDragEnd={() => { setDragging(null); setTimeout(() => setDragMoved(false), 0); }}
                            onClick={() => { if (!dragMoved) openEdit(c); }}
                            className="cursor-pointer bg-background hover:border-primary/70 transition-all overflow-hidden border-2 border-foreground/15 shadow-md ml-4"
                            style={{
                              boxShadow: "var(--shadow-card)",
                              borderLeft: `4px solid ${col.color || "hsl(var(--primary))"}`,
                            }}>
                            <CardContent className="p-3 space-y-2">
                              {(c.labels?.length ?? 0) > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {c.labels.map((raw: string, i: number) => {
                                    const { name, color } = parseLabel(raw);
                                    return (
                                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                        style={{ background: color || "hsl(var(--primary) / 0.15)", color: color ? "#fff" : "hsl(var(--primary))" }}>
                                        {name}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              <div className="text-sm font-medium leading-tight">{c.title}</div>
                              {(c.due_date || c.due_time) && (
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  {c.due_date && (<span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(c.due_date)}</span>)}
                                  {c.due_time && (<span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.due_time.slice(0, 5)}</span>)}
                                </div>
                              )}
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex flex-col gap-0.5 text-muted-foreground">
                                  <span>Vendedor: {c.sales?.sellers?.name ?? "—"}</span>
                                  <span>Produtor: {c.producer?.name ?? c.sales?.producers?.name ?? "—"}</span>
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
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    );
                  }
                  const c = it.card;
                  return (
                    <Card key={c.id} draggable
                    onDragStart={() => { setDragging(c.id); setDragMoved(false); }}
                    onDrag={() => setDragMoved(true)}
                    onDragEnd={() => { setDragging(null); setTimeout(() => setDragMoved(false), 0); }}
                    onClick={() => { if (!dragMoved) openEdit(c); }}
                    className="cursor-pointer bg-background hover:border-primary/70 transition-all overflow-hidden border-2 border-foreground/15 shadow-md"
                    style={{
                      boxShadow: "var(--shadow-card)",
                      borderLeft: `4px solid ${col.color || "hsl(var(--primary))"}`,
                    }}>
                    <CardContent className="p-3 space-y-2">
                      {(c.labels?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.labels.map((raw: string, i: number) => {
                            const { name, color } = parseLabel(raw);
                            return (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{ background: color || "hsl(var(--primary) / 0.15)", color: color ? "#fff" : "hsl(var(--primary))" }}>
                                {name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="text-sm font-medium leading-tight">{c.title}</div>
                      {c.sales?.customers?.company && (
                        <div className="text-xs text-muted-foreground">{c.sales.customers.company}</div>
                      )}
                      {(c.due_date || c.due_time) && (
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {c.due_date && (<span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(c.due_date)}</span>)}
                          {c.due_time && (<span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.due_time.slice(0, 5)}</span>)}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex flex-col gap-0.5 text-muted-foreground">
                          <span>Vendedor: {c.sales?.sellers?.name ?? "—"}</span>
                          <span>Produtor: {c.producer?.name ?? c.sales?.producers?.name ?? "—"}</span>
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
                    </CardContent>
                  </Card>
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
                <div><Label>Data de entrega</Label><Input type="date" value={editing.due_date} onChange={(e) => setEditing({ ...editing, due_date: e.target.value })} /></div>
                <div><Label>Horário</Label><Input type="time" value={editing.due_time} onChange={(e) => setEditing({ ...editing, due_time: e.target.value })} /></div>
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
                  placeholder="https://..."
                  value={editing.trello_link ?? ""}
                  onChange={(e) => setEditing({ ...editing, trello_link: e.target.value })}
                />
                {editing.trello_link && (
                  <a href={editing.trello_link} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline break-all mt-1">
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    Abrir link
                  </a>
                )}
              </div>
              {editing.customer_phone && (
                <div>
                  <Label>Cliente</Label>
                  <a
                    href={`https://wa.me/${editing.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${editing.customer_name ?? ""}!`.trim())}`}
                    target="_blank" rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp {editing.customer_phone}
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
                          style={{ background: color || "hsl(var(--muted))", color: color ? "#fff" : "hsl(var(--foreground))" }}>
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
    </div>
  );
}