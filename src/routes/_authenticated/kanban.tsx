import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Trash2, X, Calendar, Clock, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/kanban")({
  component: KanbanPage,
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
};

const emptyForm = (column_id = ""): CardForm => ({
  column_id, title: "", description: "", due_date: "", due_time: "", color: "", labels: [],
});

function KanbanPage() {
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);
  const [editing, setEditing] = useState<CardForm | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const cols = useQuery({
    queryKey: ["kanban-cols"],
    queryFn: async () => (await supabase.from("kanban_columns").select("*").order("sort_order")).data ?? [],
  });

  const cards = useQuery({
    queryKey: ["kanban-cards"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_orders")
        .select("*, sales(total_amount, payment_status, customers(name,company), sellers(name), producers(name))")
        .order("sort_order");
      return data ?? [];
    },
  });

  const move = async (cardId: string, columnId: string) => {
    const { error } = await supabase
      .from("service_orders")
      .update({ column_id: columnId, delivered_at: null })
      .eq("id", cardId);
    if (error) toast.error(error.message);
    else { toast.success("Card movido"); qc.invalidateQueries({ queryKey: ["kanban-cards"] }); }
  };

  const openNew = (column_id: string) => { setEditing(emptyForm(column_id)); setNewLabel(""); };
  const openEdit = (c: any) => {
    setEditing({
      id: c.id, column_id: c.column_id,
      title: c.title ?? "", description: c.description ?? "",
      due_date: c.due_date ?? "", due_time: (c.due_time ?? "").slice(0, 5),
      color: c.color ?? "", labels: c.labels ?? [],
      trello_link: c.sales?.trello_link ?? null,
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
    setEditing({ ...editing, labels: [...editing.labels, newLabel.trim()] });
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
          return (
            <div
              key={col.id}
              className="min-w-[280px] w-[280px] flex-shrink-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragging) move(dragging, col.id); setDragging(null); }}
            >
              <div className="flex items-center justify-between mb-3 px-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                  <span className="font-semibold text-sm">{col.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline">{colCards.length}</Badge>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openNew(col.id)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {colCards.map((c: any) => (
                  <Card key={c.id} draggable onDragStart={() => setDragging(c.id)}
                    onClick={() => openEdit(c)}
                    className="cursor-pointer bg-card border-border/60 hover:border-primary/40 transition-all overflow-hidden"
                    style={{
                      boxShadow: "var(--shadow-card)",
                      borderLeft: c.color ? `4px solid ${c.color}` : undefined,
                    }}>
                    <CardContent className="p-3 space-y-2">
                      {(c.labels?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.labels.map((l: string, i: number) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: c.color || "hsl(var(--primary) / 0.15)", color: c.color ? "#fff" : "hsl(var(--primary))" }}>
                              {l}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-sm font-medium leading-tight">{c.title}</div>
                      {c.sales?.customers?.company && (
                        <div className="text-xs text-muted-foreground">{c.sales.customers.company}</div>
                      )}
                      {(c.due_date || c.due_time) && (
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {c.due_date && (<span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{c.due_date.split("-").reverse().join("/")}</span>)}
                          {c.due_time && (<span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.due_time.slice(0, 5)}</span>)}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{c.sales?.producers?.name ?? "—"}</span>
                        {c.sales?.payment_status && (
                          <Badge variant={c.sales.payment_status === "pago_total" ? "default" : "destructive"} className="text-[10px]">
                            {c.sales.payment_status.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
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
              {editing.trello_link && (
                <div>
                  <Label>Link da venda (Trello)</Label>
                  <a href={editing.trello_link} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline break-all mt-1">
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    {editing.trello_link}
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
                {editing.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {editing.labels.map((l, i) => (
                      <span key={i} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted">
                        {l}
                        <button type="button" onClick={() => removeLabel(i)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
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