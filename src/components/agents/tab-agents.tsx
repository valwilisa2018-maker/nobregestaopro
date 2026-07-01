import { useEffect, useState } from "react";
import { Bot, Plus, Zap, Sliders, Clock, Copy, Trash2, Loader2, ArrowLeft } from "lucide-react";
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full ${r.is_active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                  <h3 className="font-semibold truncate">{r.name || "Sem nome"}</h3>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => duplicate(r)} className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary"><Copy className="h-4 w-4" /></button>
                  <button onClick={() => remove(r)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-primary" /> {(r.category || "Gemini")} — {r.model || "gemini-2.5-flash"}</div>
                <div className="flex items-center gap-2"><Sliders className="h-3.5 w-3.5 text-primary" /> Temp: {r.temperature ?? 0.7} | Max Tokens: {r.max_tokens ?? 2048}</div>
                <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-primary" /> Timer: humanizado</div>
              </div>
              <Button onClick={() => setEditing(r)} className="w-full rounded-xl font-bold" variant="outline" style={{ borderColor: "hsl(var(--primary) / 0.4)", color: "hsl(var(--primary))" }}>
                Configurar Agente
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}