import { useEffect, useState } from "react";
import { Bot, MessageSquare, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PROVIDERS = ["OpenAI", "Gemini", "DeepSeek", "Grok", "ElevenLabs"];

type LogRow = { id: string; level: string; source: string | null; message: string; created_at: string };

export function TabLogs() {
  const [agents, setAgents] = useState(0);
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [convs, setConvs] = useState({ waiting: 0, active: 0, done: 0, ai: 0 });
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState<"all" | "success" | "error" | "info">("all");

  async function load() {
    const { count } = await supabase.from("agents").select("id", { count: "exact", head: true });
    setAgents(count ?? 0);
    const { data } = await supabase.from("ai_providers").select("provider,api_key");
    const map: Record<string, boolean> = {};
    (data ?? []).forEach((r: { provider: string; api_key: string | null }) => {
      if (r.api_key) map[r.provider.toLowerCase()] = true;
    });
    setKeys(map);
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
      .select("id,level,source,message,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setLogs((lg ?? []) as LogRow[]);
  }
  useEffect(() => { load(); }, []);

  async function clearAll() {
    if (!confirm("Limpar todos os logs?")) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("logs").delete().eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Logs limpos");
    load();
  }

  const total = logs.length;
  const success = logs.filter((l) => l.level === "info" && /success|ok|enviad|entreg/i.test(l.message)).length;
  const errors = logs.filter((l) => l.level === "error").length;
  const filtered = logs.filter((l) => {
    if (filter === "all") return true;
    if (filter === "error") return l.level === "error";
    if (filter === "info") return l.level === "info";
    if (filter === "success") return /success|ok|enviad|entreg/i.test(l.message);
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Painel em Tempo Real</h2>
          <p className="text-sm text-muted-foreground">Monitore agentes, conversas, chaves e logs em tempo real</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Conectado</span>
          <button onClick={load} className="p-2 rounded-md hover:bg-primary/10 text-muted-foreground"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={clearAll} className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <Section icon={<Bot className="h-4 w-4 text-primary" />} title="Agentes" badge={agents}>
        <p className="text-sm text-muted-foreground">{agents === 0 ? "Nenhum agente configurado" : `${agents} agente(s)`}</p>
      </Section>

      <Section icon={<MessageSquare className="h-4 w-4 text-primary" />} title="Conversas">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat value={convs.waiting} label="Aguardando" tone="amber" />
          <Stat value={convs.active} label="Em Atendimento" tone="cyan" />
          <Stat value={convs.done} label="Finalizadas" tone="slate" />
          <Stat value={convs.ai} label="IA Ativa" tone="emerald" />
        </div>
      </Section>

      <Section icon={<KeyRound className="h-4 w-4 text-primary" />} title="Chaves de API">
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => {
            const ok = keys[p.toLowerCase()];
            return (
              <span
                key={p}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  ok ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10" : "border-destructive/40 text-destructive bg-destructive/5"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-destructive"}`} /> {p}
              </span>
            );
          })}
        </div>
      </Section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat value={String(total)} label="TOTAL EVENTOS" color="text-foreground" />
        <MiniStat value={String(success)} label="SUCESSO" color="text-emerald-500" />
        <MiniStat value={String(errors)} label="ERROS" color="text-destructive" />
        <MiniStat value={`${total ? Math.round((success / total) * 100) : 0}%`} label="TAXA SUCESSO" color="text-primary" />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Feed de Atividade</h3>
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-border/60 p-1">
          {(["all", "success", "error", "info"] as const).map((k, i) => {
            const labels = ["Todos", "Sucesso", "Erros", "Info"];
            const active = filter === k;
            return (
              <button key={k} onClick={() => setFilter(k)} className={`h-9 rounded-lg text-xs font-semibold ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`} style={active ? { background: "var(--gradient-primary)" } : undefined}>
                {labels[i]}
              </button>
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem eventos ainda.</div>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-auto">
            {filtered.map((l) => (
              <div key={l.id} className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-xs">
                <span className={`mt-0.5 h-2 w-2 rounded-full ${l.level === "error" ? "bg-destructive" : l.level === "warn" ? "bg-amber-500" : "bg-emerald-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold uppercase text-[10px] text-muted-foreground">{l.source ?? l.level}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="truncate text-foreground/90">{l.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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