import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Timer,
  Send,
  MessageCircleReply,
  Target,
  Plus,
  Trash2,
  Play,
  Pause,
  Pencil,
  Clock,
  Zap,
  Plug,
  CheckCircle2,
  AlertCircle,
  Layers,
  Workflow,
} from "lucide-react";
import { z } from "zod";

const stepSchema = z
  .object({
    delay_value: z
      .number()
      .int()
      .min(0, "Delay não pode ser negativo")
      .max(9999, "Delay muito alto"),
    delay_unit: z.enum(["minutes", "hours", "days"]),
    message: z.string().trim().max(2000, "Máximo 2000 caracteres").optional().default(""),
    flow_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (s) => (s.flow_id && s.flow_id.length > 0) || (s.message && s.message.trim().length > 0),
    {
      message: "Escolha um fluxo ou escreva a mensagem",
      path: ["message"],
    },
  );
const followupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter ao menos 2 caracteres")
    .max(80, "Máximo 80 caracteres"),
  description: z.string().trim().max(300, "Máximo 300 caracteres").optional(),
  invValue: z.number().int().min(1, "Deve ser ≥ 1").max(9999, "Valor muito alto"),
  invUnit: z.enum(["minutes", "hours", "days"]),
  connectionId: z.string().min(1, "Selecione uma instância"),
  steps: z.array(stepSchema).min(1, "Adicione ao menos uma etapa"),
});
type FieldErrors = {
  name?: string;
  description?: string;
  invValue?: string;
  connectionId?: string;
  steps?: string;
  stepMsgs?: Record<number, string>;
  stepDelays?: Record<number, string>;
};

function InlineError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 backdrop-blur-md shadow-[0_4px_12px_-4px_rgba(239,68,68,0.35)] animate-in fade-in slide-in-from-top-1 duration-200">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({ meta: [{ title: "Follow-up — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type Unit = "minutes" | "hours" | "days";
type Followup = {
  id: string;
  name: string;
  description: string | null;
  inactivity_value: number;
  inactivity_unit: Unit;
  is_active: boolean;
  stop_on_reply: boolean;
  connection_id: string | null;
  total_sent: number;
  total_replied: number;
  total_converted: number;
  created_at: string;
};
type Connection = {
  id: string;
  name: string;
  instance_name: string | null;
  status: string | null;
  phone_number: string | null;
};
type Step = {
  id?: string;
  step_order: number;
  delay_value: number;
  delay_unit: Unit;
  message: string;
  media_url?: string | null;
  flow_id?: string | null;
};
type FlowRow = { id: string; name: string; is_active: boolean };

const UNITS: { value: Unit; label: string }[] = [
  { value: "minutes", label: "minutos" },
  { value: "hours", label: "horas" },
  { value: "days", label: "dias" },
];

function Page() {
  const [rows, setRows] = useState<Followup[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [flows, setFlows] = useState<FlowRow[]>([]);
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
  const [connectionId, setConnectionId] = useState<string>("all");
  const [errors, setErrors] = useState<FieldErrors>({});

  async function load() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setRows([]);
      setConnections([]);
      setLoading(false);
      return;
    }
    const [{ data, error }, { data: conns }, { data: fls }] = await Promise.all([
      supabase
        .from("followups")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("connections")
        .select("id,name,instance_name,status,phone_number")
        .eq("user_id", user.id)
        .order("created_at"),
      supabase
        .from("flows")
        .select("id,name,is_active")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
    ]);
    if (error) toast.error(error.message);
    else setRows((data as Followup[]) ?? []);
    setConnections((conns as Connection[]) ?? []);
    setFlows((fls as FlowRow[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const connMap = useMemo(
    () => Object.fromEntries(connections.map((c) => [c.id, c])),
    [connections],
  );
  const anyConnected = connections.some((c) => {
    const s = (c.status ?? "").toLowerCase();
    return s.includes("open") || s.includes("connect") || s.includes("online") || s === "ready";
  });

  const metrics = useMemo(() => {
    const sent = rows.reduce((a, r) => a + (r.total_sent ?? 0), 0);
    const replied = rows.reduce((a, r) => a + (r.total_replied ?? 0), 0);
    const conv = rows.reduce((a, r) => a + (r.total_converted ?? 0), 0);
    const active = rows.filter((r) => r.is_active).length;
    return {
      sent,
      replied,
      conv,
      active,
      replyRate: sent ? Math.round((replied / sent) * 100) : 0,
      convRate: sent ? Math.round((conv / sent) * 100) : 0,
    };
  }, [rows]);

  function openNew() {
    setEditing(null);
    setName("");
    setDescription("");
    setInvValue(1);
    setInvUnit("hours");
    setStopOnReply(true);
    setIsActive(true);
    setConnectionId("all");
    setSteps([
      { step_order: 0, delay_value: 0, delay_unit: "minutes", message: "", flow_id: null },
    ]);
    setErrors({});
    setOpen(true);
  }
  async function openEdit(f: Followup) {
    setEditing(f);
    setName(f.name);
    setDescription(f.description ?? "");
    setInvValue(f.inactivity_value);
    setInvUnit(f.inactivity_unit);
    setStopOnReply(f.stop_on_reply);
    setIsActive(f.is_active);
    setConnectionId(f.connection_id ?? "all");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("followup_steps")
      .select("*")
      .eq("followup_id", f.id)
      .eq("user_id", user.id)
      .order("step_order");
    setSteps(
      (data as Step[])?.length
        ? (data as Step[])
        : [{ step_order: 0, delay_value: 0, delay_unit: "minutes", message: "", flow_id: null }],
    );
    setErrors({});
    setOpen(true);
  }

  async function save() {
    const parsed = followupSchema.safeParse({
      name,
      description,
      invValue,
      invUnit,
      connectionId,
      steps,
    });
    if (!parsed.success) {
      const fe: FieldErrors = { stepMsgs: {}, stepDelays: {} };
      for (const issue of parsed.error.issues) {
        const [k, idx, sub] = issue.path as (string | number)[];
        if (k === "steps" && typeof idx === "number") {
          if (sub === "message") fe.stepMsgs![idx] = issue.message;
          else if (sub === "delay_value") fe.stepDelays![idx] = issue.message;
          else fe.steps = issue.message;
        } else if (k === "name") fe.name = issue.message;
        else if (k === "description") fe.description = issue.message;
        else if (k === "invValue") fe.invValue = issue.message;
        else if (k === "connectionId") fe.connectionId = issue.message;
      }
      setErrors(fe);
      toast.error("Corrija os campos destacados");
      return;
    }
    setErrors({});
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sem sessão");
      return;
    }
    const payload = {
      user_id: user.id,
      name: name.trim(),
      description: description.trim() || null,
      inactivity_value: invValue,
      inactivity_unit: invUnit,
      stop_on_reply: stopOnReply,
      is_active: isActive,
      connection_id: connectionId === "all" ? null : connectionId,
    };
    let followupId = editing?.id;
    if (editing) {
      const { error } = await supabase
        .from("followups")
        .update(payload)
        .eq("id", editing.id)
        .eq("user_id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await supabase
        .from("followup_steps")
        .delete()
        .eq("followup_id", editing.id)
        .eq("user_id", user.id);
    } else {
      const { data, error } = await supabase
        .from("followups")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      followupId = data.id;
    }
    const clean = steps
      .filter((s) => (s.flow_id && s.flow_id.length > 0) || s.message.trim())
      .map((s, i) => ({
        followup_id: followupId!,
        user_id: user.id,
        step_order: i,
        delay_value: s.delay_value,
        delay_unit: s.delay_unit,
        message: s.message ?? "",
        media_url: s.media_url ?? null,
        flow_id: s.flow_id && s.flow_id.length > 0 ? s.flow_id : null,
      }));
    if (clean.length) {
      const { error } = await supabase.from("followup_steps").insert(clean);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success(editing ? "Follow-up atualizado" : "Follow-up criado");
    setOpen(false);
    void load();
  }

  async function toggleActive(f: Followup) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("followups")
      .update({ is_active: !f.is_active })
      .eq("id", f.id)
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
    else {
      toast.success(!f.is_active ? "Ativado" : "Pausado");
      void load();
    }
  }
  async function remove(f: Followup) {
    if (!confirm(`Excluir "${f.name}"?`)) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("followups")
      .delete()
      .eq("id", f.id)
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      void load();
    }
  }

  return (
    <div className="h-full flex flex-col gap-4 md:gap-6 p-4 md:p-6">
      {/* Premium Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-indigo-950/60 to-slate-950/90 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl shrink-0">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_10px_30px_-10px_rgba(59,130,246,0.7)] ring-1 ring-white/20">
              <Timer className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="bg-gradient-to-r from-blue-300 via-indigo-200 to-violet-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  Follow-up
                </h1>
                <Badge
                  variant="outline"
                  className="border-blue-500/40 bg-blue-500/10 text-blue-300"
                >
                  Automático
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Réguas automáticas de acompanhamento por inatividade.
              </p>
            </div>
          </div>
          <Button
            onClick={openNew}
            className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)] hover:opacity-90"
          >
            <Plus className="mr-2 h-4 w-4" /> Novo follow-up
          </Button>
        </div>

        {/* KPIs */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              label: "Ativos",
              value: metrics.active,
              icon: <Zap className="h-4 w-4" />,
              tone: "from-emerald-500/25 to-teal-500/10",
              ring: "ring-emerald-500/30",
              text: "text-emerald-300",
            },
            {
              label: "Envios",
              value: metrics.sent,
              icon: <Send className="h-4 w-4" />,
              tone: "from-blue-500/25 to-cyan-500/10",
              ring: "ring-blue-500/30",
              text: "text-blue-300",
            },
            {
              label: "Taxa de resposta",
              value: `${metrics.replyRate}%`,
              icon: <MessageCircleReply className="h-4 w-4" />,
              tone: "from-violet-500/25 to-fuchsia-500/10",
              ring: "ring-violet-500/30",
              text: "text-violet-300",
              sub: `${metrics.replied} respostas`,
            },
            {
              label: "Conversões",
              value: `${metrics.convRate}%`,
              icon: <Target className="h-4 w-4" />,
              tone: "from-amber-500/25 to-orange-500/10",
              ring: "ring-amber-500/30",
              text: "text-amber-300",
              sub: `${metrics.conv} conversões`,
            },
          ].map((k) => (
            <div
              key={k.label}
              className={`rounded-2xl border border-white/10 bg-gradient-to-br ${k.tone} p-4 ring-1 ${k.ring} backdrop-blur`}
            >
              <div className={`flex items-center gap-2 text-xs uppercase tracking-wider ${k.text}`}>
                {k.icon}
                <span>{k.label}</span>
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
              {k.sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      <Card
        className={`shrink-0 flex items-center gap-3 border p-3 ${anyConnected ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}
      >
        {anyConnected ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
        ) : (
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">
            {anyConnected ? "Follow-up pronto para disparar" : "Nenhuma instância conectada"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {connections.length} instância(s) · dispara automaticamente quando o cliente ficar
            inativo · para ao receber resposta.
          </div>
        </div>
      </Card>

      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">
        <div className="shrink-0 flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <h2 className="font-bold">Campanhas</h2>
          </div>
          <span className="text-xs text-muted-foreground">{rows.length} total</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <Timer className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum follow-up ainda.</p>
            <Button onClick={openNew} variant="outline" size="sm" className="mt-3">
              <Plus className="h-4 w-4 mr-1" /> Criar primeiro
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto divide-y">
            {rows.map((f) => (
              <div key={f.id} className="p-4 flex items-center gap-3 hover:bg-muted/30 transition">
                <div
                  className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center ${f.is_active ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}
                >
                  {f.is_active ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate">{f.name}</span>
                    <Badge
                      variant={f.is_active ? "default" : "secondary"}
                      className="shrink-0 text-[10px]"
                    >
                      {f.is_active ? "Ativo" : "Pausado"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> após {f.inactivity_value}{" "}
                      {unitLabel(f.inactivity_unit)}
                    </span>
                    <span className="flex items-center gap-1">
                      {f.connection_id ? (
                        <>
                          <Plug className="h-3 w-3" />{" "}
                          {connMap[f.connection_id]?.name ?? "Instância removida"}
                        </>
                      ) : (
                        <>
                          <Layers className="h-3 w-3" /> Todas instâncias
                        </>
                      )}
                    </span>
                    <span>· {f.total_sent} envios</span>
                    <span>· {f.total_replied} respostas</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f)} />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(f)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(f)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-white/10 bg-slate-950/95 p-0 shadow-[0_25px_70px_-25px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
          <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />

            <DialogHeader className="relative border-b border-white/10 p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)] ring-1 ring-white/20">
                  <Timer className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="bg-gradient-to-r from-blue-300 via-indigo-200 to-violet-300 bg-clip-text text-2xl font-bold text-transparent">
                    {editing ? "Editar follow-up" : "Novo follow-up"}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Configure a régua automática de reengajamento.
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="relative space-y-5 p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Nome</Label>
                  <Input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
                    }}
                    placeholder="Ex.: Reengajamento 24h"
                    className={`h-11 bg-slate-900/60 border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition ${errors.name ? "border-red-500/60 focus:border-red-500/60 focus:ring-red-500/20" : ""}`}
                  />
                  <InlineError msg={errors.name} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Descrição</Label>
                  <Textarea
                    rows={2}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      if (errors.description) setErrors((x) => ({ ...x, description: undefined }));
                    }}
                    placeholder="Opcional"
                    className={`bg-slate-900/60 border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 resize-none transition ${errors.description ? "border-red-500/60 focus:border-red-500/60 focus:ring-red-500/20" : ""}`}
                  />
                  <InlineError msg={errors.description} />
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-slate-900/60 to-slate-900/60 p-5">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-500/20 blur-2xl" />
                <div className="relative flex items-center gap-2 mb-1">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-blue-500/20 ring-1 ring-blue-500/20">
                    <Timer className="h-4 w-4 text-blue-400" />
                  </div>
                  <Label className="font-semibold">Gatilho de inatividade</Label>
                </div>
                <p className="relative text-xs text-muted-foreground mb-3">
                  Dispara quando o cliente não responder pelo tempo abaixo.
                </p>
                <div className="relative flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={invValue}
                    onChange={(e) => {
                      setInvValue(Number(e.target.value) || 1);
                      if (errors.invValue) setErrors((x) => ({ ...x, invValue: undefined }));
                    }}
                    className={`h-11 w-28 bg-slate-950/50 border-white/10 focus:border-blue-500/50 ${errors.invValue ? "border-red-500/60" : ""}`}
                  />
                  <Select value={invUnit} onValueChange={(v) => setInvUnit(v as Unit)}>
                    <SelectTrigger className="h-11 w-40 bg-slate-950/50 border-white/10 focus:ring-blue-500/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <InlineError msg={errors.invValue} />
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/15 blur-2xl" />
                <div className="relative flex items-center gap-2 mb-1">
                  <div className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/20">
                    <Plug className="h-4 w-4 text-indigo-400" />
                  </div>
                  <Label className="font-semibold">Instância WhatsApp</Label>
                </div>
                <p className="relative text-xs text-muted-foreground mb-3">
                  Escolha uma instância específica ou dispare por todas.
                </p>
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger
                    className={`h-11 bg-slate-950/50 border-white/10 focus:ring-indigo-500/20 ${errors.connectionId ? "border-red-500/60" : ""}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">🌐 Todas as instâncias</SelectItem>
                    {connections.map((c) => {
                      const s = (c.status ?? "").toLowerCase();
                      const on =
                        s.includes("open") ||
                        s.includes("connect") ||
                        s.includes("online") ||
                        s === "ready";
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          {on ? "🟢" : "⚪"} {c.name} {c.phone_number ? `· ${c.phone_number}` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <InlineError msg={errors.connectionId} />
                {connections.length === 0 && (
                  <p className="relative mt-2 text-xs font-medium text-amber-500">
                    Nenhuma instância cadastrada. Conecte um WhatsApp primeiro.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Etapas da régua</Label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      setSteps((s) => [
                        ...s,
                        {
                          step_order: s.length,
                          delay_value: 24,
                          delay_unit: "hours",
                          message: "",
                          flow_id: null,
                        },
                      ])
                    }
                    className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_8px_20px_-8px_rgba(59,130,246,0.6)] hover:opacity-90"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Etapa
                  </Button>
                </div>
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                        Etapa {i + 1}
                      </span>
                      {steps.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))}
                          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-xs text-muted-foreground">Aguardar</span>
                      <Input
                        type="number"
                        min={0}
                        value={s.delay_value}
                        disabled={i === 0}
                        onChange={(e) =>
                          setSteps((xs) =>
                            xs.map((x, j) =>
                              j === i ? { ...x, delay_value: Number(e.target.value) || 0 } : x,
                            ),
                          )
                        }
                        className={`w-24 h-9 bg-slate-950/50 border-white/10 disabled:opacity-40 ${errors.stepDelays?.[i] ? "border-red-500/60" : ""}`}
                      />
                      <Select
                        value={s.delay_unit}
                        onValueChange={(v) =>
                          setSteps((xs) =>
                            xs.map((x, j) => (j === i ? { ...x, delay_unit: v as Unit } : x)),
                          )
                        }
                      >
                        <SelectTrigger className="w-32 h-9 bg-slate-950/50 border-white/10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map((u) => (
                            <SelectItem key={u.value} value={u.value}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {i === 0 && (
                        <span className="text-xs text-muted-foreground">(dispara ao gatilho)</span>
                      )}
                    </div>
                    <InlineError msg={errors.stepDelays?.[i]} />
                    <div className="mb-2 inline-flex rounded-lg border border-white/10 bg-slate-950/50 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setSteps((xs) =>
                            xs.map((x, j) => (j === i ? { ...x, flow_id: null } : x)),
                          )
                        }
                        className={`px-3 py-1.5 rounded-md font-medium transition ${!s.flow_id ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Send className="h-3 w-3 mr-1 inline" /> Mensagem
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSteps((xs) =>
                            xs.map((x, j) =>
                              j === i ? { ...x, flow_id: x.flow_id ?? flows[0]?.id ?? "" } : x,
                            ),
                          )
                        }
                        className={`px-3 py-1.5 rounded-md font-medium transition ${s.flow_id ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Workflow className="h-3 w-3 mr-1 inline" /> Fluxo
                      </button>
                    </div>
                    {s.flow_id ? (
                      <>
                        <Select
                          value={s.flow_id ?? ""}
                          onValueChange={(v) =>
                            setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, flow_id: v } : x)))
                          }
                        >
                          <SelectTrigger className="h-11 bg-slate-950/50 border-white/10 focus:ring-violet-500/20">
                            <SelectValue placeholder="Selecione um fluxo" />
                          </SelectTrigger>
                          <SelectContent>
                            {flows.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-muted-foreground">
                                Nenhum fluxo criado. Crie um em Workflows.
                              </div>
                            ) : (
                              flows.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.is_active ? "🟢" : "⚪"} {f.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <p className="mt-2 text-[11px] text-violet-300/80">
                          Ao disparar, o fluxo inteiro será executado para o contato.
                        </p>
                        <InlineError msg={errors.stepMsgs?.[i]} />
                      </>
                    ) : (
                      <>
                        <Textarea
                          rows={3}
                          value={s.message}
                          placeholder="Mensagem para o cliente..."
                          onChange={(e) => {
                            setSteps((xs) =>
                              xs.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)),
                            );
                            if (errors.stepMsgs?.[i])
                              setErrors((x) => ({
                                ...x,
                                stepMsgs: {
                                  ...(x.stepMsgs ?? {}),
                                  [i]: undefined as unknown as string,
                                },
                              }));
                          }}
                          className={`bg-slate-950/50 border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 resize-none transition ${errors.stepMsgs?.[i] ? "border-red-500/60 focus:border-red-500/60 focus:ring-red-500/20" : ""}`}
                        />
                        <InlineError msg={errors.stepMsgs?.[i]} />
                      </>
                    )}
                  </div>
                ))}
                <InlineError msg={errors.steps} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 cursor-pointer transition hover:bg-slate-800/60 hover:border-blue-500/20">
                  <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
                  <div className="text-sm">
                    <div className="font-semibold group-hover:text-blue-300 transition">
                      Parar ao responder
                    </div>
                    <div className="text-xs text-muted-foreground">Cancela ao receber resposta</div>
                  </div>
                </label>
                <label className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 cursor-pointer transition hover:bg-slate-800/60 hover:border-indigo-500/20">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <div className="text-sm">
                    <div className="font-semibold group-hover:text-indigo-300 transition">
                      Ativar agora
                    </div>
                    <div className="text-xs text-muted-foreground">Começa a rodar após salvar</div>
                  </div>
                </label>
              </div>
            </div>

            <DialogFooter className="relative border-t border-white/10 p-6 gap-2">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground hover:bg-white/5"
              >
                Cancelar
              </Button>
              <Button
                onClick={save}
                className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)] hover:opacity-90"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {editing ? "Salvar alterações" : "Criar follow-up"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function unitLabel(u: Unit) {
  return u === "minutes" ? "min" : u === "hours" ? "h" : "dias";
}
