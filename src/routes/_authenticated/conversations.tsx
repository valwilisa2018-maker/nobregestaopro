import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/conversations")({
  head: () => ({ meta: [{ title: "Conversas — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type Conv = {
  id: string;
  status: string | null;
  unread_count: number | null;
  last_message_at: string | null;
  agent_id: string | null;
  connection_id: string | null;
  client_id: string | null;
};
type Msg = {
  id: string;
  conversation_id: string | null;
  direction: string | null;
  type: string | null;
  content: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const STATUSES = [
  { value: "all", label: "Todos status" },
  { value: "open", label: "Aberta" },
  { value: "pending", label: "Pendente" },
  { value: "closed", label: "Encerrada" },
  { value: "archived", label: "Arquivada" },
];

function Page() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [selected, setSelected] = useState<Conv | null>(null);
  const [loading, setLoading] = useState(false);
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("agents").select("id,name").eq("user_id", user.id).order("name").then(({ data }) => setAgents(data ?? []));
  }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    let q = supabase.from("conversations")
      .select("id,status,unread_count,last_message_at,agent_id,connection_id,client_id")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (agentFilter !== "all") q = q.eq("agent_id", agentFilter);
    if (statusFilter !== "all") q = q.eq("status", statusFilter as never);
    if (from) q = q.gte("last_message_at", new Date(from).toISOString());
    if (to) q = q.lte("last_message_at", new Date(to + "T23:59:59").toISOString());
    const { data } = await q;
    setConvs((data ?? []) as Conv[]);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, agentFilter, statusFilter, from, to]);

  useEffect(() => {
    if (!selected) { setMsgs([]); return; }
    supabase.from("messages")
      .select("id,conversation_id,direction,type,content,created_at,metadata")
      .eq("conversation_id", selected.id)
      .order("created_at", { ascending: true })
      .limit(500)
      .then(({ data }) => setMsgs((data ?? []) as Msg[]));
  }, [selected]);

  const agentName = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.name])), [agents]);

  return (
    <PageShell
      title="Conversas"
      description="Visualize conversas e mensagens salvas."
      icon={<MessagesSquare className="h-6 w-6" />}
      status="ativo"
      actions={<Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>}
    >
      <div className="grid gap-3 md:grid-cols-4 rounded-2xl border border-border/60 bg-card/40 p-3">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger><SelectValue placeholder="Agente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos agentes</SelectItem>
            {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="De" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Até" />
      </div>

      <div className="grid gap-3 md:grid-cols-[380px_1fr]">
        <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
          <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">{convs.length} conversas</div>
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-border/50">
            {convs.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full text-left p-3 hover:bg-accent/30 transition ${selected?.id === c.id ? "bg-accent/40" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {c.agent_id ? (agentName[c.agent_id] ?? "Agente") : "Sem agente"}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{c.status ?? "—"}</Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "—"}</span>
                  {(c.unread_count ?? 0) > 0 && <span className="text-primary">{c.unread_count} não lidas</span>}
                </div>
              </button>
            ))}
            {!convs.length && !loading && <div className="p-6 text-center text-xs text-muted-foreground">Nenhuma conversa</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden flex flex-col">
          {!selected ? (
            <div className="grid place-items-center h-[65vh] text-sm text-muted-foreground">Selecione uma conversa</div>
          ) : (
            <>
              <div className="border-b border-border/60 px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{selected.agent_id ? agentName[selected.agent_id] ?? "Agente" : "Sem agente"}</div>
                  <div className="text-[11px] text-muted-foreground">{msgs.length} mensagens</div>
                </div>
                <Badge variant="outline">{selected.status ?? "—"}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[60vh]">
                {msgs.map((m) => {
                  const out = m.direction === "outbound";
                  return (
                    <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${out ? "bg-primary text-primary-foreground" : "bg-accent/50"}`}>
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        <div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })}
                {!msgs.length && <div className="text-center text-xs text-muted-foreground py-8">Sem mensagens</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
