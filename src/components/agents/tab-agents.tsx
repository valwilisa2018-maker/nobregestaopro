import { useEffect, useState } from "react";
import { Bot, Plus, Zap, Sliders, Clock, Copy, Trash2, Loader2, ArrowLeft, ArrowRight, Hash } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AgentEditor, type AgentRow, emptyAgent } from "./agent-editor";

export function TabAgents() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AgentRow | null>(null);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("agents").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as unknown as AgentRow[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  async function duplicate(row: AgentRow) {
    if (!user) return;
    const { id, created_at, updated_at, ...rest } = row as AgentRow & Record<string, unknown>;
    void id; void created_at; void updated_at;
    const { error } = await supabase.from("agents").insert({ ...rest, name: `${row.name} (cópia)`, user_id: user.id } as never);
    if (error) return toast.error(error.message);
    toast.success("Agente duplicado");
    load();
  }
  async function remove(row: AgentRow) {
    if (!confirm(`Excluir "${row.name}"?`)) return;
    const { error } = await supabase.from("agents").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    load();
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <AgentEditor agent={editing.id ? editing : null} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Meus Agentes</h2>
          <p className="text-sm text-muted-foreground">Gerencie seus agentes de IA. Cada agente tem suas próprias configurações.</p>
        </div>
        <Button
          onClick={() => setEditing(emptyAgent(user?.id ?? ""))}
          className="rounded-xl px-4"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
        >
          <Plus className="h-4 w-4" /> Novo Agente
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-primary/30 bg-card/40 p-16 text-center space-y-4">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary/60">
            <Bot className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Nenhum agente criado</h3>
            <p className="text-sm text-muted-foreground">Crie seu primeiro agente de IA para começar</p>
          </div>
          <Button onClick={() => setEditing(emptyAgent(user?.id ?? ""))} className="rounded-xl" style={{ background: "var(--gradient-primary)" }}>
            <Plus className="h-4 w-4" /> Criar Primeiro Agente
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="relative group">
              {/* Ambient glow */}
              <div className="pointer-events-none absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-emerald-500/20 to-blue-500/20 blur-xl opacity-40 group-hover:opacity-100 transition-opacity duration-700" />
              {/* Card */}
              <div className="relative rounded-[2rem] border border-white/10 bg-[hsl(240_10%_6%/0.8)] backdrop-blur-2xl p-6 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className={`h-3 w-3 rounded-full ${r.is_active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                      {r.is_active && <div className="absolute inset-0 h-3 w-3 rounded-full bg-emerald-500 animate-ping opacity-75" />}
                    </div>
                    <h3 className="text-white font-semibold text-xl tracking-tight truncate">{r.name || "Sem nome"}</h3>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => duplicate(r)} className="p-2 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(r)} className="p-2 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-4 mb-10">
                  <div className="flex items-start gap-4 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="mt-0.5 p-2 rounded-lg bg-blue-500/10 text-blue-400">
                      <Zap className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Model Intelligence</span>
                      <span className="text-sm text-slate-200 font-medium truncate">IA · Configurações Globais</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Sliders className="h-3 w-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Temp</span>
                      </div>
                      <span className="text-sm text-slate-200">{r.temperature ?? 0.7}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Hash className="h-3 w-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Tokens</span>
                      </div>
                      <span className="text-sm text-slate-200">{r.max_tokens ?? 2048}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-3">
                    <div className="flex items-center gap-3 text-slate-400">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm font-medium">Timer Mode</span>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Humanizado
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={() => setEditing(r)}
                  className="w-full group/btn relative py-4 bg-white text-black font-bold rounded-2xl overflow-hidden transition-all duration-300 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/5 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700" />
                  <span className="relative flex items-center justify-center gap-2">
                    Configurar Agente
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}