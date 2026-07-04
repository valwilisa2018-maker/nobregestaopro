import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Timer, Send, MessageCircleReply, Target, Plus, Trash2, Play, Pause, Pencil, Clock, Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({ meta: [{ title: "Follow-up — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type Unit = "minutes" | "hours" | "days";
type Followup = {
  id: string; name: string; description: string | null;
  inactivity_value: number; inactivity_unit: Unit;
  is_active: boolean; stop_on_reply: boolean;
  total_sent: number; total_replied: number; total_converted: number;
  created_at: string;
};
type Step = {
  id?: string; step_order: number;
  delay_value: number; delay_unit: Unit;
  message: string; media_url?: string | null;
};

const UNITS: { value: Unit; label: string }[] = [
  { value: "minutes", label: "minutos" },
  { value: "hours", label: "horas" },
  { value: "days", label: "dias" },
];

function Page() {
  const [rows, setRows] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Followup | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [invValue, setInvValue] = useState(1);
  const [invUnit, setInvUnit] = useState<Unit>("hours");
  const [stopOnReply, setStopOnReply] = useState(true);
  const [isActive, setIsActive] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("followups").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setRows((data as Followup[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const metrics = useMemo(() => {
    const sent = rows.reduce((a, r) => a + (r.total_sent ?? 0), 0);
    const replied = rows.reduce((a, r) => a + (r.total_replied ?? 0), 0);
    const conv = rows.reduce((a, r) => a + (r.total_converted ?? 0), 0);
    const active = rows.filter((r) => r.is_active).length;
    return { sent, replied, conv, active, replyRate: sent ? Math.round((replied / sent) * 100) : 0, convRate: sent ? Math.round((conv / sent) * 100) : 0 };
  }, [rows]);

  function openNew() {
    setEditing(null); setName(""); setDescription("");
    setInvValue(1); setInvUnit("hours");
    setStopOnReply(true); setIsActive(true);
    setSteps([{ step_order: 0, delay_value: 0, delay_unit: "minutes", message: "" }]);
    setOpen(true);
  }
  async function openEdit(f: Followup) {
    setEditing(f); setName(f.name); setDescription(f.description ?? "");
    setInvValue(f.inactivity_value); setInvUnit(f.inactivity_unit);
    setStopOnReply(f.stop_on_reply); setIsActive(f.is_active);
    const { data } = await supabase.from("followup_steps").select("*").eq("followup_id", f.id).order("step_order");
    setSteps((data as Step[])?.length ? (data as Step[]) : [{ step_order: 0, delay_value: 0, delay_unit: "minutes", message: "" }]);
    setOpen(true);
  }

  async function save() {
    if (!name.trim()) { toast.error("Informe um nome"); return; }
    if (!steps.some((s) => s.message.trim())) { toast.error("Adicione ao menos uma mensagem"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Sem sessão"); return; }
    const payload = {
      user_id: user.id, name: name.trim(), description: description.trim() || null,
      inactivity_value: invValue, inactivity_unit: invUnit,
      stop_on_reply: stopOnReply, is_active: isActive,
    };
    let followupId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("followups").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      await supabase.from("followup_steps").delete().eq("followup_id", editing.id);
    } else {
      const { data, error } = await supabase.from("followups").insert(payload).select("id").single();
      if (error) { toast.error(error.message); return; }
      followupId = data.id;
    }
    const clean = steps.filter((s) => s.message.trim()).map((s, i) => ({
      followup_id: followupId!, user_id: user.id, step_order: i,
      delay_value: s.delay_value, delay_unit: s.delay_unit,
      message: s.message, media_url: s.media_url ?? null,
    }));
    if (clean.length) {
      const { error } = await supabase.from("followup_steps").insert(clean);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(editing ? "Follow-up atualizado" : "Follow-up criado");
    setOpen(false); void load();
  }

  async function toggleActive(f: Followup) {
    const { error } = await supabase.from("followups").update({ is_active: !f.is_active }).eq("id", f.id);
    if (error) toast.error(error.message);
    else { toast.success(!f.is_active ? "Ativado" : "Pausado"); void load(); }
  }
  async function remove(f: Followup) {
    if (!confirm(`Excluir "${f.name}"?`)) return;
    const { error } = await supabase.from("followups").delete().eq("id", f.id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); void load(); }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Timer className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl sm:text-2xl font-black">Follow-up</h1>
              <p className="text-sm text-muted-foreground truncate">Réguas automáticas de acompanhamento por inatividade.</p>
            </div>
          </div>
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="h-4 w-4 mr-1" /> Novo follow-up</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric icon={<Zap className="h-4 w-4" />} label="Ativos" value={metrics.active} />
        <Metric icon={<Send className="h-4 w-4" />} label="Envios" value={metrics.sent} />
        <Metric icon={<MessageCircleReply className="h-4 w-4" />} label="Taxa de resposta" value={`${metrics.replyRate}%`} sub={`${metrics.replied} respostas`} />
        <Metric icon={<Target className="h-4 w-4" />} label="Conversões" value={`${metrics.convRate}%`} sub={`${metrics.conv} conversões`} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold">Campanhas</h2>
          <span className="text-xs text-muted-foreground">{rows.length} total</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <Timer className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum follow-up ainda.</p>
            <Button onClick={openNew} variant="outline" size="sm" className="mt-3"><Plus className="h-4 w-4 mr-1" /> Criar primeiro</Button>
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((f) => (
              <div key={f.id} className="p-4 flex items-center gap-3 hover:bg-muted/30 transition">
                <div className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center ${f.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>
                  {f.is_active ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate">{f.name}</span>
                    <Badge variant={f.is_active ? "default" : "secondary"} className="shrink-0 text-[10px]">
                      {f.is_active ? "Ativo" : "Pausado"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> após {f.inactivity_value} {unitLabel(f.inactivity_unit)}</span>
                    <span>· {f.total_sent} envios</span>
                    <span>· {f.total_replied} respostas</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f)} />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(f)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar follow-up" : "Novo follow-up"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reengajamento 24h" />
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
            </div>

            <div className="rounded-xl border p-4 bg-primary/5 space-y-3">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />
                <Label className="font-semibold">Gatilho de inatividade</Label>
              </div>
              <p className="text-xs text-muted-foreground">Dispara quando o cliente não responder pelo tempo abaixo.</p>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} value={invValue} onChange={(e) => setInvValue(Number(e.target.value) || 1)} className="w-28" />
                <Select value={invUnit} onValueChange={(v) => setInvUnit(v as Unit)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Etapas da régua</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setSteps((s) => [...s, { step_order: s.length, delay_value: 24, delay_unit: "hours", message: "" }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Etapa
                </Button>
              </div>
              {steps.map((s, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2 bg-card">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">Etapa {i + 1}</span>
                    {steps.length > 1 && (
                      <Button size="icon" variant="ghost" onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Aguardar</span>
                    <Input type="number" min={0} value={s.delay_value} disabled={i === 0}
                      onChange={(e) => setSteps((xs) => xs.map((x, j) => j === i ? { ...x, delay_value: Number(e.target.value) || 0 } : x))}
                      className="w-24 h-8" />
                    <Select value={s.delay_unit} onValueChange={(v) => setSteps((xs) => xs.map((x, j) => j === i ? { ...x, delay_unit: v as Unit } : x))}>
                      <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {i === 0 && <span className="text-xs text-muted-foreground">(dispara ao gatilho)</span>}
                  </div>
                  <Textarea rows={3} value={s.message} placeholder="Mensagem para o cliente..."
                    onChange={(e) => setSteps((xs) => xs.map((x, j) => j === i ? { ...x, message: e.target.value } : x))} />
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer">
                <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
                <div className="text-sm"><div className="font-medium">Parar ao responder</div><div className="text-xs text-muted-foreground">Cancela ao receber resposta</div></div>
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <div className="text-sm"><div className="font-medium">Ativar agora</div><div className="text-xs text-muted-foreground">Começa a rodar após salvar</div></div>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Criar follow-up"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="text-2xl font-black mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function unitLabel(u: Unit) {
  return u === "minutes" ? "min" : u === "hours" ? "h" : "dias";
}