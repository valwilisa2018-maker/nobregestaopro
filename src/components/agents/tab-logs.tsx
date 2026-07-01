import { useEffect, useState } from "react";
import { Bot, MessageSquare, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PROVIDERS = ["OpenAI", "Gemini", "DeepSeek", "Grok", "ElevenLabs"];

export function TabLogs() {
  const [agents, setAgents] = useState(0);
  const [keys, setKeys] = useState<Record<string, boolean>>({});

  async function load() {
    const { count } = await supabase.from("agents").select("id", { count: "exact", head: true });
    setAgents(count ?? 0);
    const { data } = await supabase.from("ai_providers").select("provider,api_key");
    const map: Record<string, boolean> = {};
    (data ?? []).forEach((r: { provider: string; api_key: string | null }) => {
      if (r.api_key) map[r.provider.toLowerCase()] = true;
    });
    setKeys(map);
  }
  useEffect(() => { load(); }, []);

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
          <button className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <Section icon={<Bot className="h-4 w-4 text-primary" />} title="Agentes" badge={agents}>
        <p className="text-sm text-muted-foreground">{agents === 0 ? "Nenhum agente configurado" : `${agents} agente(s)`}</p>
      </Section>

      <Section icon={<MessageSquare className="h-4 w-4 text-primary" />} title="Conversas">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat value={0} label="Aguardando" tone="amber" />
          <Stat value={0} label="Em Atendimento" tone="cyan" />
          <Stat value={0} label="Finalizadas" tone="slate" />
          <Stat value={0} label="IA Ativa" tone="emerald" />
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
        <MiniStat value="0" label="TOTAL EVENTOS" color="text-foreground" />
        <MiniStat value="0" label="SUCESSO" color="text-emerald-500" />
        <MiniStat value="0" label="ERROS" color="text-destructive" />
        <MiniStat value="0ms" label="TEMPO MÉDIO" color="text-primary" />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Feed de Atividade</h3>
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-border/60 p-1">
          {["Todos", "Sucesso", "Erros", "Info"].map((f, i) => (
            <button key={f} className={`h-9 rounded-lg text-xs font-semibold ${i === 0 ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`} style={i === 0 ? { background: "var(--gradient-primary)" } : undefined}>
              {f}
            </button>
          ))}
        </div>
        <div className="py-10 text-center text-sm text-muted-foreground">Sem eventos ainda.</div>
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