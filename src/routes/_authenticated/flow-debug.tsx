import { createFileRoute } from "@tanstack/react-router";
import { Bug, Loader2, Play, Send, Trash2, AlertTriangle, CheckCircle2, PauseCircle, Activity, FlaskConical, RefreshCw, Stethoscope, ArrowRightCircle, MessageSquare, PhoneForwarded, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerFn } from "@tanstack/react-start";
import { startSimulation, sendSimulationInput, listExecutions, deleteExecution, validateFlow } from "@/lib/flow-simulator.functions";

export const Route = createFileRoute("/_authenticated/flow-debug")({
  head: () => ({ meta: [{ title: "Debug de Fluxo — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type LogRow = {
  id: string;
  execution_id: string;
  level: "info" | "warn" | "error";
  event: string;
  block_id: string | null;
  message: string | null;
  data: Record<string, unknown> | null;
  duration_ms: number | null;
  created_at: string;
};
type ExecRow = {
  id: string; flow_id: string; status: string;
  current_block_id: string | null; awaiting_variable: string | null;
  variables: Record<string, string> | null;
  is_simulation: boolean; started_at: string; updated_at: string; completed_at: string | null;
  last_error: string | null;
};
type FlowLite = { id: string; name: string };

type DiagRow = {
  id: string;
  level: "info" | "warn" | "error" | string;
  source: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function Page() {
  const { user } = useAuth();
  const [flows, setFlows] = useState<FlowLite[]>([]);
  const [pickedFlow, setPickedFlow] = useState<string>("");
  const [execs, setExecs] = useState<ExecRow[]>([]);
  const [selected, setSelected] = useState<ExecRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"live" | "sim" | "diag">("live");
  const [diag, setDiag] = useState<DiagRow[]>([]);

  const startFn = useServerFn(startSimulation);
  const sendFn = useServerFn(sendSimulationInput);
  const listFn = useServerFn(listExecutions);
  const delFn = useServerFn(deleteExecution);
  const validateFn = useServerFn(validateFlow);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const [f, e] = await Promise.all([
      supabase.from("flows").select("id,name").eq("user_id", user.id).order("updated_at", { ascending: false }),
      listFn(),
    ]);
    setFlows((f.data ?? []) as FlowLite[]);
    setExecs((e.executions ?? []) as ExecRow[]);
    setLoading(false);
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [user]);

  // Diagnóstico: logs do correlacionador/runtime de fluxo
  useEffect(() => {
    if (!user) return;
    supabase.from("logs")
      .select("id,level,source,message,metadata,created_at")
      .eq("user_id", user.id)
      .or("source.ilike.flow%,source.ilike.flow-correlator%")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setDiag((data ?? []) as DiagRow[]));
    const ch = supabase.channel(`flow-diag:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "logs", filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new as DiagRow;
        const src = (row.source ?? "").toLowerCase();
        if (src.startsWith("flow")) setDiag((prev) => [row, ...prev].slice(0, 200));
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user]);

  // Load logs for the selected execution
  useEffect(() => {
    if (!selected) { setLogs([]); return; }
    supabase.from("flow_execution_logs").select("*").eq("execution_id", selected.id).order("created_at", { ascending: true }).limit(500)
      .then(({ data }) => setLogs((data ?? []) as LogRow[]));
  }, [selected?.id]);

  // Realtime: new logs + execution status changes
  useEffect(() => {
    if (!user || !selected) return;
    const ch = supabase.channel(`flow-exec:${selected.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "flow_execution_logs", filter: `execution_id=eq.${selected.id}` }, (payload) => {
        setLogs((prev) => [...prev, payload.new as LogRow]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "flow_executions", filter: `id=eq.${selected.id}` }, (payload) => {
        const nw = payload.new as ExecRow;
        setSelected(nw);
        setExecs((prev) => prev.map((x) => x.id === nw.id ? nw : x));
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, selected?.id]);

  const flowName = useMemo(() => Object.fromEntries(flows.map((f) => [f.id, f.name])), [flows]);
  const liveExecs = useMemo(() => execs.filter((e) => !e.is_simulation), [execs]);
  const simExecs = useMemo(() => execs.filter((e) => e.is_simulation), [execs]);
  const liveErrors = useMemo(() => liveExecs.filter((e) => e.status === "failed" || e.last_error).length, [liveExecs]);

  // When switching tabs, clear selection if it no longer belongs to the tab
  useEffect(() => {
    if (!selected) return;
    if (tab === "live" && selected.is_simulation) setSelected(null);
    if (tab === "sim" && !selected.is_simulation) setSelected(null);
    if (tab === "diag") setSelected(null);
  }, [tab, selected]);

  async function onStart() {
    if (!pickedFlow) return toast.error("Escolha um fluxo");
    setBusy(true);
    try {
      const v = await validateFn({ data: { flowId: pickedFlow } });
      if (!v.ok) toast.warning(`Validação: ${v.issues.filter((i) => i.level === "error").map((i) => i.message).join("; ")}`);
      const r = await startFn({ data: { flowId: pickedFlow } });
      toast.success(r.waiting ? "Simulação aguardando input" : "Simulação concluída");
      await reload();
      // auto-select the new execution
      const { data: ex } = await supabase.from("flow_executions").select("*").eq("id", r.executionId).maybeSingle();
      if (ex) setSelected(ex as ExecRow);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar");
    } finally { setBusy(false); }
  }

  async function onSend() {
    if (!selected || !input.trim()) return;
    setBusy(true);
    try {
      await sendFn({ data: { executionId: selected.id, text: input.trim() } });
      setInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally { setBusy(false); }
  }

  async function onDelete(id: string) {
    await delFn({ data: { executionId: id } });
    if (selected?.id === id) setSelected(null);
    await reload();
  }

  const statusBadge = (s: string) => {
    const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
      waiting_user_input: { cls: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", icon: <PauseCircle className="h-3 w-3" />, label: "aguardando" },
      processing: { cls: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "processando" },
      completed: { cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" />, label: "concluído" },
      failed: { cls: "bg-red-500/15 text-red-600 border-red-500/30", icon: <AlertTriangle className="h-3 w-3" />, label: "falhou" },
      aborted: { cls: "bg-muted text-muted-foreground", icon: <AlertTriangle className="h-3 w-3" />, label: "abortado" },
    };
    const it = map[s] ?? { cls: "bg-muted text-muted-foreground", icon: null, label: s };
    return <Badge variant="outline" className={`${it.cls} gap-1`}>{it.icon}{it.label}</Badge>;
  };

  const eventMeta: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    user_input: { icon: <MessageSquare className="h-3 w-3" />, label: "resposta do usuário", cls: "text-blue-600" },
    step: { icon: <ArrowRightCircle className="h-3 w-3" />, label: "etapa executada", cls: "text-slate-600" },
    wait: { icon: <PauseCircle className="h-3 w-3" />, label: "aguardando resposta", cls: "text-yellow-600" },
    complete: { icon: <CheckCircle2 className="h-3 w-3" />, label: "finalizado", cls: "text-emerald-600" },
    handoff: { icon: <PhoneForwarded className="h-3 w-3" />, label: "transferido", cls: "text-purple-600" },
    error: { icon: <AlertTriangle className="h-3 w-3" />, label: "erro", cls: "text-red-600" },
  };
  const renderEvent = (ev: string) => {
    const it = eventMeta[ev] ?? { icon: <Info className="h-3 w-3" />, label: ev, cls: "text-muted-foreground" };
    return <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase ${it.cls}`}>{it.icon}{it.label}</span>;
  };

  const renderList = (rows: ExecRow[], emptyMsg: string) => (
    <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>{rows.length} execuç{rows.length === 1 ? "ão" : "ões"}</span>
        <button onClick={() => void reload()} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition"><RefreshCw className="h-3 w-3" /> atualizar</button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto divide-y divide-border/50">
        {loading && <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>}
        {!loading && !rows.length && <div className="p-6 text-center text-xs text-muted-foreground">{emptyMsg}</div>}
        {rows.map((e) => (
          <button key={e.id} onClick={() => setSelected(e)} className={`w-full text-left p-3 hover:bg-accent/30 transition ${selected?.id === e.id ? "bg-accent/40" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate flex-1">{flowName[e.flow_id] ?? e.flow_id.slice(0, 8)}</span>
              {e.last_error && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              {statusBadge(e.status)}
              <span className="ml-auto">{new Date(e.started_at).toLocaleTimeString()}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderDetail = () => (
    <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden flex flex-col">
          {!selected ? (
            <div className="grid place-items-center h-[70vh] text-sm text-muted-foreground">Selecione uma execução</div>
          ) : (
            <>
              <div className="border-b border-border/60 px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{flowName[selected.flow_id] ?? selected.flow_id}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                    {statusBadge(selected.status)}
                    {selected.awaiting_variable && <span>aguardando: <code>{selected.awaiting_variable}</code></span>}
                    {selected.current_block_id && <span>· bloco: <code>{selected.current_block_id}</code></span>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onDelete(selected.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>

              {/* Variables */}
              {selected.variables && Object.keys(selected.variables).length > 0 && (
                <div className="border-b border-border/60 px-4 py-2 text-xs">
                  <span className="text-muted-foreground mr-2">Variáveis:</span>
                  {Object.entries(selected.variables).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="mr-1 mb-1 font-mono text-[10px]">{k}={String(v).slice(0, 30)}</Badge>
                  ))}
                </div>
              )}

              {/* Logs stream */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1 max-h-[55vh]">
                {logs.map((l) => (
                  <div key={l.id} className={`text-xs rounded px-2 py-1.5 border ${l.level === "error" ? "border-red-500/30 bg-red-500/5" : l.level === "warn" ? "border-yellow-500/30 bg-yellow-500/5" : "border-border/40 bg-muted/20"}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
                      {renderEvent(l.event)}
                      {l.block_id && <code className="text-[10px] text-muted-foreground">{l.block_id}</code>}
                      {l.duration_ms != null && <span className="text-[10px] text-muted-foreground ml-auto">{l.duration_ms}ms</span>}
                    </div>
                    {l.message && <div className="mt-0.5 whitespace-pre-wrap break-words">{l.message}</div>}
                    {l.data && Object.keys(l.data).length > 0 && (
                      <pre className="mt-1 text-[10px] text-muted-foreground bg-background/5 rounded p-1 overflow-x-auto">{JSON.stringify(l.data, null, 2)}</pre>
                    )}
                  </div>
                ))}
                {!logs.length && <div className="text-center text-xs text-muted-foreground py-6">Sem eventos ainda</div>}
              </div>

              {/* Simulator input */}
              {selected.is_simulation && selected.status === "waiting_user_input" && (
                <div className="border-t border-border/60 p-3 flex gap-2">
                  <Input placeholder={`Digite a resposta para "${selected.awaiting_variable ?? "usuário"}"…`} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSend(); }} disabled={busy} />
                  <Button onClick={onSend} disabled={busy || !input.trim()} className="gap-2"><Send className="h-4 w-4" /> Enviar</Button>
                </div>
              )}
              {selected.last_error && (
                <div className="border-t border-border/60 bg-destructive/5 px-4 py-2 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3 inline mr-1" />{selected.last_error}
                </div>
              )}
            </>
          )}
    </div>
  );

  const activeExecs = execs.filter((e) => e.status === "processing" || e.status === "waiting_user_input").length;
  const completedExecs = execs.filter((e) => e.status === "completed").length;
  const diagErrors = diag.filter((d) => d.level === "error").length;

  const kpis = [
    { label: "Execuções ao vivo", value: liveExecs.length, icon: Activity, grad: "from-blue-500/25 to-cyan-500/10", ring: "ring-blue-500/30", tone: "text-blue-500" },
    { label: "Ativas agora", value: activeExecs, icon: Loader2, grad: "from-emerald-500/25 to-teal-500/10", ring: "ring-emerald-500/30", tone: "text-emerald-500" },
    { label: "Concluídas", value: completedExecs, icon: CheckCircle2, grad: "from-violet-500/25 to-fuchsia-500/10", ring: "ring-violet-500/30", tone: "text-violet-500" },
    { label: "Erros", value: liveErrors + diagErrors, icon: AlertTriangle, grad: "from-red-500/25 to-orange-500/10", ring: "ring-red-500/30", tone: "text-red-500" },
  ];

  return (
    <PageShell
      title="Debug de Fluxo"
      description="Acompanhe execuções reais em tempo real e simule fluxos antes de publicar."
      icon={<Bug className="h-6 w-6" />}
      status="ativo"
    >
      {/* Premium hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-indigo-600/20 via-violet-600/10 to-fuchsia-600/20 p-6 mb-5 shadow-[0_10px_40px_-15px_rgba(99,102,241,0.35)]">
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 blur-md opacity-70" aria-hidden />
              <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg">
                <Bug className="h-7 w-7 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">Central de Debug</h2>
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Ao vivo
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">Monitore execuções reais, simule fluxos como se fosse o contato e diagnostique por que uma mensagem não disparou um fluxo.</p>
            </div>
          </div>
          <div className="md:ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => void reload()} className="gap-2 border-border/60 bg-background/40 backdrop-blur">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </div>

        {/* KPI grid */}
        <div className="relative mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${k.grad} p-4 ring-1 ${k.ring}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{k.label}</span>
                <k.icon className={`h-4 w-4 ${k.tone} ${k.label === "Ativas agora" && activeExecs > 0 ? "animate-spin" : ""}`} />
              </div>
              <div className={`mt-2 text-3xl font-bold ${k.tone}`}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "live" | "sim" | "diag")} className="w-full">
        <TabsList className="mb-4 bg-card/40 border border-border/60 backdrop-blur p-1 h-auto">
          <TabsTrigger value="live" className="gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500/20 data-[state=active]:to-cyan-500/10 data-[state=active]:shadow-sm">
            <Activity className="h-4 w-4" /> Execuções ao vivo
            <Badge variant="outline" className="ml-1 text-[10px]">{liveExecs.length}</Badge>
            {liveErrors > 0 && <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 border-red-500/30">{liveErrors} erro{liveErrors === 1 ? "" : "s"}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sim" className="gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-violet-500/20 data-[state=active]:to-fuchsia-500/10 data-[state=active]:shadow-sm">
            <FlaskConical className="h-4 w-4" /> Simulador
            <Badge variant="outline" className="ml-1 text-[10px]">{simExecs.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="diag" className="gap-2 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500/20 data-[state=active]:to-orange-500/10 data-[state=active]:shadow-sm">
            <Stethoscope className="h-4 w-4" /> Diagnóstico
            <Badge variant="outline" className="ml-1 text-[10px]">{diag.length}</Badge>
            {diagErrors > 0 && (
              <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-600 border-red-500/30">
                {diagErrors} erro{diagErrors === 1 ? "" : "s"}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-0">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-3 mb-4 text-xs text-muted-foreground">
            Aqui aparecem os fluxos disparados de verdade pelos seus contatos no WhatsApp. Clique em uma execução para ver o passo a passo, variáveis coletadas e eventuais erros.
          </div>
          <div className="grid gap-3 md:grid-cols-[340px_1fr]">
            {renderList(liveExecs, "Nenhum fluxo executado ainda. Assim que um contato acionar um fluxo, ele aparece aqui.")}
            {renderDetail()}
          </div>
        </TabsContent>

        <TabsContent value="sim" className="mt-0">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-3 mb-4 flex flex-wrap items-center gap-2">
            <Select value={pickedFlow} onValueChange={setPickedFlow}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Escolha um fluxo para simular" /></SelectTrigger>
              <SelectContent>{flows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={onStart} disabled={busy || !pickedFlow} className="gap-2">
              <Play className="h-4 w-4" /> Iniciar simulação
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">Teste o fluxo respondendo como se fosse o contato — nada é enviado no WhatsApp.</span>
          </div>
          <div className="grid gap-3 md:grid-cols-[340px_1fr]">
            {renderList(simExecs, "Nenhuma simulação ainda. Escolha um fluxo acima e clique em Iniciar simulação.")}
            {renderDetail()}
          </div>
        </TabsContent>

        <TabsContent value="diag" className="mt-0">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-3 mb-4 flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-1">
              Logs de correlação e runtime dos fluxos. Se uma mensagem chegou mas nenhuma execução foi criada, o motivo aparece aqui (ex.: sem fluxo ativo, fluxo sem START, nenhuma palavra-chave correspondeu, erro em bloco).
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              disabled={busy || !diag.length}
              onClick={async () => {
                if (!user) return;
                if (!confirm("Limpar todos os logs de diagnóstico de fluxo?")) return;
                setBusy(true);
                const { error } = await supabase
                  .from("logs")
                  .delete()
                  .eq("user_id", user.id)
                  .or("source.ilike.flow%,source.ilike.flow-correlator%");
                setBusy(false);
                if (error) { toast.error("Falha ao limpar logs"); return; }
                setDiag([]);
                toast.success("Logs de diagnóstico limpos");
              }}
            >
              <Trash2 className="h-3 w-3" /> Limpar logs antigos
            </Button>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-border/50">
              {!diag.length && <div className="p-6 text-center text-xs text-muted-foreground">Nenhum evento de diagnóstico ainda.</div>}
              {diag.map((l) => {
                const meta = (l.metadata ?? {}) as Record<string, unknown>;
                const reason = typeof meta.reason === "string" ? meta.reason : null;
                const instance = typeof meta.instance === "string" ? meta.instance : null;
                const flowId = typeof meta.flow_id === "string" ? meta.flow_id : null;
                return (
                  <div key={l.id} className={`p-3 text-xs ${l.level === "error" ? "bg-red-500/5" : l.level === "warn" ? "bg-yellow-500/5" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleString()}</span>
                      <Badge variant="outline" className={`text-[9px] uppercase ${l.level === "error" ? "text-red-600 border-red-500/30" : l.level === "warn" ? "text-yellow-700 border-yellow-500/30" : ""}`}>{l.level}</Badge>
                      {l.source && <code className="text-[10px] text-muted-foreground">{l.source}</code>}
                      {instance && <Badge variant="outline" className="text-[10px]">instance: {instance}</Badge>}
                      {flowId && <Badge variant="outline" className="text-[10px]">flow: {flowId.slice(0, 8)}</Badge>}
                      {reason && <Badge variant="outline" className="text-[10px] bg-muted">{reason}</Badge>}
                    </div>
                    {l.message && <div className="mt-1 whitespace-pre-wrap break-words">{l.message}</div>}
                    {Object.keys(meta).length > 0 && (
                      <pre className="mt-1 text-[10px] text-muted-foreground bg-background/5 rounded p-2 overflow-x-auto">{JSON.stringify(meta, null, 2)}</pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}