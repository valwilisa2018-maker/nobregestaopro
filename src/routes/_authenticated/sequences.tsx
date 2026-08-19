import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  GripVertical,
  KeyRound,
  Layers,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Rocket,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
  Activity,
  TrendingUp,
  Timer,
  Workflow,
  Wand2,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { listFlows } from "@/lib/flows.functions";
import { listContacts } from "@/lib/contacts.functions";
import {
  listSequences,
  saveSequence,
  getSequence,
  deleteSequence,
  duplicateSequence,
  setSequenceStatus,
  enrollContacts,
  listEnrollments,
  enrollmentAction,
} from "@/lib/sequences.functions";

export const Route = createFileRoute("/_authenticated/sequences")({
  head: () => ({ meta: [{ title: "Sequências — Automação de mensagens" }] }),
  component: SequencesPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Nada por aqui.</div>,
});

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type StepDraft = {
  id?: string;
  position: number;
  name: string;
  description?: string | null;
  flow_id: string | null;
  delay_value: number;
  delay_unit: "minute" | "hour" | "day" | "week" | "month";
  use_custom_window: boolean;
  window_start?: string | null;
  window_end?: string | null;
  weekdays?: number[] | null;
  message_interval_seconds?: number | null;
  max_retries: number;
  retry_interval_minutes: number;
  on_error: "retry" | "skip" | "pause" | "remove" | "notify";
  end_sequence: boolean;
};

type SeqDraft = {
  id?: string;
  connection_id: string | null;
  name: string;
  description: string;
  status: "draft" | "active" | "paused";
  window_start: string;
  window_end: string;
  weekdays: number[];
  timezone: string;
  message_interval_seconds: number;
  reenroll_policy: "skip" | "restart" | "continue" | "new_run" | "remove_reenroll";
  keywords: string[];
  keyword_match: "exact" | "contains";
  keyword_ignore_case: boolean;
  keyword_ignore_accents: boolean;
  entry_sources: string[];
  starts_at: string | null;
  ends_at: string | null;
  steps: StepDraft[];
};

const emptyDraft = (): SeqDraft => ({
  connection_id: null,
  name: "Nova sequência",
  description: "",
  status: "draft",
  window_start: "08:00",
  window_end: "20:00",
  weekdays: [1, 2, 3, 4, 5],
  timezone: "America/Sao_Paulo",
  message_interval_seconds: 5,
  reenroll_policy: "skip",
  keywords: [],
  keyword_match: "contains",
  keyword_ignore_case: true,
  keyword_ignore_accents: true,
  entry_sources: ["manual", "keyword", "workflow"],
  starts_at: null,
  ends_at: null,
  steps: [defaultStep(0)],
});

function defaultStep(pos: number): StepDraft {
  return {
    position: pos,
    name: `Etapa ${pos + 1}`,
    description: "",
    flow_id: null,
    delay_value: pos === 0 ? 0 : 1,
    delay_unit: "day",
    use_custom_window: false,
    window_start: null,
    window_end: null,
    weekdays: null,
    message_interval_seconds: null,
    max_retries: 3,
    retry_interval_minutes: 5,
    on_error: "retry",
    end_sequence: false,
  };
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-border",
    active: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    paused: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  };
  const labels: Record<string, string> = { draft: "Rascunho", active: "Ativa", paused: "Pausada" };
  return (
    <Badge variant="outline" className={map[status] ?? map.draft}>
      {labels[status] ?? status}
    </Badge>
  );
}

function SequencesPage() {
  const listFn = useServerFn(listSequences);
  const getFn = useServerFn(getSequence);
  const saveFn = useServerFn(saveSequence);
  const delFn = useServerFn(deleteSequence);
  const dupFn = useServerFn(duplicateSequence);
  const statusFn = useServerFn(setSequenceStatus);
  const listFlowsFn = useServerFn(listFlows);
  const qc = useQueryClient();

  const seqs = useQuery({
    queryKey: ["sequences"],
    queryFn: () => listFn(),
    refetchInterval: 5000,
  });
  const flowsQ = useQuery({ queryKey: ["flows-sequences"], queryFn: () => listFlowsFn() });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SeqDraft | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const flows = ((flowsQ.data as { flows?: Array<{ id: string; name: string }> } | undefined)
    ?.flows ?? []) as Array<{ id: string; name: string }>;

  const openNew = () => {
    setEditing(emptyDraft());
    setEditorOpen(true);
  };
  const openEdit = async (id: string) => {
    const r = await getFn({ data: { id } });
    const s = r.sequence as Record<string, unknown>;
    const steps = ((r.steps ?? []) as StepDraft[]).map((st, i) => ({ ...st, position: i }));
    setEditing({
      id: s.id as string,
      connection_id: (s.connection_id as string) ?? null,
      name: s.name as string,
      description: (s.description as string) ?? "",
      status: s.status as SeqDraft["status"],
      window_start: (s.window_start as string) ?? "08:00",
      window_end: (s.window_end as string) ?? "20:00",
      weekdays: (s.weekdays as number[]) ?? [1, 2, 3, 4, 5],
      timezone: (s.timezone as string) ?? "America/Sao_Paulo",
      message_interval_seconds: (s.message_interval_seconds as number) ?? 5,
      reenroll_policy: (s.reenroll_policy as SeqDraft["reenroll_policy"]) ?? "skip",
      keywords: (s.keywords as string[]) ?? [],
      keyword_match: (s.keyword_match as SeqDraft["keyword_match"]) ?? "contains",
      keyword_ignore_case: (s.keyword_ignore_case as boolean) ?? true,
      keyword_ignore_accents: (s.keyword_ignore_accents as boolean) ?? true,
      entry_sources: (s.entry_sources as string[]) ?? ["manual", "keyword", "workflow"],
      starts_at: (s.starts_at as string) ?? null,
      ends_at: (s.ends_at as string) ?? null,
      steps: steps.length ? steps : [defaultStep(0)],
    });
    setEditorOpen(true);
  };

  const saveM = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const payload = { ...editing, steps: editing.steps.map((s, i) => ({ ...s, position: i })) };
      return saveFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("Sequência salva");
      qc.invalidateQueries({ queryKey: ["sequences"] });
      setEditorOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = (seqs.data?.rows ?? []) as Array<
    Record<string, unknown> & {
      steps_count: number;
      enroll_stats: { total: number; active: number; done: number; next: string | null };
    }
  >;

  // Agregados premium
  const totals = rows.reduce(
    (acc, r) => {
      acc.sequences += 1;
      if (r.status === "active") acc.active += 1;
      acc.contacts += r.enroll_stats.total;
      acc.running += r.enroll_stats.active;
      acc.done += r.enroll_stats.done;
      acc.steps += r.steps_count;
      return acc;
    },
    { sequences: 0, active: 0, contacts: 0, running: 0, done: 0, steps: 0 },
  );
  const globalPct = totals.contacts ? Math.round((totals.done / totals.contacts) * 100) : 0;

  const metrics = [
    { title: "Sequências", value: totals.sequences, icon: Layers, accent: "#3478ff" },
    { title: "Ativas", value: totals.active, icon: Activity, accent: "#19d98b" },
    { title: "Contatos inscritos", value: totals.contacts, icon: Users, accent: "#a855f7" },
    { title: "Em andamento", value: totals.running, icon: Timer, accent: "#f59e0b" },
    { title: "Concluídos", value: totals.done, icon: CheckCircle2, accent: "#19d3e6" },
    { title: "Taxa conclusão", value: `${globalPct}%`, icon: TrendingUp, accent: "#ec4899" },
  ] as const;

  return (
    <div
      className="-m-3 sm:-m-6 min-h-[calc(100vh-3rem)] p-3 sm:p-6 text-foreground"
      style={{
        backgroundColor: "var(--background)",
        backgroundImage:
          "radial-gradient(color-mix(in oklch, var(--foreground) 6%, transparent) 1px, transparent 1px), radial-gradient(circle at 15% 10%, rgba(52,120,255,0.14), transparent 32%), radial-gradient(circle at 85% 15%, rgba(124,60,255,0.12), transparent 34%)",
        backgroundSize: "22px 22px, auto, auto",
      }}
    >
      <SequenceHeader onNew={openNew} />

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SequenceHero onNew={openNew} />
        <MetricsGrid metrics={metrics} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3">
            <EmptySequenceState onNew={openNew} />
          </div>
        )}
        {rows.map((s) => {
          const total = s.enroll_stats.total;
          const done = s.enroll_stats.done;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <Card
              key={s.id as string}
              className="relative overflow-hidden border bg-gradient-to-br from-card via-card to-primary/5 hover:shadow-md transition-shadow"
            >
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
              <CardHeader className="pb-2 relative">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{s.name as string}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">
                      {(s.description as string) || "Sem descrição"}
                    </p>
                  </div>
                  <StatusPill status={s.status as string} />
                </div>
              </CardHeader>
              <CardContent className="relative space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border bg-background/60 p-2">
                    <div className="text-lg font-semibold">{s.steps_count}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">Etapas</div>
                  </div>
                  <div className="rounded-lg border bg-background/60 p-2">
                    <div className="text-lg font-semibold">{s.enroll_stats.active}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">Em andamento</div>
                  </div>
                  <div className="rounded-lg border bg-background/60 p-2">
                    <div className="text-lg font-semibold">{s.enroll_stats.done}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">Concluídos</div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Conclusão</span>
                    <span className="font-medium">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
                {s.enroll_stats.next && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Próximo disparo:{" "}
                    {new Date(s.enroll_stats.next).toLocaleString("pt-BR")}
                  </p>
                )}
                <div className="flex items-center gap-1 flex-wrap pt-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s.id as string)}>
                    <Settings2 className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setViewingId(s.id as string)}>
                    <Users className="h-3.5 w-3.5" /> Contatos
                  </Button>
                  {s.status === "active" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await statusFn({ data: { id: s.id as string, status: "paused" } });
                        qc.invalidateQueries({ queryKey: ["sequences"] });
                      }}
                    >
                      <Pause className="h-3.5 w-3.5" /> Pausar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={async () => {
                        await statusFn({ data: { id: s.id as string, status: "active" } });
                        qc.invalidateQueries({ queryKey: ["sequences"] });
                        toast.success("Sequência ativada");
                      }}
                    >
                      <Play className="h-3.5 w-3.5" /> Ativar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await dupFn({ data: { id: s.id as string } });
                      qc.invalidateQueries({ queryKey: ["sequences"] });
                      toast.success("Duplicada");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm("Excluir sequência? Todo o histórico será perdido.")) return;
                      await delFn({ data: { id: s.id as string } });
                      qc.invalidateQueries({ queryKey: ["sequences"] });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editing && (
        <SequenceEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          draft={editing}
          setDraft={setEditing}
          flows={flows}
          onSave={() => saveM.mutate()}
          saving={saveM.isPending}
        />
      )}

      {viewingId && <EnrollmentsDrawer sequenceId={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  );
}

// -------------------- PREMIUM HEADER / HERO / METRICS --------------------

function SequenceHeader({ onNew }: { onNew: () => void }) {
  return (
    <header
      className="rounded-[20px] border px-4 py-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center gap-3"
      style={{
        borderColor: "rgba(93,137,255,0.18)",
        background:
          "linear-gradient(145deg, color-mix(in oklch, var(--card) 92%, transparent), color-mix(in oklch, var(--background) 96%, transparent))",
        boxShadow: "0 22px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        style={{
          background: "linear-gradient(135deg, rgba(52,120,255,0.35), rgba(124,60,255,0.35))",
          boxShadow: "0 0 28px rgba(82,85,255,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
          border: "1px solid rgba(135,165,255,0.4)",
        }}
      >
        <Layers className="h-5 w-5 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-none">
            Sequências
          </h1>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{
              borderColor: "rgba(25,217,139,0.35)",
              background: "rgba(25,217,139,0.10)",
              color: "#19d98b",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#19d98b]" />
            Ativo
          </span>
        </div>
        <p className="mt-0.5 text-xs sm:text-[13px] text-muted-foreground max-w-2xl leading-snug">
          Jornadas automatizadas de mensagens com fluxos, janelas de envio e ativação por
          palavra-chave.
        </p>
      </div>
      <button
        type="button"
        onClick={onNew}
        aria-label="Criar nova sequência"
        className="primary-gradient-btn"
      >
        <Plus className="h-4 w-4" /> Nova sequência
      </button>
      <style>{primaryButtonCss}</style>
    </header>
  );
}

const primaryButtonCss = `
.primary-gradient-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 20px;border:1px solid rgba(135,165,255,.42);border-radius:12px;color:#fff;font-weight:600;cursor:pointer;background:linear-gradient(110deg,#2387ff 0%,#4f6cff 48%,#7c3cff 100%);box-shadow:0 10px 30px rgba(61,103,255,.28), inset 0 1px 0 rgba(255,255,255,.25);transition:transform .18s ease, filter .18s ease, box-shadow .18s ease;}
.primary-gradient-btn:hover{transform:translateY(-2px);filter:brightness(1.1);box-shadow:0 14px 36px rgba(82,85,255,.42), 0 0 25px rgba(124,60,255,.22);}
.primary-gradient-btn:active{transform:translateY(0);}
.secondary-dark-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border:1px solid rgba(93,137,255,.28);border-radius:12px;color:#e2e8f0;font-weight:600;cursor:pointer;background:color-mix(in oklch, var(--card) 80%, transparent);transition:transform .18s ease, border-color .18s ease, background .18s ease;}
.secondary-dark-btn:hover{transform:translateY(-2px);border-color:rgba(93,137,255,.5);background:color-mix(in oklch, var(--muted) 90%, transparent);}
.premium-shell{position:relative;overflow:hidden;border:1px solid rgba(93,137,255,.18);border-radius:22px;background:linear-gradient(145deg, color-mix(in oklch, var(--card) 92%, transparent), color-mix(in oklch, var(--background) 96%, transparent));box-shadow:0 22px 60px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.025);}
.step-tile{position:relative;overflow:hidden;border:1px solid rgba(93,137,255,.18);border-radius:16px;background:linear-gradient(160deg, color-mix(in oklch, var(--card) 92%, transparent), color-mix(in oklch, var(--background) 96%, transparent));padding:14px;transition:transform .18s ease, border-color .18s ease;}
.step-tile:hover{transform:translateY(-3px);border-color:rgba(93,137,255,.42);}
.step-tile::after{content:"";position:absolute;left:14px;right:14px;bottom:10px;height:2px;border-radius:2px;background:linear-gradient(90deg,#2387ff,#7c3cff,transparent);}
@keyframes seq-fade-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
.seq-fade{animation:seq-fade-in .5s ease both;}
`;

function SequenceHero({ onNew }: { onNew: () => void }) {
  const steps = [
    {
      icon: Settings2,
      title: "1. Configure",
      desc: "Nome, janelas, palavras-chave e política de reentrada.",
    },
    {
      icon: Workflow,
      title: "2. Monte as etapas",
      desc: "Escolha fluxos, atrasos e tratamento de erros.",
    },
    { icon: Rocket, title: "3. Ative", desc: "Inscreva contatos e acompanhe em tempo real." },
  ];
  return (
    <section className="premium-shell seq-fade p-3.5 sm:p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <HeroWaves />
      </div>
      <div className="relative">
        <div className="space-y-2.5 min-w-0">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
            style={{
              borderColor: "rgba(93,137,255,0.35)",
              background: "rgba(52,120,255,0.08)",
              color: "#a5c0ff",
            }}
          >
            Automação premium de jornadas
          </span>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight leading-[1.2] text-foreground">
            Conduza seus contatos por uma jornada perfeita —{" "}
            <span
              style={{
                background: "linear-gradient(90deg,#51a2ff 0%,#7c3cff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              sem esforço manual.
            </span>
          </h2>
          <p className="text-[12px] text-muted-foreground max-w-xl leading-snug">
            Envie fluxos do WhatsApp em cadência programada (minutos, dias, semanas), respeitando
            janelas e palavras-chave.
          </p>
          <div className="grid auto-rows-fr sm:grid-cols-3 gap-2">
            {steps.map((s) => (
              <JourneyStepCard key={s.title} icon={s.icon} title={s.title} desc={s.desc} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onNew}
              className="primary-gradient-btn"
              aria-label="Criar sequência"
            >
              <Plus className="h-4 w-4" /> Criar sequência
            </button>
            <a href="/flows" className="secondary-dark-btn" aria-label="Abrir Workflows">
              <Workflow className="h-4 w-4" /> Abrir Workflows
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function JourneyStepCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Settings2;
  title: string;
  desc: string;
}) {
  return (
    <div className="step-tile !p-2.5 h-full min-h-[86px]">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="grid h-7 w-7 place-items-center rounded-md"
          style={{
            background: "rgba(52,120,255,0.12)",
            border: "1px solid rgba(93,137,255,0.35)",
            color: "#a5c0ff",
            boxShadow: "0 0 18px rgba(52,120,255,0.18)",
          }}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
    </div>
  );
}

function HeroWaves() {
  return (
    <div className="hidden lg:block relative h-40" aria-hidden="true">
      <svg viewBox="0 0 400 220" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="waveBlue" x1="0" x2="1">
            <stop offset="0%" stopColor="#3478ff" stopOpacity="0" />
            <stop offset="50%" stopColor="#51a2ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7c3cff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wavePurple" x1="0" x2="1">
            <stop offset="0%" stopColor="#7c3cff" stopOpacity="0" />
            <stop offset="50%" stopColor="#a855f7" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#19d3e6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 7 }).map((_, i) => (
          <path
            key={i}
            d={`M0 ${60 + i * 14} Q 120 ${20 + i * 20} 220 ${80 + i * 8} T 400 ${70 + i * 10}`}
            fill="none"
            stroke={i % 2 ? "url(#wavePurple)" : "url(#waveBlue)"}
            strokeWidth={1.1}
            opacity={0.55 - i * 0.05}
          />
        ))}
        {[
          [60, 40],
          [140, 90],
          [230, 50],
          [310, 120],
          [360, 80],
          [190, 160],
          [90, 180],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={1.6} fill="#a5c0ff" opacity={0.8}>
            <animate
              attributeName="opacity"
              values="0.2;1;0.2"
              dur={`${2 + i * 0.3}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
    </div>
  );
}

type MetricEntry = { title: string; value: string | number; icon: typeof Layers; accent: string };

function MetricsGrid({ metrics }: { metrics: readonly MetricEntry[] }) {
  return (
    <div className="grid grid-cols-2 auto-rows-fr gap-2.5 seq-fade content-start">
      {metrics.map((m) => (
        <MetricCard key={m.title} {...m} />
      ))}
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, accent }: MetricEntry) {
  return (
    <article
      className="group relative flex h-full min-h-[74px] overflow-hidden rounded-xl border p-2.5 transition-all duration-200 hover:-translate-y-1"
      style={{
        borderColor: `${accent}45`,
        background: `linear-gradient(135deg, ${accent}1f 0%, color-mix(in oklch, var(--background) 96%, transparent) 65%)`,
        boxShadow: `0 10px 28px rgba(0,0,0,.28)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-3xl transition-opacity group-hover:opacity-90"
        style={{ backgroundColor: `${accent}25` }}
      />
      <div className="relative flex w-full items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
          style={{
            color: accent,
            borderColor: `${accent}55`,
            backgroundColor: `${accent}14`,
            boxShadow: `0 0 24px ${accent}33`,
          }}
        >
          <Icon size={16} strokeWidth={1.9} />
        </div>
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground truncate">
            {title}
          </p>
          <strong className="mt-0.5 block text-lg font-bold tracking-tight text-foreground leading-none">
            {value}
          </strong>
        </div>
      </div>
    </article>
  );
}

function EmptySequenceState({ onNew }: { onNew: () => void }) {
  return (
    <div
      className="relative overflow-hidden rounded-[22px] border-2 border-dashed py-8 px-6 text-center seq-fade"
      style={{
        borderColor: "rgba(93,137,255,0.22)",
        background:
          "radial-gradient(circle at 50% 20%, rgba(52,120,255,0.10), transparent 55%), linear-gradient(160deg, color-mix(in oklch, var(--card) 92%, transparent), color-mix(in oklch, var(--background) 96%, transparent))",
        backgroundImage:
          "radial-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), radial-gradient(circle at 50% 20%, rgba(52,120,255,0.10), transparent 55%), linear-gradient(160deg, color-mix(in oklch, var(--card) 92%, transparent), color-mix(in oklch, var(--background) 96%, transparent))",
        backgroundSize: "18px 18px, auto, auto",
      }}
    >
      <div
        className="mx-auto grid h-12 w-12 place-items-center rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(52,120,255,0.25), rgba(124,60,255,0.25))",
          border: "1px solid rgba(135,165,255,0.35)",
          boxShadow: "0 0 32px rgba(82,85,255,0.35)",
          color: "#e6ecff",
        }}
      >
        <Wand2 className="h-6 w-6" />
      </div>
      <h2 className="mt-3 text-base sm:text-lg font-semibold text-foreground">
        Crie sua primeira sequência
      </h2>
      <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
        Inscreva contatos em uma jornada e envie fluxos automaticamente ao longo de dias, semanas ou
        meses — respeitando janelas de horário e palavras-chave.
      </p>
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={onNew}
          className="primary-gradient-btn"
          aria-label="Nova sequência"
        >
          <Plus className="h-4 w-4" /> Nova sequência
        </button>
      </div>
    </div>
  );
}

// -------------------- EDITOR --------------------

function SequenceEditor(props: {
  open: boolean;
  onClose: () => void;
  draft: SeqDraft;
  setDraft: (d: SeqDraft) => void;
  flows: Array<{ id: string; name: string }>;
  onSave: () => void;
  saving: boolean;
}) {
  const { open, onClose, draft, setDraft, flows, onSave, saving } = props;
  const [keywordInput, setKeywordInput] = useState("");

  const toggleDay = (d: number) =>
    setDraft({
      ...draft,
      weekdays: draft.weekdays.includes(d)
        ? draft.weekdays.filter((x) => x !== d)
        : [...draft.weekdays, d].sort(),
    });

  const addStep = () =>
    setDraft({ ...draft, steps: [...draft.steps, defaultStep(draft.steps.length)] });
  const removeStep = (i: number) =>
    setDraft({ ...draft, steps: draft.steps.filter((_, idx) => idx !== i) });
  const updateStep = (i: number, patch: Partial<StepDraft>) =>
    setDraft({
      ...draft,
      steps: draft.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    });
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.steps.length) return;
    const next = [...draft.steps];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft({ ...draft, steps: next });
  };

  const addKeyword = () => {
    const t = keywordInput.trim();
    if (!t) return;
    if (draft.keywords.includes(t)) return;
    setDraft({ ...draft, keywords: [...draft.keywords, t] });
    setKeywordInput("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-5xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 border-0 text-foreground"
        style={{
          background:
            "linear-gradient(160deg, color-mix(in oklch, var(--primary) 12%, var(--card)) 0%, var(--card) 60%, var(--card) 100%)",
          boxShadow:
            "0 30px 80px color-mix(in oklch, var(--foreground) 25%, transparent), inset 0 1px 0 color-mix(in oklch, var(--foreground) 4%, transparent)",
          border: "1px solid color-mix(in oklch, var(--primary) 22%, transparent)",
          borderRadius: 20,
        }}
      >
        <div
          className="p-5"
          style={{
            background:
              "linear-gradient(120deg, rgba(52,120,255,.18), rgba(124,60,255,.10) 60%, transparent)",
            borderBottom: "1px solid rgba(93,137,255,.18)",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-xl text-foreground">
              <div
                className="grid h-10 w-10 place-items-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg,#2387ff,#7c3cff)",
                  boxShadow:
                    "0 10px 30px rgba(61,103,255,.35), inset 0 1px 0 rgba(255,255,255,.25)",
                  color: "#fff",
                }}
              >
                <Layers className="h-5 w-5" />
              </div>
              {draft.id ? "Editar sequência" : "Nova sequência"}
            </DialogTitle>
          </DialogHeader>
        </div>

        <Tabs defaultValue="geral" className="p-5">
          <TabsList
            className="gap-1 p-1 h-auto"
            style={{
              background: "color-mix(in oklch, var(--card) 80%, transparent)",
              border: "1px solid rgba(93,137,255,.18)",
              borderRadius: 12,
            }}
          >
            <TabsTrigger
              value="geral"
              className="gap-1.5 data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#2387ff] data-[state=active]:to-[#7c3cff] text-muted-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" /> Geral
            </TabsTrigger>
            <TabsTrigger
              value="janela"
              className="gap-1.5 data-[state=active]:text-foreground data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#2387ff] data-[state=active]:to-[#7c3cff] text-muted-foreground"
            >
              <Clock className="h-3.5 w-3.5" /> Janela & regras
            </TabsTrigger>
            <TabsTrigger
              value="keywords"
              className="gap-1.5 data-[state=active]:text-foreground data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#2387ff] data-[state=active]:to-[#7c3cff] text-muted-foreground"
            >
              <KeyRound className="h-3.5 w-3.5" /> Palavras-chave
            </TabsTrigger>
            <TabsTrigger
              value="etapas"
              className="gap-1.5 data-[state=active]:text-foreground data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#2387ff] data-[state=active]:to-[#7c3cff] text-muted-foreground"
            >
              <Zap className="h-3.5 w-3.5" /> Etapas ({draft.steps.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="space-y-4 mt-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft({ ...draft, status: v as SeqDraft["status"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="paused">Pausada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label>
                  Início <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={draft.starts_at ?? ""}
                  onChange={(e) => setDraft({ ...draft, starts_at: e.target.value || null })}
                />
              </div>
              <div>
                <Label>
                  Fim <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={draft.ends_at ?? ""}
                  onChange={(e) => setDraft({ ...draft, ends_at: e.target.value || null })}
                />
              </div>
              <div>
                <Label>Fuso horário</Label>
                <Input
                  value={draft.timezone}
                  onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="janela" className="space-y-5 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" /> Dias permitidos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((lbl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-all ${draft.weekdays.includes(i) ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-muted/30 hover:bg-muted"}`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> Faixa de horário
                </CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label>Início</Label>
                  <Input
                    type="time"
                    value={draft.window_start}
                    onChange={(e) => setDraft({ ...draft, window_start: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input
                    type="time"
                    value={draft.window_end}
                    onChange={(e) => setDraft({ ...draft, window_end: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Intervalo entre mensagens (seg)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.message_interval_seconds}
                    onChange={(e) =>
                      setDraft({ ...draft, message_interval_seconds: Number(e.target.value) })
                    }
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Repeat2 className="h-4 w-4 text-primary" /> Contatos já inscritos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={draft.reenroll_policy}
                  onValueChange={(v) =>
                    setDraft({ ...draft, reenroll_policy: v as SeqDraft["reenroll_policy"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Não fazer nada (padrão)</SelectItem>
                    <SelectItem value="restart">Reiniciar do começo</SelectItem>
                    <SelectItem value="continue">Continuar da etapa atual</SelectItem>
                    <SelectItem value="new_run">Criar uma nova execução</SelectItem>
                    <SelectItem value="remove_reenroll">Remover e inscrever novamente</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="keywords" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Quando um contato enviar qualquer uma dessas palavras-chave, será inscrito
              automaticamente respeitando as regras acima.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: quero começar"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button onClick={addKeyword}>
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.keywords.map((k) => (
                <Badge key={k} variant="secondary" className="gap-1 pl-3 pr-1">
                  {k}
                  <button
                    className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                    onClick={() =>
                      setDraft({ ...draft, keywords: draft.keywords.filter((x) => x !== k) })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {draft.keywords.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma palavra-chave. A ativação por palavra-chave ficará desligada.
                </p>
              )}
            </div>
            <div className="grid md:grid-cols-3 gap-3 pt-2">
              <div>
                <Label>Correspondência</Label>
                <Select
                  value={draft.keyword_match}
                  onValueChange={(v) =>
                    setDraft({ ...draft, keyword_match: v as SeqDraft["keyword_match"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contida na mensagem</SelectItem>
                    <SelectItem value="exact">Exata</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={draft.keyword_ignore_case}
                  onCheckedChange={(v) => setDraft({ ...draft, keyword_ignore_case: v })}
                />
                <Label>Ignorar maiúsculas/minúsculas</Label>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={draft.keyword_ignore_accents}
                  onCheckedChange={(v) => setDraft({ ...draft, keyword_ignore_accents: v })}
                />
                <Label>Ignorar acentos</Label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="etapas" className="space-y-3 mt-4">
            <div className="text-sm text-muted-foreground">
              Cada etapa executa um fluxo do módulo Workflow. A etapa 1 dispara conforme o próprio
              delay (0 = imediato).
            </div>
            <div className="space-y-3">
              {draft.steps.map((st, i) => (
                <StepCard
                  key={i}
                  idx={i}
                  step={st}
                  flows={flows}
                  onChange={(patch) => updateStep(i, patch)}
                  onRemove={() => removeStep(i)}
                  onMove={(dir) => moveStep(i, dir)}
                  canRemove={draft.steps.length > 1}
                />
              ))}
            </div>
            <Button variant="outline" onClick={addStep}>
              <Plus className="h-4 w-4" /> Adicionar etapa
            </Button>
          </TabsContent>
        </Tabs>

        <div
          className="p-4 flex items-center justify-between"
          style={{
            borderTop: "1px solid rgba(93,137,255,.18)",
            background: "color-mix(in oklch, var(--background) 96%, transparent)",
          }}
        >
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-[#a5c0ff]" /> Alterações só passam a valer após
            salvar.
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="secondary-dark-btn">
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="primary-gradient-btn disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}{" "}
              Salvar sequência
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepCard(props: {
  idx: number;
  step: StepDraft;
  flows: Array<{ id: string; name: string }>;
  onChange: (p: Partial<StepDraft>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  canRemove: boolean;
}) {
  const { idx, step, flows, onChange, onRemove, onMove, canRemove } = props;
  return (
    <Card className="border bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary font-semibold">
              {idx + 1}
            </div>
            <Input
              className="h-8 w-64"
              value={step.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => onMove(-1)}>
              <GripVertical className="h-3.5 w-3.5 rotate-90" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onMove(1)}>
              <GripVertical className="h-3.5 w-3.5 -rotate-90" />
            </Button>
            <Button size="sm" variant="ghost" disabled={!canRemove} onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <Label>Fluxo do Workflow</Label>
          <Select
            value={step.flow_id ?? ""}
            onValueChange={(v) => onChange({ flow_id: v || null })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar fluxo…" />
            </SelectTrigger>
            <SelectContent>
              {flows.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Aguardar</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              min={0}
              value={step.delay_value}
              onChange={(e) => onChange({ delay_value: Number(e.target.value) })}
            />
            <Select
              value={step.delay_unit}
              onValueChange={(v) => onChange({ delay_unit: v as StepDraft["delay_unit"] })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minute">minuto(s)</SelectItem>
                <SelectItem value="hour">hora(s)</SelectItem>
                <SelectItem value="day">dia(s)</SelectItem>
                <SelectItem value="week">semana(s)</SelectItem>
                <SelectItem value="month">mês(es)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Em caso de erro</Label>
          <Select
            value={step.on_error}
            onValueChange={(v) => onChange({ on_error: v as StepDraft["on_error"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="retry">Tentar novamente</SelectItem>
              <SelectItem value="skip">Pular etapa</SelectItem>
              <SelectItem value="pause">Pausar contato</SelectItem>
              <SelectItem value="remove">Remover contato</SelectItem>
              <SelectItem value="notify">Só notificar</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-4 flex items-center gap-4 flex-wrap pt-1">
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={step.end_sequence}
              onCheckedChange={(v) => onChange({ end_sequence: v })}
            />
            Encerrar sequência após esta etapa
          </label>
          <label className="flex items-center gap-2 text-xs">
            Tentativas máx.
            <Input
              className="h-7 w-16"
              type="number"
              min={0}
              value={step.max_retries}
              onChange={(e) => onChange({ max_retries: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            Intervalo retry (min)
            <Input
              className="h-7 w-16"
              type="number"
              min={1}
              value={step.retry_interval_minutes}
              onChange={(e) => onChange({ retry_interval_minutes: Number(e.target.value) })}
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

// -------------------- ENROLLMENTS DRAWER --------------------

function EnrollmentsDrawer({ sequenceId, onClose }: { sequenceId: string; onClose: () => void }) {
  const listEn = useServerFn(listEnrollments);
  const actionFn = useServerFn(enrollmentAction);
  const enrollFn = useServerFn(enrollContacts);
  const contactsFn = useServerFn(listContacts);
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");

  const enrolls = useQuery({
    queryKey: ["enrollments", sequenceId, statusFilter],
    queryFn: () => listEn({ data: { sequence_id: sequenceId, status: statusFilter } }),
    refetchInterval: 5000,
  });
  const contacts = useQuery({
    queryKey: ["contacts-for-enroll"],
    enabled: enrollOpen,
    queryFn: () => contactsFn({ data: { q: "", status: "active", page: 1, pageSize: 500 } }),
  });

  const rows = (enrolls.data?.rows ?? []) as Array<Record<string, unknown>>;
  const statusColor: Record<string, string> = {
    scheduled: "text-blue-500",
    waiting: "text-muted-foreground",
    running: "text-primary",
    paused: "text-amber-500",
    completed: "text-emerald-500",
    cancelled: "text-muted-foreground",
    error: "text-destructive",
    out_of_window: "text-amber-500",
  };
  const statusLabel: Record<string, string> = {
    scheduled: "Agendado",
    waiting: "Aguardando",
    running: "Em andamento",
    paused: "Pausado",
    completed: "Concluído",
    cancelled: "Cancelado",
    error: "Com erro",
    out_of_window: "Fora da janela",
  };

  const doAction = async (id: string, action: string) => {
    await actionFn({ data: { id, action: action as never } });
    qc.invalidateQueries({ queryKey: ["enrollments", sequenceId] });
  };

  const doEnroll = async () => {
    const phones = phoneInput
      .split(/[\s,;\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!phones.length) return toast.error("Informe pelo menos um telefone");
    const r = await enrollFn({ data: { sequence_id: sequenceId, phones, source: "manual" } });
    toast.success(`${r.created} inscritos, ${r.restarted} reiniciados, ${r.skipped} ignorados`);
    setEnrollOpen(false);
    setPhoneInput("");
    qc.invalidateQueries({ queryKey: ["enrollments", sequenceId] });
    qc.invalidateQueries({ queryKey: ["sequences"] });
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Contatos inscritos
          </SheetTitle>
        </SheetHeader>
        <div className="flex items-center gap-2 mt-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="scheduled">Agendados</SelectItem>
              <SelectItem value="running">Em andamento</SelectItem>
              <SelectItem value="paused">Pausados</SelectItem>
              <SelectItem value="completed">Concluídos</SelectItem>
              <SelectItem value="error">Com erro</SelectItem>
              <SelectItem value="out_of_window">Fora da janela</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <Button size="sm" onClick={() => setEnrollOpen(true)}>
              <Plus className="h-4 w-4" /> Inscrever
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum contato nesta sequência ainda.
            </p>
          )}
          {rows.map((e) => (
            <div key={e.id as string} className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{e.phone as string}</div>
                  <div className={`text-xs ${statusColor[e.status as string] ?? ""}`}>
                    {statusLabel[e.status as string] ?? (e.status as string)} · Etapa{" "}
                    {(e.current_step as number) + 1}
                  </div>
                </div>
                <div className="flex gap-1">
                  {e.status === "paused" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => doAction(e.id as string, "resume")}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  ) : e.status !== "completed" && e.status !== "cancelled" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => doAction(e.id as string, "pause")}
                    >
                      <Pause className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => doAction(e.id as string, "skip_step")}
                    title="Pular etapa"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => doAction(e.id as string, "restart")}
                    title="Reiniciar"
                  >
                    <Repeat2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => doAction(e.id as string, "remove")}
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
                <span>Inscrito em {new Date(e.entry_at as string).toLocaleString("pt-BR")}</span>
                {e.next_run_at ? (
                  <span>
                    · Próximo envio {new Date(e.next_run_at as string).toLocaleString("pt-BR")}
                  </span>
                ) : null}
                {e.last_error ? (
                  <span className="text-destructive">· {e.last_error as string}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inscrever contatos</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Telefones (um por linha ou separados por vírgula)</Label>
              <Textarea
                rows={6}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="5511999999999&#10;5511888888888"
              />
              {(
                contacts.data as
                  | { rows?: Array<{ id: string; phone: string; name: string | null }> }
                  | undefined
              )?.rows && (
                <details>
                  <summary className="text-xs text-muted-foreground cursor-pointer">
                    Escolher dos meus contatos ({(contacts.data as { rows: unknown[] }).rows.length}
                    )
                  </summary>
                  <div className="max-h-48 overflow-y-auto border rounded mt-2 divide-y">
                    {(
                      contacts.data as {
                        rows: Array<{ id: string; phone: string; name: string | null }>;
                      }
                    ).rows
                      .slice(0, 100)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-2 py-1 text-xs hover:bg-muted"
                          onClick={() => setPhoneInput((p) => (p ? p + "\n" : "") + c.phone)}
                        >
                          {c.name ?? c.phone}{" "}
                          <span className="text-muted-foreground">{c.phone}</span>
                        </button>
                      ))}
                  </div>
                </details>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEnrollOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={doEnroll}>
                  <Rocket className="h-4 w-4" /> Inscrever
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
