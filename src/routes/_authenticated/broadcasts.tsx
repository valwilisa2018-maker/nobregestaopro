import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Copy, Download, Eye, Filter, Loader2, Pause, Play, Plus, Rocket, Send, StopCircle, Trash2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { listContacts } from "@/lib/contacts.functions";
import {
  cancelBroadcast, createBroadcast, duplicateBroadcast, listBroadcasts, listContactTags,
  pauseBroadcast, previewBroadcast, resumeBroadcast, runBroadcastBatch,
  saveBroadcastSteps, runSequentialBatch, listRecipientsTimeline,
} from "@/lib/broadcasts.functions";
import { listFlows } from "@/lib/flows.functions";

export const Route = createFileRoute("/_authenticated/broadcasts")({
  component: BroadcastsPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Nada por aqui.</div>,
});

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const RATE_PRESETS = [20, 40, 60, 100];
const LIMIT_PRESETS = [500, 1000, 5000];

function BroadcastsPage() {
  const list = useServerFn(listContacts);
  const create = useServerFn(createBroadcast);
  const run = useServerFn(runBroadcastBatch);
  const runSeq = useServerFn(runSequentialBatch);
  const saveSteps = useServerFn(saveBroadcastSteps);
  const timelineFn = useServerFn(listRecipientsTimeline);
  const listB = useServerFn(listBroadcasts);
  const listF = useServerFn(listFlows);
  const listT = useServerFn(listContactTags);
  const preview = useServerFn(previewBroadcast);
  const pauseFn = useServerFn(pauseBroadcast);
  const resumeFn = useServerFn(resumeBroadcast);
  const cancelFn = useServerFn(cancelBroadcast);
  const dupFn = useServerFn(duplicateBroadcast);
  const qc = useQueryClient();

  const contacts = useQuery({
    queryKey: ["contacts-all-for-broadcast"],
    queryFn: () => list({ data: { q: "", status: "active", page: 1, pageSize: 500 } }),
  });
  const broadcasts = useQuery({ queryKey: ["broadcasts"], queryFn: () => listB(), refetchInterval: 4000 });
  const flows = useQuery({ queryKey: ["flows-for-broadcast"], queryFn: () => listF() });
  const tags = useQuery({ queryKey: ["contact-tags"], queryFn: () => listT() });

  const [connections, setConnections] = useState<Array<{ id: string; instance_name: string | null }>>([]);
  useEffect(() => {
    supabase.from("connections").select("id,instance_name").eq("status", "online").then(({ data }) => setConnections(data ?? []));
  }, []);

  // Wizard state
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Campanha " + new Date().toLocaleDateString("pt-BR"));
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("Olá {nome}, tudo bem?");
  const [connectionId, setConnectionId] = useState<string>("");
  const [flowId, setFlowId] = useState<string>("");
  const [mode, setMode] = useState<"quick" | "sequential">("quick");

  // Sequential steps
  type Step = { delay_hours: number; message: string; media_url?: string };
  const [steps, setSteps] = useState<Step[]>([
    { delay_hours: 0, message: "Olá {nome}, tudo bem?" },
    { delay_hours: 24, message: "Passando pra saber se você viu minha mensagem." },
  ]);

  // Timeline dialog
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineRows, setTimelineRows] = useState<any[]>([]);
  const [timelineTitle, setTimelineTitle] = useState("");

  // Source
  const [sourceType, setSourceType] = useState<"list" | "tag" | "segment" | "all">("list");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Rate / humanize / window
  const [rate, setRate] = useState(20);
  const [rateCustom, setRateCustom] = useState(false);
  const [humanizeMin, setHumanizeMin] = useState(5);
  const [humanizeMax, setHumanizeMax] = useState(18);
  const [winStart, setWinStart] = useState("08:00");
  const [winEnd, setWinEnd] = useState("18:00");
  const [useWindow, setUseWindow] = useState(true);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [ignoreHolidays, setIgnoreHolidays] = useState(false);
  const [continueNextDay, setContinueNextDay] = useState(true);
  const [dedupe, setDedupe] = useState(true);
  const [ignoreResponded, setIgnoreResponded] = useState(false);
  const [stopOnReply, setStopOnReply] = useState(false);
  const [dailyLimit, setDailyLimit] = useState<number | null>(1000);
  const [delay, setDelay] = useState(5);
  // Segmentation
  const [segDays, setSegDays] = useState(0);
  const [segExcludeTags, setSegExcludeTags] = useState<string[]>([]);
  // History + timeline filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const [timelineSearch, setTimelineSearch] = useState("");

  const rows = contacts.data?.rows ?? [];
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const allChecked = rows.length > 0 && rows.every((r) => selected[r.id as string]);
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    if (!allChecked) rows.forEach((r) => { next[r.id as string] = true; });
    setSelected(next);
  };

  // Simulation
  const [sim, setSim] = useState<{ total: number; per_hour: number; per_day: number; days: number; finish_at: string } | null>(null);
  useEffect(() => {
    if (step !== 4) return;
    preview({ data: {
      source_type: sourceType, source_value: selectedTags,
      contact_ids: selectedIds, dedupe, rate_per_min: rate, daily_limit: dailyLimit,
      segment_created_days: segDays, segment_exclude_tags: segExcludeTags,
    } }).then(setSim).catch(() => setSim(null));
  }, [step, sourceType, selectedTags, selectedIds, dedupe, rate, dailyLimit, segDays, segExcludeTags, preview]);

  const [runningId, setRunningId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; error: number; total: number; responded: number } | null>(null);
  const [pausedFlag, setPausedFlag] = useState(false);

  const createM = useMutation({
    mutationFn: async () => create({ data: {
      name, description: description || null,
      message: flowId ? "" : message,
      media_url: null, media_type: null,
      connection_id: connectionId || null, flow_id: flowId || null,
      mode,
      source_type: sourceType, source_value: selectedTags,
      contact_ids: selectedIds,
      rate_per_min: rate, humanize_min: humanizeMin, humanize_max: humanizeMax,
      window_start: useWindow ? winStart : null, window_end: useWindow ? winEnd : null,
      weekdays, ignore_holidays: ignoreHolidays, continue_next_day: continueNextDay,
      dedupe, ignore_responded: ignoreResponded, stop_on_reply: stopOnReply,
      daily_limit: dailyLimit, delay_seconds: delay,
      segment_created_days: segDays, segment_exclude_tags: segExcludeTags,
    } }),
    onSuccess: async (res) => {
      toast.success("Campanha criada");
      if (mode === "sequential") {
        try {
          await saveSteps({ data: { broadcast_id: res.id, steps: steps.map((s, i) => ({ step_order: i, delay_hours: s.delay_hours, message: s.message, media_url: s.media_url ?? null })) } });
          await resumeFn({ data: { id: res.id } });
          void loopSeq(res.id);
        } catch (e) { toast.error((e as Error).message); }
      }
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      if (mode === "quick") {
        setRunningId(res.id);
        setProgress({ sent: 0, error: 0, total: res.total, responded: 0 });
        setPausedFlag(false);
        void loop(res.id);
      }
      setStep(1); setSelected({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function loopSeq(id: string) {
    try {
      for (;;) {
        const r = await runSeq({ data: { id, batch: 5 } });
        if (r.paused) { await new Promise((res) => setTimeout(res, 5000)); continue; }
        if (r.done) break;
        await new Promise((res) => setTimeout(res, r.waiting ? 15000 : 3000));
      }
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function openTimeline(id: string, name: string) {
    setTimelineTitle(name);
    setTimelineOpen(true);
    const { rows } = await timelineFn({ data: { id } });
    setTimelineRows(rows);
  }

  async function loop(id: string) {
    try {
      for (;;) {
        const r = await run({ data: { id, batch: 5 } });
        setProgress({ sent: r.sent, error: r.error, total: r.total, responded: r.responded ?? 0 });
        if (r.paused) { setPausedFlag(true); await new Promise((res) => setTimeout(res, 3000)); continue; }
        setPausedFlag(false);
        if (r.done) break;
        if (r.waiting || r.dailyLimit) { await new Promise((res) => setTimeout(res, 5000)); }
      }
      toast.success("Envio concluído");
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  const canNext =
    (step === 1 && ((sourceType === "list" && selectedIds.length > 0) || (sourceType === "tag" && selectedTags.length > 0) || sourceType === "all" || sourceType === "segment")) ||
    (step === 2 && (flowId ? true : message.trim().length > 0)) ||
    (step === 3 && rate > 0) ||
    step === 4;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Send className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Disparos</h1>
          <p className="text-xs text-muted-foreground">Campanhas em massa com humanização, janela de horário e limites</p>
        </div>
      </div>

      {runningId && progress && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> Envio em andamento {pausedFlag && <Badge variant="secondary">Pausado</Badge>}</CardTitle>
            <div className="flex gap-2">
              {!pausedFlag ? (
                <Button size="sm" variant="outline" onClick={async () => { await pauseFn({ data: { id: runningId } }); setPausedFlag(true); }}><Pause className="h-3.5 w-3.5" /> Pausar</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={async () => { await resumeFn({ data: { id: runningId } }); setPausedFlag(false); void loop(runningId); }}><Play className="h-3.5 w-3.5" /> Continuar</Button>
              )}
              <Button size="sm" variant="destructive" onClick={async () => { await cancelFn({ data: { id: runningId } }); setRunningId(null); }}><StopCircle className="h-3.5 w-3.5" /> Cancelar</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress.total ? ((progress.sent + progress.error) / progress.total) * 100 : 0} />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <Stat label="Enviados" value={progress.sent} tone="ok" />
              <Stat label="Pendentes" value={Math.max(0, progress.total - progress.sent - progress.error)} />
              <Stat label="Falhas" value={progress.error} tone="err" />
              <Stat label="Respondidos" value={progress.responded} />
              <Stat label="Total" value={progress.total} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{n}</div>
            {n < 4 && <div className={`h-0.5 w-10 ${step > n ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
        <div className="ml-3 text-sm text-muted-foreground">
          {step === 1 && "Origem dos contatos"} {step === 2 && "Conteúdo"} {step === 3 && "Configuração"} {step === 4 && "Simulação & envio"}
        </div>
      </div>

      <Card><CardContent className="p-6 space-y-4">
        {step === 1 && (
          <div className="space-y-4">
            <RadioGroup value={sourceType} onValueChange={(v) => setSourceType(v as never)} className="grid md:grid-cols-4 gap-2">
              {[
                { v: "list", l: "Lista" },
                { v: "tag", l: "Tag" },
                { v: "segment", l: "Segmentação" },
                { v: "all", l: "Todos" },
              ].map((o) => (
                <label key={o.v} className={`border rounded-lg p-3 cursor-pointer text-sm flex items-center gap-2 ${sourceType === o.v ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value={o.v} /> {o.l}
                </label>
              ))}
            </RadioGroup>

            {sourceType === "list" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Contatos</h3>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{selectedIds.length} selecionado(s)</span>
                    <Button size="sm" variant="outline" onClick={toggleAll}>{allChecked ? "Desmarcar todos" : "Selecionar todos"}</Button>
                  </div>
                </div>
                <div className="border rounded-lg max-h-[420px] overflow-y-auto">
                  {contacts.isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
                    : rows.length === 0 ? <div className="p-6 text-sm text-muted-foreground">Sem contatos.</div>
                    : rows.map((r) => (
                      <label key={r.id as string} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-accent/30 cursor-pointer">
                        <Checkbox checked={!!selected[r.id as string]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id as string]: !!v }))} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{(r.name as string) || "Sem nome"}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">{r.phone as string}</div>
                        </div>
                      </label>
                    ))}
                </div>
              </div>
            )}

            {sourceType === "tag" && (
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {(tags.data?.tags ?? []).length === 0 && <span className="text-sm text-muted-foreground">Nenhuma tag cadastrada.</span>}
                  {(tags.data?.tags ?? []).map((t) => {
                    const on = selectedTags.includes(t);
                    return (
                      <button key={t} type="button" onClick={() => setSelectedTags((xs) => on ? xs.filter((x) => x !== t) : [...xs, t])}
                        className={`px-3 py-1.5 rounded-full text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-muted"}`}>{t}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {(sourceType === "all" || sourceType === "segment") && (
              <p className="text-sm text-muted-foreground">Todos os contatos ativos serão incluídos.</p>
            )}

            {sourceType === "segment" && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                <div className="font-semibold text-sm flex items-center gap-2"><Filter className="h-4 w-4" /> Segmentação</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Cadastrados nos últimos (dias)</Label>
                    <Input type="number" min={0} value={segDays} onChange={(e) => setSegDays(Number(e.target.value) || 0)} placeholder="0 = todos" />
                  </div>
                  <div>
                    <Label className="text-xs">Excluir tags</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(tags.data?.tags ?? []).length === 0 && <span className="text-xs text-muted-foreground">Nenhuma tag.</span>}
                      {(tags.data?.tags ?? []).map((t) => {
                        const on = segExcludeTags.includes(t);
                        return (
                          <button key={t} type="button" onClick={() => setSegExcludeTags((xs) => on ? xs.filter((x) => x !== t) : [...xs, t])}
                            className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-destructive text-destructive-foreground border-destructive" : "bg-muted"}`}>{on ? "− " : ""}{t}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div><Label>Nome da campanha</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Descrição (opcional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
            {!flowId && (
              <div>
                <Label>Mensagem</Label>
                <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Olá {nome}..." />
                <p className="text-xs text-muted-foreground mt-1">Variáveis: <code>{"{nome}"}</code>, <code>{"{telefone}"}</code></p>
              </div>
            )}
            {flowId && (
              <div className="border rounded-lg p-3 bg-primary/5 text-sm text-muted-foreground">
                Um fluxo foi selecionado — o conteúdo (mensagens, mídias, etc.) será enviado pelo fluxo. O campo de mensagem foi desativado.
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Instância WhatsApp</Label>
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.instance_name ?? c.id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fluxo (opcional)</Label>
                <Select value={flowId || "__none__"} onValueChange={(v) => setFlowId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum — enviar mensagem</SelectItem>
                    {(flows.data?.flows ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as never)} className="grid md:grid-cols-2 gap-3">
              <label className={`border rounded-lg p-4 cursor-pointer ${mode === "quick" ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex items-start gap-3"><RadioGroupItem value="quick" />
                  <div><div className="font-semibold flex items-center gap-2"><Rocket className="h-4 w-4" /> Massa</div><p className="text-xs text-muted-foreground mt-1">Envio único agora.</p></div>
                </div>
              </label>
              <label className={`border rounded-lg p-4 cursor-pointer ${mode === "sequential" ? "border-primary bg-primary/5" : ""}`}>
                <div className="flex items-start gap-3"><RadioGroupItem value="sequential" />
                  <div><div className="font-semibold flex items-center gap-2"><Clock className="h-4 w-4" /> Sequencial</div><p className="text-xs text-muted-foreground mt-1">Envio programado por dias.</p></div>
                </div>
              </label>
            </RadioGroup>

            {mode === "sequential" && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Etapas da sequência</div>
                  <Button size="sm" variant="outline" onClick={() => setSteps((s) => [...s, { delay_hours: 24, message: "" }])}><Plus className="h-3.5 w-3.5" /> Nova etapa</Button>
                </div>
                {steps.map((s, i) => (
                  <div key={i} className="border rounded-md p-3 space-y-2 bg-background">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">Etapa {i + 1}</Badge>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Aguardar (horas)</Label>
                        <Input type="number" min={0} value={s.delay_hours} onChange={(e) => setSteps((xs) => xs.map((x, j) => j === i ? { ...x, delay_hours: Number(e.target.value) || 0 } : x))} className="w-24 h-8" disabled={i === 0} />
                        {steps.length > 1 && <Button size="sm" variant="ghost" onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </div>
                    <Textarea rows={3} value={s.message} onChange={(e) => setSteps((xs) => xs.map((x, j) => j === i ? { ...x, message: e.target.value } : x))} placeholder="Mensagem da etapa..." />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">A etapa 1 dispara imediatamente. As próximas aguardam o tempo indicado desde o envio anterior.</p>
              </div>
            )}

            <div className="space-y-3">
              <Label>Velocidade (mensagens por minuto)</Label>
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-primary/5">
                <Switch
                  checked={rate >= 240 && humanizeMin === 0 && humanizeMax === 0 && !useWindow}
                  onCheckedChange={(on) => {
                    if (on) {
                      setRate(300); setRateCustom(true);
                      setHumanizeMin(0); setHumanizeMax(0);
                      setUseWindow(false);
                      setDailyLimit(null);
                      setDelay(1);
                    } else {
                      setRate(20); setRateCustom(false);
                      setHumanizeMin(5); setHumanizeMax(18);
                      setUseWindow(true);
                      setDailyLimit(1000);
                      setDelay(5);
                    }
                  }}
                />
                <div className="flex-1">
                  <Label className="cursor-pointer">Enviar agora (sem intervalo)</Label>
                  <p className="text-xs text-muted-foreground">Dispara todos os contatos imediatamente, sem humanização nem janela de horário.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {RATE_PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => { setRate(p); setRateCustom(false); }}
                    className={`px-3 py-1.5 rounded-full text-xs border ${!rateCustom && rate === p ? "bg-primary text-primary-foreground border-primary" : "bg-muted"}`}>{p}/min</button>
                ))}
                <button type="button" onClick={() => setRateCustom(true)} className={`px-3 py-1.5 rounded-full text-xs border ${rateCustom ? "bg-primary text-primary-foreground border-primary" : "bg-muted"}`}>Personalizado</button>
                {rateCustom && <Input className="w-24 h-8" type="number" min={1} value={rate} onChange={(e) => setRate(Number(e.target.value) || 1)} />}
              </div>
            </div>

            <div>
              <Label>Intervalo humanizado (segundos)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" min={0} value={humanizeMin} onChange={(e) => setHumanizeMin(Number(e.target.value) || 0)} className="w-24" />
                <span className="text-sm text-muted-foreground">até</span>
                <Input type="number" min={0} value={humanizeMax} onChange={(e) => setHumanizeMax(Number(e.target.value) || 0)} className="w-24" />
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-3"><Switch checked={useWindow} onCheckedChange={setUseWindow} /><Label>Horário permitido</Label></div>
              {useWindow && (
                <div className="flex items-center gap-2">
                  <Input type="time" value={winStart} onChange={(e) => setWinStart(e.target.value)} className="w-32" />
                  <span className="text-sm text-muted-foreground">às</span>
                  <Input type="time" value={winEnd} onChange={(e) => setWinEnd(e.target.value)} className="w-32" />
                </div>
              )}
              <div>
                <Label>Dias permitidos</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {WEEKDAYS.map((d, i) => {
                    const on = weekdays.includes(i);
                    return <button key={i} type="button" onClick={() => setWeekdays((w) => on ? w.filter((x) => x !== i) : [...w, i].sort())}
                      className={`h-10 w-12 rounded-lg text-sm font-medium ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>{d}</button>;
                  })}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <Toggle label="Ignorar feriados" v={ignoreHolidays} set={setIgnoreHolidays} />
                <Toggle label="Continuar amanhã" v={continueNextDay} set={setContinueNextDay} />
                <Toggle label="Remover duplicados" v={dedupe} set={setDedupe} />
                <Toggle label="Ignorar quem respondeu" v={ignoreResponded} set={setIgnoreResponded} />
                <Toggle label="Parar ao receber resposta" v={stopOnReply} set={setStopOnReply} />
              </div>
              <div>
                <Label>Limite diário</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {LIMIT_PRESETS.map((p) => (
                    <button key={p} type="button" onClick={() => setDailyLimit(p)}
                      className={`px-3 py-1.5 rounded-full text-xs border ${dailyLimit === p ? "bg-primary text-primary-foreground border-primary" : "bg-muted"}`}>{p}</button>
                  ))}
                  <button type="button" onClick={() => setDailyLimit(null)} className={`px-3 py-1.5 rounded-full text-xs border ${dailyLimit === null ? "bg-primary text-primary-foreground border-primary" : "bg-muted"}`}>Sem limite</button>
                </div>
              </div>
              <div>
                <Label>Delay fallback (s)</Label>
                <Input type="number" min={1} value={delay} onChange={(e) => setDelay(Number(e.target.value) || 1)} className="w-32" />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-5 gap-3">
              <Stat label="Contatos" value={sim?.total ?? "…"} />
              <Stat label="Por hora" value={sim?.per_hour ?? "…"} />
              <Stat label="Por dia" value={sim?.per_day ?? "…"} />
              <Stat label="Dias" value={sim?.days ?? "…"} />
              <Stat label="Conclusão" value={sim ? new Date(sim.finish_at).toLocaleString("pt-BR") : "…"} />
            </div>
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="text-xs uppercase text-muted-foreground mb-1">Prévia</div>
              <div className="text-sm whitespace-pre-wrap">{flowId ? "Enviando via fluxo selecionado." : message}</div>
            </div>
            {!connectionId && <p className="text-sm text-destructive">Selecione uma instância WhatsApp na etapa 2.</p>}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
          {step < 4 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Próximo <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button disabled={!connectionId || createM.isPending} onClick={() => createM.mutate()}>
              {createM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Iniciar campanha
            </Button>
          )}
        </div>
      </CardContent></Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(() => {
            const all = broadcasts.data?.rows ?? [];
            const kpi = all.reduce((a, b) => {
              a.total += (b.total as number) || 0;
              a.sent += (b.sent_count as number) || 0;
              a.error += (b.error_count as number) || 0;
              a.responded += (b.responded_count as number) || 0;
              if (b.status === "running") a.running++;
              return a;
            }, { total: 0, sent: 0, error: 0, responded: 0, running: 0 });
            const delivery = kpi.total ? Math.round((kpi.sent / kpi.total) * 100) : 0;
            return (
              <div className="p-4 border-b bg-muted/20 grid grid-cols-2 md:grid-cols-6 gap-3">
                <Stat label="Campanhas" value={all.length} />
                <Stat label="Ativas" value={kpi.running} />
                <Stat label="Enviados" value={kpi.sent} tone="ok" />
                <Stat label="Falhas" value={kpi.error} tone="err" />
                <Stat label="Respondidos" value={kpi.responded} />
                <Stat label="Entrega %" value={`${delivery}%`} />
              </div>
            );
          })()}
          <div className="flex items-center gap-2 p-3 border-b">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="running">Em execução</SelectItem>
                <SelectItem value="scheduled">Agendadas</SelectItem>
                <SelectItem value="paused">Pausadas</SelectItem>
                <SelectItem value="done">Concluídas</SelectItem>
                <SelectItem value="canceled">Canceladas</SelectItem>
                <SelectItem value="draft">Rascunho</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(broadcasts.data?.rows ?? []).filter((b) => statusFilter === "all" || b.status === statusFilter).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Nenhuma campanha ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Campanha</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Progresso</th>
                    <th className="text-left px-4 py-2">Velocidade</th>
                    <th className="text-left px-4 py-2">Criado</th>
                    <th className="text-left px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(broadcasts.data?.rows ?? []).filter((b) => statusFilter === "all" || b.status === statusFilter).map((b) => {
                    const total = (b.total as number) || 0;
                    const done = ((b.sent_count as number) || 0) + ((b.error_count as number) || 0);
                    const pct = total ? (done / total) * 100 : 0;
                    return (
                      <tr key={b.id as string} className="border-t">
                        <td className="px-4 py-2 font-medium">{b.name as string}</td>
                        <td className="px-4 py-2 space-x-1">
                          {(() => {
                            const s = b.status as string;
                            const map: Record<string, { label: string; cls: string }> = {
                              done: { label: "Concluída", cls: "bg-green-500/15 text-green-600 border-green-500/30" },
                              running: { label: "Em execução", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
                              paused: { label: "Pausada", cls: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30" },
                              scheduled: { label: "Agendada", cls: "bg-purple-500/15 text-purple-600 border-purple-500/30" },
                              canceled: { label: "Cancelada", cls: "bg-red-500/15 text-red-600 border-red-500/30" },
                              draft: { label: "Rascunho", cls: "bg-muted text-muted-foreground" },
                              error: { label: "Erro", cls: "bg-red-500/15 text-red-600 border-red-500/30" },
                            };
                            const it = map[s] ?? { label: s, cls: "" };
                            return <Badge variant="outline" className={it.cls}>{it.label}</Badge>;
                          })()}
                          {b.mode === "sequential" && <Badge variant="outline" className="text-[10px]">seq</Badge>}
                        </td>
                        <td className="px-4 py-2 tabular-nums min-w-[180px]">
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="w-24" />
                            <span className="text-xs">{done}/{total}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2">{b.rate_per_min as number}/min</td>
                        <td className="px-4 py-2 text-muted-foreground">{new Date(b.created_at as string).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openTimeline(b.id as string, b.name as string)}><Eye className="h-3.5 w-3.5" /></Button>
                            {b.status === "running" && <Button size="sm" variant="ghost" onClick={async () => { await pauseFn({ data: { id: b.id as string } }); qc.invalidateQueries({ queryKey: ["broadcasts"] }); }}><Pause className="h-3.5 w-3.5" /></Button>}
                            {b.status === "paused" && <Button size="sm" variant="ghost" onClick={async () => { await resumeFn({ data: { id: b.id as string } }); void (b.mode === "sequential" ? loopSeq(b.id as string) : loop(b.id as string)); qc.invalidateQueries({ queryKey: ["broadcasts"] }); }}><Play className="h-3.5 w-3.5" /></Button>}
                            {(b.status === "running" || b.status === "paused" || b.status === "scheduled") && <Button size="sm" variant="ghost" onClick={async () => { await cancelFn({ data: { id: b.id as string } }); qc.invalidateQueries({ queryKey: ["broadcasts"] }); }}><StopCircle className="h-3.5 w-3.5" /></Button>}
                            <Button size="sm" variant="ghost" onClick={async () => { const r = await dupFn({ data: { id: b.id as string } }); toast.success("Duplicada"); qc.invalidateQueries({ queryKey: ["broadcasts"] }); void r; }}><Copy className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Timeline — {timelineTitle}</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pb-2 border-b">
            <Select value={timelineFilter} onValueChange={setTimelineFilter}>
              <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sent">Enviados</SelectItem>
                <SelectItem value="error">Falhas</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Buscar telefone..." value={timelineSearch} onChange={(e) => setTimelineSearch(e.target.value)} className="h-8 max-w-xs" />
            <div className="ml-auto text-xs text-muted-foreground">
              {timelineRows.filter((r) => (timelineFilter === "all" || r.status === timelineFilter) && (!timelineSearch || String(r.phone).includes(timelineSearch))).length} destinatários
            </div>
            <Button size="sm" variant="outline" onClick={() => exportTimelineCSV(timelineRows, timelineTitle, timelineFilter, timelineSearch)}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
          {timelineRows.filter((r) => (timelineFilter === "all" || r.status === timelineFilter) && (!timelineSearch || String(r.phone).includes(timelineSearch))).length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 text-center">Sem eventos ainda.</div>
          ) : (
            <div className="space-y-3">
              {timelineRows.filter((r) => (timelineFilter === "all" || r.status === timelineFilter) && (!timelineSearch || String(r.phone).includes(timelineSearch))).map((r) => (
                <div key={r.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium tabular-nums">{r.phone}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">Etapa {(r.current_step ?? 0) + 1}</Badge>
                      <Badge variant={r.status === "sent" ? "default" : r.status === "error" ? "destructive" : "secondary"} className="text-[10px] capitalize">{r.status}</Badge>
                    </div>
                  </div>
                  {r.next_action_at && r.status === "pending" && (
                    <div className="text-xs text-muted-foreground mb-1">Próximo envio: {new Date(r.next_action_at).toLocaleString("pt-BR")}</div>
                  )}
                  <div className="space-y-1">
                    {(Array.isArray(r.timeline) ? r.timeline : []).map((ev: any, i: number) => (
                      <div key={i} className="text-xs flex items-start gap-2 border-l-2 pl-2" style={{ borderColor: ev.status === "error" ? "hsl(var(--destructive))" : "hsl(var(--primary))" }}>
                        <span className="text-muted-foreground shrink-0">{new Date(ev.at).toLocaleString("pt-BR")}</span>
                        <span className="capitalize font-medium">Etapa {(ev.step ?? 0) + 1} · {ev.status}</span>
                        {ev.error && <span className="text-destructive">— {ev.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "err" }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${tone === "ok" ? "text-emerald-500" : tone === "err" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function Toggle({ label, v, set }: { label: string; v: boolean; set: (b: boolean) => void }) {
  return <label className="flex items-center gap-3 border rounded-lg p-3 cursor-pointer"><Switch checked={v} onCheckedChange={set} /><span className="text-sm">{label}</span></label>;
}

function exportTimelineCSV(rows: any[], title: string, statusFilter: string, search: string) {
  const filtered = rows.filter((r) => (statusFilter === "all" || r.status === statusFilter) && (!search || String(r.phone).includes(search)));
  const header = ["telefone", "status", "etapa_atual", "proximo_envio", "ultimo_evento", "erro", "eventos"];
  const lines = filtered.map((r) => {
    const events = Array.isArray(r.timeline) ? r.timeline.map((e: any) => `${e.at}|etapa ${(e.step ?? 0) + 1}|${e.status}${e.error ? "|" + e.error : ""}`).join(" ;; ") : "";
    const vals = [r.phone ?? "", r.status ?? "", (r.current_step ?? 0) + 1, r.next_action_at ?? "", r.last_step_at ?? "", r.error ?? "", events];
    return vals.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");
  });
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${title.replace(/\W+/g, "_") || "timeline"}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
