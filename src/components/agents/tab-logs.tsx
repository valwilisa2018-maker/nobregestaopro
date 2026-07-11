import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageSquare, RefreshCw, Trash2, Search, Filter, AlertTriangle, Info, CheckCircle2, XCircle, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LogRow = {
  id: string;
  level: string;
  source: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AgentOpt = { id: string; name: string; instance: string | null };

const LEVEL_FILTERS = ["all", "error", "warn", "info", "debug"] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number];

export function TabLogs() {
  const [agents, setAgents] = useState(0);
  const [convs, setConvs] = useState({ waiting: 0, active: 0, done: 0, ai: 0 });
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [search, setSearch] = useState("");
  const [agentOpts, setAgentOpts] = useState<AgentOpt[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [live, setLive] = useState(true);
  const [connected, setConnected] = useState(false);
  const userIdRef = useRef<string | null>(null);

  async function load() {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;
    userIdRef.current = uid;

    const { count } = await supabase.from("agents").select("id", { count: "exact", head: true });
    setAgents(count ?? 0);

    const { data: ag } = await supabase
      .from("agents")
      .select("id,name,connection_id")
      .order("name", { ascending: true });
    const connIds = Array.from(new Set((ag ?? []).map((a) => a.connection_id).filter(Boolean))) as string[];
    let connMap = new Map<string, string>();
    if (connIds.length) {
      const { data: cs } = await supabase.from("connections").select("id,instance_name").in("id", connIds);
      (cs ?? []).forEach((c) => connMap.set(c.id, c.instance_name));
    }
    setAgentOpts((ag ?? []).map((a) => ({ id: a.id, name: a.name, instance: a.connection_id ? connMap.get(a.connection_id) ?? null : null })));

    const { data: cs } = await supabase.from("conversations").select("status,agent_id,follow_up_paused");
    const c = { waiting: 0, active: 0, done: 0, ai: 0 };
    (cs ?? []).forEach((r: { status: string | null; agent_id: string | null; follow_up_paused: boolean | null }) => {
      if (r.status === "waiting") c.waiting++;
      else if (r.status === "active") c.active++;
      else if (r.status === "closed") c.done++;
      if (r.agent_id && !r.follow_up_paused) c.ai++;
    });
    setConvs(c);

    const { data: lg, error } = await supabase
      .from("logs")
      .select("id,level,source,message,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) toast.error(error.message);
    setLogs((lg ?? []) as LogRow[]);
  }
  useEffect(() => { load(); }, []);

  // Realtime subscription for new logs
  useEffect(() => {
    if (!live) { setConnected(false); return; }
    const uid = userIdRef.current;
    if (!uid) return;
    const channel = supabase
      .channel("logs-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "logs", filter: `user_id=eq.${uid}` },
        (payload) => {
          const row = payload.new as LogRow;
          setLogs((prev) => [row, ...prev].slice(0, 500));
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); setConnected(false); };
  }, [live]);

  async function clearAll() {
    if (!confirm("Limpar todos os logs?")) return;
    const uid = userIdRef.current;
    if (!uid) return;
    const { error } = await supabase.from("logs").delete().eq("user_id", uid);
    if (error) return toast.error(error.message);
    toast.success("Logs limpos");
    load();
  }

  const selectedInstance = useMemo(() => {
    if (selectedAgent === "all") return null;
    return agentOpts.find((a) => a.id === selectedAgent)?.instance ?? null;
  }, [selectedAgent, agentOpts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (level !== "all" && l.level !== level) return false;
      if (selectedAgent !== "all") {
        const meta = l.metadata ?? {};
        const metaAgent = (meta as { agent_id?: string }).agent_id;
        const matchAgent = metaAgent === selectedAgent;
        const matchInstance = selectedInstance ? (l.source ?? "").includes(selectedInstance) : false;
        if (!matchAgent && !matchInstance) return false;
      }
      if (term) {
        const hay = `${l.message} ${l.source ?? ""} ${JSON.stringify(l.metadata ?? {})}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [logs, level, selectedAgent, selectedInstance, search]);

  const stats = useMemo(() => {
    const t = filtered.length;
    const err = filtered.filter((l) => l.level === "error").length;
    const warn = filtered.filter((l) => l.level === "warn").length;
    const ok = filtered.filter((l) => l.level === "info" && /success|ok|enviad|entreg|delivered/i.test(l.message)).length;
    return { t, err, warn, ok, rate: t ? Math.round((ok / t) * 100) : 0 };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Painel em Tempo Real</h2>
          <p className="text-sm text-muted-foreground">Monitore agentes, conversas e logs completos em tempo real</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setLive((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium ${
              live && connected
                ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                : "border-border text-muted-foreground bg-muted/20"
            }`}
            title="Ativar/pausar stream em tempo real"
          >
            <Wifi className="h-3 w-3" /> {live ? (connected ? "Ao vivo" : "Conectando…") : "Pausado"}
          </button>
          <button onClick={load} className="p-2 rounded-md hover:bg-primary/10 text-muted-foreground"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={clearAll} className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <Section icon={<Bot className="h-4 w-4 text-primary" />} title="Agentes" badge={agents}>
        <p className="text-sm text-muted-foreground">{agents === 0 ? "Nenhum agente configurado" : `${agents} agente(s) configurados`}</p>
      </Section>

      <Section icon={<MessageSquare className="h-4 w-4 text-primary" />} title="Conversas">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat value={convs.waiting} label="Aguardando" tone="amber" />
          <Stat value={convs.active} label="Em Atendimento" tone="cyan" />
          <Stat value={convs.done} label="Finalizadas" tone="slate" />
          <Stat value={convs.ai} label="IA Ativa" tone="emerald" />
        </div>
      </Section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat value={String(stats.t)} label="EVENTOS" color="text-foreground" />
        <MiniStat value={String(stats.ok)} label="SUCESSO" color="text-emerald-500" />
        <MiniStat value={String(stats.warn)} label="AVISOS" color="text-amber-500" />
        <MiniStat value={String(stats.err)} label="ERROS" color="text-destructive" />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold flex items-center gap-2 mr-auto"><MessageSquare className="h-4 w-4 text-primary" /> Feed de Atividade</h3>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar mensagem, contato, erro…"
              className="h-9 w-64 rounded-lg border border-border/60 bg-background/40 pl-8 pr-3 text-xs outline-none focus:border-primary/60"
            />
          </div>
          <div className="relative">
            <Filter className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="h-9 rounded-lg border border-border/60 bg-background/40 pl-8 pr-8 text-xs outline-none focus:border-primary/60 appearance-none"
            >
              <option value="all">Todos os agentes</option>
              {agentOpts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.instance ? ` · ${a.instance}` : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 rounded-xl border border-border/60 p-1">
          {LEVEL_FILTERS.map((k) => {
            const labels: Record<LevelFilter, string> = { all: "Todos", error: "Erros", warn: "Avisos", info: "Info", debug: "Debug" };
            const active = level === k;
            return (
              <button
                key={k}
                onClick={() => setLevel(k)}
                className={`h-9 rounded-lg text-xs font-semibold ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                style={active ? { background: "var(--gradient-primary)" } : undefined}
              >
                {labels[k]}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {logs.length === 0 ? "Sem eventos ainda." : "Nenhum evento corresponde aos filtros."}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[32rem] overflow-auto pr-1">
            {filtered.map((l) => (
              <LogItem key={l.id} log={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LogItem({ log }: { log: LogRow }) {
  const [open, setOpen] = useState(false);
  const Icon =
    log.level === "error" ? XCircle :
    log.level === "warn" ? AlertTriangle :
    log.level === "info" ? Info : CheckCircle2;
  const color =
    log.level === "error" ? "text-destructive" :
    log.level === "warn" ? "text-amber-500" :
    log.level === "info" ? "text-primary" : "text-muted-foreground";
  const hasMeta = !!log.metadata && Object.keys(log.metadata).length > 0;
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 text-xs">
      <button
        onClick={() => hasMeta && setOpen((v) => !v)}
        className={`w-full flex items-start gap-3 px-3 py-2 text-left ${hasMeta ? "hover:bg-primary/5" : "cursor-default"}`}
      >
        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase text-[10px] text-muted-foreground">{log.source ?? log.level}</span>
            <span className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString("pt-BR")}</span>
          </div>
          <div className="text-foreground/90 break-words whitespace-pre-wrap">{log.message}</div>
        </div>
      </button>
      {open && hasMeta && (
        <pre className="mx-3 mb-2 mt-0 max-h-56 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-relaxed"><code>{JSON.stringify(log.metadata, null, 2)}</code></pre>
      )}
    </div>
  );
}

function Section({ icon, title, badge, children }: { icon: React.ReactNode; title: string; badge?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        {icon} {title}
        {badge !== undefined && <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-500/20 text-emerald-500 text-[10px] font-bold px-1.5">{badge}</span>}
      </h3>
      {children}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "amber" | "cyan" | "slate" | "emerald" }) {
  const cls = {
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-500",
    cyan: "border-cyan-500/30 bg-cyan-500/5 text-cyan-500",
    slate: "border-border bg-muted/20 text-muted-foreground",
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-500",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 text-center ${cls}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function MiniStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}