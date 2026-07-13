import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight, CalendarDays, CheckCircle2, Clock, Copy, GripVertical, KeyRound,
  Layers, Loader2, Pause, Play, Plus, Repeat2, Rocket, Settings2, Sparkles,
  Trash2, Users, X, Zap,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { listFlows } from "@/lib/flows.functions";
import { listContacts } from "@/lib/contacts.functions";
import {
  listSequences, saveSequence, getSequence, deleteSequence, duplicateSequence,
  setSequenceStatus, enrollContacts, listEnrollments, enrollmentAction,
} from "@/lib/sequences.functions";

export const Route = createFileRoute("/_authenticated/sequences")({
  head: () => ({ meta: [{ title: "Sequências — Automação de mensagens" }] }),
  component: SequencesPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
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
    position: pos, name: `Etapa ${pos + 1}`, description: "", flow_id: null,
    delay_value: pos === 0 ? 0 : 1, delay_unit: "day",
    use_custom_window: false, window_start: null, window_end: null, weekdays: null,
    message_interval_seconds: null, max_retries: 3, retry_interval_minutes: 5,
    on_error: "retry", end_sequence: false,
  };
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-border",
    active: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    paused: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  };
  const labels: Record<string, string> = { draft: "Rascunho", active: "Ativa", paused: "Pausada" };
  return <Badge variant="outline" className={map[status] ?? map.draft}>{labels[status] ?? status}</Badge>;
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

  const seqs = useQuery({ queryKey: ["sequences"], queryFn: () => listFn(), refetchInterval: 5000 });
  const flowsQ = useQuery({ queryKey: ["flows-sequences"], queryFn: () => listFlowsFn() });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SeqDraft | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const flows = (flowsQ.data?.rows ?? flowsQ.data ?? []) as Array<{ id: string; name: string }>;

  const openNew = () => { setEditing(emptyDraft()); setEditorOpen(true); };
  const openEdit = async (id: string) => {
    const r = await getFn({ data: { id } });
    const s = r.sequence as Record<string, unknown>;
    const steps = ((r.steps ?? []) as StepDraft[]).map((st, i) => ({ ...st, position: i }));
    setEditing({
      id: s.id as string, connection_id: (s.connection_id as string) ?? null,
      name: s.name as string, description: (s.description as string) ?? "",
      status: s.status as SeqDraft["status"],
      window_start: (s.window_start as string) ?? "08:00",
      window_end: (s.window_end as string) ?? "20:00",
      weekdays: (s.weekdays as number[]) ?? [1,2,3,4,5],
      timezone: (s.timezone as string) ?? "America/Sao_Paulo",
      message_interval_seconds: (s.message_interval_seconds as number) ?? 5,
      reenroll_policy: (s.reenroll_policy as SeqDraft["reenroll_policy"]) ?? "skip",
      keywords: (s.keywords as string[]) ?? [],
      keyword_match: (s.keyword_match as SeqDraft["keyword_match"]) ?? "contains",
      keyword_ignore_case: (s.keyword_ignore_case as boolean) ?? true,
      keyword_ignore_accents: (s.keyword_ignore_accents as boolean) ?? true,
      entry_sources: (s.entry_sources as string[]) ?? ["manual","keyword","workflow"],
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
    onSuccess: () => { toast.success("Sequência salva"); qc.invalidateQueries({ queryKey: ["sequences"] }); setEditorOpen(false); },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = (seqs.data?.rows ?? []) as Array<Record<string, unknown> & {
    steps_count: number; enroll_stats: { total: number; active: number; done: number; next: string | null };
  }>;

  return (
    <PageShell
      title="Sequências"
      description="Jornadas automatizadas de mensagens com fluxos, janelas de envio e ativação por palavra-chave."
      icon={<Layers className="h-6 w-6" />}
      status="ativo"
      actions={<Button onClick={openNew}><Plus className="h-4 w-4" /> Nova sequência</Button>}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3 border-dashed">
            <CardContent className="py-14 text-center space-y-3">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Sparkles className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-semibold">Crie sua primeira sequência</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Inscreva contatos numa jornada e envie fluxos automaticamente ao longo de dias, semanas ou meses — respeitando janelas de horário e palavras-chave.
              </p>
              <Button onClick={openNew}><Plus className="h-4 w-4" /> Nova sequência</Button>
            </CardContent>
          </Card>
        )}
        {rows.map((s) => {
          const total = s.enroll_stats.total; const done = s.enroll_stats.done;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <Card key={s.id as string} className="relative overflow-hidden border bg-gradient-to-br from-card via-card to-primary/5 hover:shadow-md transition-shadow">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
              <CardHeader className="pb-2 relative">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{s.name as string}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">{(s.description as string) || "Sem descrição"}</p>
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
                    <Clock className="h-3 w-3" /> Próximo disparo: {new Date(s.enroll_stats.next).toLocaleString("pt-BR")}
                  </p>
                )}
                <div className="flex items-center gap-1 flex-wrap pt-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s.id as string)}><Settings2 className="h-3.5 w-3.5" /> Editar</Button>
                  <Button size="sm" variant="outline" onClick={() => setViewingId(s.id as string)}><Users className="h-3.5 w-3.5" /> Contatos</Button>
                  {s.status === "active" ? (
                    <Button size="sm" variant="outline" onClick={async () => { await statusFn({ data: { id: s.id as string, status: "paused" } }); qc.invalidateQueries({ queryKey: ["sequences"] }); }}>
                      <Pause className="h-3.5 w-3.5" /> Pausar
                    </Button>
                  ) : (
                    <Button size="sm" onClick={async () => { await statusFn({ data: { id: s.id as string, status: "active" } }); qc.invalidateQueries({ queryKey: ["sequences"] }); toast.success("Sequência ativada"); }}>
                      <Play className="h-3.5 w-3.5" /> Ativar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={async () => { await dupFn({ data: { id: s.id as string } }); qc.invalidateQueries({ queryKey: ["sequences"] }); toast.success("Duplicada"); }}><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!confirm("Excluir sequência? Todo o histórico será perdido.")) return;
                    await delFn({ data: { id: s.id as string } });
                    qc.invalidateQueries({ queryKey: ["sequences"] });
                  }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
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

      {viewingId && (
        <EnrollmentsDrawer sequenceId={viewingId} onClose={() => setViewingId(null)} />
      )}
    </PageShell>
  );
}

// -------------------- EDITOR --------------------

function SequenceEditor(props: {
  open: boolean; onClose: () => void;
  draft: SeqDraft; setDraft: (d: SeqDraft) => void;
  flows: Array<{ id: string; name: string }>;
  onSave: () => void; saving: boolean;
}) {
  const { open, onClose, draft, setDraft, flows, onSave, saving } = props;
  const [keywordInput, setKeywordInput] = useState("");

  const toggleDay = (d: number) => setDraft({
    ...draft, weekdays: draft.weekdays.includes(d) ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d].sort(),
  });

  const addStep = () => setDraft({ ...draft, steps: [...draft.steps, defaultStep(draft.steps.length)] });
  const removeStep = (i: number) => setDraft({ ...draft, steps: draft.steps.filter((_, idx) => idx !== i) });
  const updateStep = (i: number, patch: Partial<StepDraft>) => setDraft({
    ...draft, steps: draft.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s),
  });
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= draft.steps.length) return;
    const next = [...draft.steps]; [next[i], next[j]] = [next[j], next[i]];
    setDraft({ ...draft, steps: next });
  };

  const addKeyword = () => {
    const t = keywordInput.trim(); if (!t) return;
    if (draft.keywords.includes(t)) return;
    setDraft({ ...draft, keywords: [...draft.keywords, t] });
    setKeywordInput("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] overflow-y-auto p-0">
        <div className="bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/20 text-primary"><Layers className="h-5 w-5" /></div>
              {draft.id ? "Editar sequência" : "Nova sequência"}
            </DialogTitle>
          </DialogHeader>
        </div>

        <Tabs defaultValue="geral" className="p-5">
          <TabsList>
            <TabsTrigger value="geral"><Settings2 className="h-3.5 w-3.5" /> Geral</TabsTrigger>
            <TabsTrigger value="janela"><Clock className="h-3.5 w-3.5" /> Janela & regras</TabsTrigger>
            <TabsTrigger value="keywords"><KeyRound className="h-3.5 w-3.5" /> Palavras-chave</TabsTrigger>
            <TabsTrigger value="etapas"><Zap className="h-3.5 w-3.5" /> Etapas ({draft.steps.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="space-y-4 mt-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as SeqDraft["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label>Início <span className="text-muted-foreground">(opcional)</span></Label>
                <Input type="datetime-local" value={draft.starts_at ?? ""} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value || null })} />
              </div>
              <div>
                <Label>Fim <span className="text-muted-foreground">(opcional)</span></Label>
                <Input type="datetime-local" value={draft.ends_at ?? ""} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value || null })} />
              </div>
              <div>
                <Label>Fuso horário</Label>
                <Input value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="janela" className="space-y-5 mt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Dias permitidos</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((lbl, i) => (
                    <button key={i} type="button" onClick={() => toggleDay(i)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-all ${draft.weekdays.includes(i) ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-muted/30 hover:bg-muted"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Faixa de horário</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-3">
                <div><Label>Início</Label><Input type="time" value={draft.window_start} onChange={(e) => setDraft({ ...draft, window_start: e.target.value })} /></div>
                <div><Label>Fim</Label><Input type="time" value={draft.window_end} onChange={(e) => setDraft({ ...draft, window_end: e.target.value })} /></div>
                <div><Label>Intervalo entre mensagens (seg)</Label><Input type="number" min={0} value={draft.message_interval_seconds} onChange={(e) => setDraft({ ...draft, message_interval_seconds: Number(e.target.value) })} /></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Repeat2 className="h-4 w-4 text-primary" /> Contatos já inscritos</CardTitle></CardHeader>
              <CardContent>
                <Select value={draft.reenroll_policy} onValueChange={(v) => setDraft({ ...draft, reenroll_policy: v as SeqDraft["reenroll_policy"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
            <p className="text-sm text-muted-foreground">Quando um contato enviar qualquer uma dessas palavras-chave, será inscrito automaticamente respeitando as regras acima.</p>
            <div className="flex gap-2">
              <Input placeholder="Ex: quero começar" value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} />
              <Button onClick={addKeyword}><Plus className="h-4 w-4" /> Adicionar</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.keywords.map((k) => (
                <Badge key={k} variant="secondary" className="gap-1 pl-3 pr-1">
                  {k}
                  <button className="ml-1 rounded-full hover:bg-destructive/20 p-0.5" onClick={() => setDraft({ ...draft, keywords: draft.keywords.filter((x) => x !== k) })}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {draft.keywords.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma palavra-chave. A ativação por palavra-chave ficará desligada.</p>}
            </div>
            <div className="grid md:grid-cols-3 gap-3 pt-2">
              <div>
                <Label>Correspondência</Label>
                <Select value={draft.keyword_match} onValueChange={(v) => setDraft({ ...draft, keyword_match: v as SeqDraft["keyword_match"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Contida na mensagem</SelectItem>
                    <SelectItem value="exact">Exata</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={draft.keyword_ignore_case} onCheckedChange={(v) => setDraft({ ...draft, keyword_ignore_case: v })} />
                <Label>Ignorar maiúsculas/minúsculas</Label>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={draft.keyword_ignore_accents} onCheckedChange={(v) => setDraft({ ...draft, keyword_ignore_accents: v })} />
                <Label>Ignorar acentos</Label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="etapas" className="space-y-3 mt-4">
            <div className="text-sm text-muted-foreground">Cada etapa executa um fluxo do módulo Workflow. A etapa 1 dispara conforme o próprio delay (0 = imediato).</div>
            <div className="space-y-3">
              {draft.steps.map((st, i) => (
                <StepCard key={i} idx={i} step={st} flows={flows}
                  onChange={(patch) => updateStep(i, patch)}
                  onRemove={() => removeStep(i)}
                  onMove={(dir) => moveStep(i, dir)}
                  canRemove={draft.steps.length > 1} />
              ))}
            </div>
            <Button variant="outline" onClick={addStep}><Plus className="h-4 w-4" /> Adicionar etapa</Button>
          </TabsContent>
        </Tabs>

        <div className="border-t p-4 flex items-center justify-between bg-muted/20">
          <div className="text-xs text-muted-foreground">Alterações só passam a valer após salvar.</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Salvar sequência
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepCard(props: {
  idx: number; step: StepDraft; flows: Array<{ id: string; name: string }>;
  onChange: (p: Partial<StepDraft>) => void; onRemove: () => void;
  onMove: (dir: -1 | 1) => void; canRemove: boolean;
}) {
  const { idx, step, flows, onChange, onRemove, onMove, canRemove } = props;
  return (
    <Card className="border bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary font-semibold">{idx + 1}</div>
            <Input className="h-8 w-64" value={step.name} onChange={(e) => onChange({ name: e.target.value })} />
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => onMove(-1)}><GripVertical className="h-3.5 w-3.5 rotate-90" /></Button>
            <Button size="sm" variant="ghost" onClick={() => onMove(1)}><GripVertical className="h-3.5 w-3.5 -rotate-90" /></Button>
            <Button size="sm" variant="ghost" disabled={!canRemove} onClick={onRemove}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <Label>Fluxo do Workflow</Label>
          <Select value={step.flow_id ?? ""} onValueChange={(v) => onChange({ flow_id: v || null })}>
            <SelectTrigger><SelectValue placeholder="Selecionar fluxo…" /></SelectTrigger>
            <SelectContent>
              {flows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Aguardar</Label>
          <div className="flex gap-1">
            <Input type="number" min={0} value={step.delay_value} onChange={(e) => onChange({ delay_value: Number(e.target.value) })} />
            <Select value={step.delay_unit} onValueChange={(v) => onChange({ delay_unit: v as StepDraft["delay_unit"] })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
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
          <Select value={step.on_error} onValueChange={(v) => onChange({ on_error: v as StepDraft["on_error"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Switch checked={step.end_sequence} onCheckedChange={(v) => onChange({ end_sequence: v })} />
            Encerrar sequência após esta etapa
          </label>
          <label className="flex items-center gap-2 text-xs">
            Tentativas máx.
            <Input className="h-7 w-16" type="number" min={0} value={step.max_retries} onChange={(e) => onChange({ max_retries: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 text-xs">
            Intervalo retry (min)
            <Input className="h-7 w-16" type="number" min={1} value={step.retry_interval_minutes} onChange={(e) => onChange({ retry_interval_minutes: Number(e.target.value) })} />
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
    queryKey: ["contacts-for-enroll"], enabled: enrollOpen,
    queryFn: () => contactsFn({ data: { q: "", status: "active", page: 1, pageSize: 500 } }),
  });

  const rows = (enrolls.data?.rows ?? []) as Array<Record<string, unknown>>;
  const statusColor: Record<string, string> = {
    scheduled: "text-blue-500", waiting: "text-muted-foreground", running: "text-primary",
    paused: "text-amber-500", completed: "text-emerald-500",
    cancelled: "text-muted-foreground", error: "text-destructive", out_of_window: "text-amber-500",
  };
  const statusLabel: Record<string, string> = {
    scheduled: "Agendado", waiting: "Aguardando", running: "Em andamento",
    paused: "Pausado", completed: "Concluído", cancelled: "Cancelado",
    error: "Com erro", out_of_window: "Fora da janela",
  };

  const doAction = async (id: string, action: string) => {
    await actionFn({ data: { id, action: action as never } });
    qc.invalidateQueries({ queryKey: ["enrollments", sequenceId] });
  };

  const doEnroll = async () => {
    const phones = phoneInput.split(/[\s,;\n]+/).map((p) => p.trim()).filter(Boolean);
    if (!phones.length) return toast.error("Informe pelo menos um telefone");
    const r = await enrollFn({ data: { sequence_id: sequenceId, phones, source: "manual" } });
    toast.success(`${r.created} inscritos, ${r.restarted} reiniciados, ${r.skipped} ignorados`);
    setEnrollOpen(false); setPhoneInput("");
    qc.invalidateQueries({ queryKey: ["enrollments", sequenceId] });
    qc.invalidateQueries({ queryKey: ["sequences"] });
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Contatos inscritos</SheetTitle>
        </SheetHeader>
        <div className="flex items-center gap-2 mt-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
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
            <Button size="sm" onClick={() => setEnrollOpen(true)}><Plus className="h-4 w-4" /> Inscrever</Button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum contato nesta sequência ainda.</p>}
          {rows.map((e) => (
            <div key={e.id as string} className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{e.phone as string}</div>
                  <div className={`text-xs ${statusColor[e.status as string] ?? ""}`}>
                    {statusLabel[e.status as string] ?? (e.status as string)} · Etapa {(e.current_step as number) + 1}
                  </div>
                </div>
                <div className="flex gap-1">
                  {e.status === "paused" ? (
                    <Button size="sm" variant="outline" onClick={() => doAction(e.id as string, "resume")}><Play className="h-3.5 w-3.5" /></Button>
                  ) : e.status !== "completed" && e.status !== "cancelled" ? (
                    <Button size="sm" variant="outline" onClick={() => doAction(e.id as string, "pause")}><Pause className="h-3.5 w-3.5" /></Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => doAction(e.id as string, "skip_step")} title="Pular etapa"><ArrowRight className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => doAction(e.id as string, "restart")} title="Reiniciar"><Repeat2 className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => doAction(e.id as string, "remove")} title="Remover"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
                <span>Inscrito em {new Date(e.entry_at as string).toLocaleString("pt-BR")}</span>
                {e.next_run_at ? <span>· Próximo envio {new Date(e.next_run_at as string).toLocaleString("pt-BR")}</span> : null}
                {e.last_error ? <span className="text-destructive">· {e.last_error as string}</span> : null}
              </div>
            </div>
          ))}
        </div>

        <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Inscrever contatos</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Label>Telefones (um por linha ou separados por vírgula)</Label>
              <Textarea rows={6} value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="5511999999999&#10;5511888888888" />
              {(contacts.data as { rows?: Array<{ id: string; phone: string; name: string | null }> } | undefined)?.rows && (
                <details>
                  <summary className="text-xs text-muted-foreground cursor-pointer">Escolher dos meus contatos ({(contacts.data as { rows: unknown[] }).rows.length})</summary>
                  <div className="max-h-48 overflow-y-auto border rounded mt-2 divide-y">
                    {((contacts.data as { rows: Array<{ id: string; phone: string; name: string | null }> }).rows).slice(0, 100).map((c) => (
                      <button key={c.id} type="button" className="w-full text-left px-2 py-1 text-xs hover:bg-muted"
                        onClick={() => setPhoneInput((p) => (p ? p + "\n" : "") + c.phone)}>
                        {c.name ?? c.phone} <span className="text-muted-foreground">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                </details>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEnrollOpen(false)}>Cancelar</Button>
                <Button onClick={doEnroll}><Rocket className="h-4 w-4" /> Inscrever</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}