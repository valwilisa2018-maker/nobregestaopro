import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Copy, Loader2, Pause, Play, Rocket, Send, StopCircle, Users } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { listContacts } from "@/lib/contacts.functions";
import {
  cancelBroadcast, createBroadcast, duplicateBroadcast, listBroadcasts, listContactTags,
  pauseBroadcast, previewBroadcast, resumeBroadcast, runBroadcastBatch,
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
  const [mediaUrl, setMediaUrl] = useState("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [flowId, setFlowId] = useState<string>("");
  const [mode, setMode] = useState<"quick" | "sequential">("quick");

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
    } }).then(setSim).catch(() => setSim(null));
  }, [step, sourceType, selectedTags, selectedIds, dedupe, rate, dailyLimit, preview]);

  const [runningId, setRunningId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; error: number; total: number; responded: number } | null>(null);
  const [pausedFlag, setPausedFlag] = useState(false);

  const createM = useMutation({
    mutationFn: async () => create({ data: {
      name, description: description || null, message,
      media_url: mediaUrl || null, media_type: mediaUrl ? "image" : null,
      connection_id: connectionId || null, flow_id: flowId || null,
      mode,
      source_type: sourceType, source_value: selectedTags,
      contact_ids: selectedIds,
      rate_per_min: rate, humanize_min: humanizeMin, humanize_max: humanizeMax,
      window_start: useWindow ? winStart : null, window_end: useWindow ? winEnd : null,
      weekdays, ignore_holidays: ignoreHolidays, continue_next_day: continueNextDay,
      dedupe, ignore_responded: ignoreResponded, stop_on_reply: stopOnReply,
      daily_limit: dailyLimit, delay_seconds: delay,
    } }),
    onSuccess: async (res) => {
      toast.success("Campanha criada");
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
    (step === 2 && message.trim().length > 0) ||
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
              <p className="text-sm text-muted-foreground">Todos os contatos ativos serão incluídos. Ajuste filtros na etapa de simulação.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div><Label>Nome da campanha</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Descrição (opcional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
            <div>
              <Label>Mensagem</Label>
              <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Olá {nome}..." />
              <p className="text-xs text-muted-foreground mt-1">Variáveis: <code>{"{nome}"}</code>, <code>{"{telefone}"}</code></p>
            </div>
            <div><Label>URL da mídia (opcional)</Label><Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." /></div>
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
                    <SelectItem value="__none__">Nenhum — apenas mensagem</SelectItem>
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

            <div className="space-y-3">
              <Label>Velocidade (mensagens por minuto)</Label>
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
              <div className="text-sm whitespace-pre-wrap">{message}</div>
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
          {(broadcasts.data?.rows ?? []).length === 0 ? (
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
                  {(broadcasts.data?.rows ?? []).map((b) => {
                    const total = (b.total as number) || 0;
                    const done = ((b.sent_count as number) || 0) + ((b.error_count as number) || 0);
                    const pct = total ? (done / total) * 100 : 0;
                    return (
                      <tr key={b.id as string} className="border-t">
                        <td className="px-4 py-2 font-medium">{b.name as string}</td>
                        <td className="px-4 py-2"><Badge variant="secondary" className="capitalize">{b.status as string}</Badge></td>
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
                            {b.status === "running" && <Button size="sm" variant="ghost" onClick={async () => { await pauseFn({ data: { id: b.id as string } }); qc.invalidateQueries({ queryKey: ["broadcasts"] }); }}><Pause className="h-3.5 w-3.5" /></Button>}
                            {b.status === "paused" && <Button size="sm" variant="ghost" onClick={async () => { await resumeFn({ data: { id: b.id as string } }); void loop(b.id as string); qc.invalidateQueries({ queryKey: ["broadcasts"] }); }}><Play className="h-3.5 w-3.5" /></Button>}
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
