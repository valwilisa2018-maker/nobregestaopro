import { useEffect, useState } from "react";
import { Bot, Plus, Pencil, Trash2, Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AgentEditor, type AgentRow } from "./agent-editor";

export function AgentsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("agents").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as unknown as AgentRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: AgentRow) {
    setEditing(row);
    setOpen(true);
  }

  async function duplicate(row: AgentRow) {
    if (!user) return;
    const { id, created_at, updated_at, ...rest } = row as AgentRow & Record<string, unknown>;
    void id; void created_at; void updated_at;
    const payload = { ...rest, name: `${row.name} (cópia)`, user_id: user.id };
    const { error } = await supabase.from("agents").insert(payload as never);
    if (error) return toast.error(error.message);
    toast.success("Agente duplicado");
    load();
  }

  async function remove(row: AgentRow) {
    if (!confirm(`Excluir "${row.name}"?`)) return;
    const { error } = await supabase.from("agents").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Agente excluído");
    load();
  }

  return (
    <PageShell
      title="Agentes IA"
      description="Crie e configure agentes de IA com provedores, ferramentas, memória, base de conhecimento e integrações."
      icon={<Bot className="h-6 w-6" />}
      status="ativo"
      actions={<Button onClick={openNew}><Plus className="h-4 w-4" /> Novo Agente</Button>}
    >
      {loading ? (
        <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">Nenhum agente ainda</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">Crie seu primeiro agente de IA e configure provedor, prompt, ferramentas e integrações.</p>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> Criar Agente</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Card key={r.id} className="group relative overflow-hidden border-border/60 hover:border-primary/50 transition-colors">
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />
              <CardContent className="relative p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30 shrink-0">
                    {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <Bot className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{r.name}</h3>
                      <Badge variant="outline" className={r.is_active ? "bg-primary/15 text-primary border-primary/30" : "bg-muted text-muted-foreground"}>
                        {r.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.description || r.role || "Sem descrição"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {r.model && <Badge variant="secondary">{r.model}</Badge>}
                  {typeof r.temperature === "number" && <Badge variant="outline">T {r.temperature}</Badge>}
                  {r.max_tokens ? <Badge variant="outline">{r.max_tokens} tk</Badge> : null}
                  {r.language && <Badge variant="outline">{r.language}</Badge>}
                </div>
                <div className="flex gap-2 pt-2 border-t border-border/60">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                  <Button variant="ghost" size="sm" onClick={() => duplicate(r)} title="Duplicar"><Copy className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(r)} title="Excluir" className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AgentEditor open={open} onOpenChange={setOpen} agent={editing} onSaved={() => { setOpen(false); load(); }} />
    </PageShell>
  );
}