import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Deal, Stage, PRIORITY_LABEL, Priority } from "./types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
  deal: Deal | null;
  stages: Stage[];
  defaultStageId?: string;
  onSaved: () => void;
}

const emptyForm = (stageId: string) => ({
  stage_id: stageId,
  title: "",
  company: "",
  phone: "",
  whatsapp: "",
  email: "",
  value_cents: 0,
  product: "",
  source: "",
  owner_name: "",
  priority: "medium" as Priority,
  tags: [] as string[],
  notes: "",
  next_contact_at: "",
  lost_reason: "",
  links: {} as Record<string, string>,
});

const LINK_KEYS = [
  { key: "conversation", label: "Link da conversa" },
  { key: "proposal", label: "Link da proposta" },
  { key: "contract", label: "Link do contrato" },
  { key: "drive", label: "Google Drive" },
  { key: "payment", label: "Link de pagamento" },
];

export function DealDrawer({ open, onClose, deal, stages, defaultStageId, onSaved }: Props) {
  const [form, setForm] = useState(emptyForm(defaultStageId || stages[0]?.id || ""));
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [activities, setActivities] = useState<Array<{ id: string; type: string; created_at: string; from_stage: string | null; to_stage: string | null }>>([]);

  useEffect(() => {
    if (deal) {
      setForm({
        stage_id: deal.stage_id,
        title: deal.title || "",
        company: deal.company || "",
        phone: deal.phone || "",
        whatsapp: deal.whatsapp || "",
        email: deal.email || "",
        value_cents: deal.value_cents || 0,
        product: deal.product || "",
        source: deal.source || "",
        owner_name: deal.owner_name || "",
        priority: deal.priority,
        tags: deal.tags || [],
        notes: deal.notes || "",
        next_contact_at: deal.next_contact_at ? deal.next_contact_at.slice(0, 16) : "",
        lost_reason: deal.lost_reason || "",
        links: deal.links || {},
      });
      loadActivities(deal.id);
    } else if (open) {
      setForm(emptyForm(defaultStageId || stages[0]?.id || ""));
      setActivities([]);
    }
  }, [deal, open, defaultStageId, stages]);

  const loadActivities = async (dealId: string) => {
    const { data } = await supabase
      .from("pipeline_activities" as never)
      .select("id,type,created_at,from_stage,to_stage")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false })
      .limit(30);
    setActivities((data as never) || []);
  };

  const currentStage = stages.find((s) => s.id === form.stage_id);

  const save = async () => {
    if (!form.title.trim()) return toast.error("Título é obrigatório");
    if (currentStage?.is_lost && !form.lost_reason.trim()) return toast.error("Informe o motivo da perda");

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload: Record<string, unknown> = {
      user_id: user.id,
      stage_id: form.stage_id,
      title: form.title,
      company: form.company || null,
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      value_cents: Number(form.value_cents) || 0,
      product: form.product || null,
      source: form.source || null,
      owner_name: form.owner_name || null,
      priority: form.priority,
      tags: form.tags,
      notes: form.notes || null,
      next_contact_at: form.next_contact_at ? new Date(form.next_contact_at).toISOString() : null,
      lost_reason: form.lost_reason || null,
      links: form.links,
    };

    const q = deal
      ? supabase.from("pipeline_deals" as never).update(payload as never).eq("id", deal.id)
      : supabase.from("pipeline_deals" as never).insert(payload as never);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(deal ? "Cartão atualizado" : "Cartão criado");
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!deal || !confirm("Excluir este cartão?")) return;
    const { error } = await supabase.from("pipeline_deals" as never).delete().eq("id", deal.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    onSaved();
    onClose();
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    setForm((s) => ({ ...s, tags: [...new Set([...s.tags, v])] }));
    setTagInput("");
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{deal ? "Editar Cartão" : "Novo Cartão"}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="info" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Dados</TabsTrigger>
            <TabsTrigger value="links">Links</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3 pt-4">
            <div>
              <Label>Etapa</Label>
              <Select value={form.stage_id} onValueChange={(v) => setForm((s) => ({ ...s, stage_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Título / Nome do cliente *</Label>
              <Input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Empresa</Label>
                <Input value={form.company} onChange={(e) => setForm((s) => ({ ...s, company: e.target.value }))} />
              </div>
              <div>
                <Label>Responsável</Label>
                <Input value={form.owner_name} onChange={(e) => setForm((s) => ({ ...s, owner_name: e.target.value }))} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={(e) => setForm((s) => ({ ...s, whatsapp: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.value_cents / 100}
                  onChange={(e) => setForm((s) => ({ ...s, value_cents: Math.round(Number(e.target.value) * 100) }))}
                />
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v: Priority) => setForm((s) => ({ ...s, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) =>
                      <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Produto</Label>
                <Input value={form.product} onChange={(e) => setForm((s) => ({ ...s, product: e.target.value }))} />
              </div>
              <div>
                <Label>Origem</Label>
                <Input value={form.source} onChange={(e) => setForm((s) => ({ ...s, source: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Próximo contato</Label>
                <Input type="datetime-local" value={form.next_contact_at}
                  onChange={(e) => setForm((s) => ({ ...s, next_contact_at: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Etiquetas</Label>
              <div className="flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder="Digite e Enter" />
                <Button type="button" variant="outline" size="icon" onClick={addTag}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {form.tags.map((t) => (
                  <button key={t} type="button"
                    onClick={() => setForm((s) => ({ ...s, tags: s.tags.filter((x) => x !== t) }))}
                    className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 hover:bg-primary/20">
                    {t} ×
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
            </div>
            {currentStage?.is_lost && (
              <div>
                <Label>Motivo da perda *</Label>
                <Select value={form.lost_reason} onValueChange={(v) => setForm((s) => ({ ...s, lost_reason: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {["Muito caro", "Sem interesse", "Concorrência", "Sem orçamento", "Não respondeu", "Outro"].map((r) =>
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </TabsContent>

          <TabsContent value="links" className="space-y-3 pt-4">
            {LINK_KEYS.map((l) => (
              <div key={l.key}>
                <Label>{l.label}</Label>
                <Input type="url" value={form.links[l.key] || ""}
                  onChange={(e) => setForm((s) => ({ ...s, links: { ...s.links, [l.key]: e.target.value } }))} />
              </div>
            ))}
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem movimentações registradas.</p>
            ) : (
              <ul className="space-y-2">
                {activities.map((a) => {
                  const from = stages.find((s) => s.id === a.from_stage)?.name;
                  const to = stages.find((s) => s.id === a.to_stage)?.name;
                  return (
                    <li key={a.id} className="text-xs border-l-2 border-primary/40 pl-3 py-1">
                      <div className="font-medium">
                        {a.type === "created" ? "Cartão criado" : `${from ?? "?"} → ${to ?? "?"}`}
                      </div>
                      <div className="text-muted-foreground">
                        {format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-between gap-2 mt-6 pt-4 border-t">
          {deal ? (
            <Button variant="ghost" onClick={remove} className="text-destructive">
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}