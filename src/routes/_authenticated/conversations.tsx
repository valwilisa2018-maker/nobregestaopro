import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Check, CircleAlert, MessagesSquare, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
type LogRow = {
  id: string;
  level: string | null;
  source: string | null;
  message: string | null;
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
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [selected, setSelected] = useState<Conv | null>(null);
  const [loading, setLoading] = useState(false);
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("agents")
      .select("id,name")
      .eq("user_id", user.id)
      .order("name")
      .then(({ data }) => setAgents(data ?? []));
  }, [user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("conversations")
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
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user, agentFilter, statusFilter, from, to]);

  useEffect(() => {
    if (!selected || !user) {
      setMsgs([]);
      setLogs([]);
      return;
    }
    supabase
      .from("messages")
      .select("id,conversation_id,direction,type,content,created_at,metadata")
      .eq("conversation_id", selected.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(500)
      .then(({ data }) => setMsgs((data ?? []) as Msg[]));
  }, [selected, user]);

  // Load evolution logs relevant to the selected conversation (matched by remoteJid)
  useEffect(() => {
    if (!selected || !user) {
      setLogs([]);
      return;
    }
    (async () => {
      const jids = Array.from(
        new Set(
          msgs
            .map((m) => (m.metadata as { remoteJid?: string } | null)?.remoteJid)
            .filter(Boolean) as string[],
        ),
      );
      if (!jids.length) {
        setLogs([]);
        return;
      }
      const { data } = await supabase
        .from("logs")
        .select("id,level,source,message,created_at,metadata")
        .eq("user_id", user.id)
        .or("source.like.evolution:%,source.like.supabase:%,source.like.auth:%,source.like.rls:%")
        .order("created_at", { ascending: false })
        .limit(200);
      const filtered = (data ?? []).filter((l) => {
        const md = (l.metadata ?? {}) as { remoteJid?: string; recipient?: string };
        const matchesJid = jids.some(
          (j) =>
            md.remoteJid === j ||
            md.recipient === j ||
            (md.recipient ?? "").startsWith(j.split("@")[0]),
        );
        const isAuth = isAuthzLog(l);
        // Auth/RLS logs may not carry a jid — keep them for the selected conversation window
        return matchesJid || isAuth;
      });
      setLogs(filtered as LogRow[]);
    })();
  }, [selected, msgs, user]);

  // Map outbound msg → status by nearest error log (±60s on same jid)
  const msgStatus = useMemo(() => {
    const map = new Map<string, "sent" | "error">();
    for (const m of msgs) {
      if (m.direction !== "outbound") continue;
      const jid = (m.metadata as { remoteJid?: string } | null)?.remoteJid;
      const t = new Date(m.created_at).getTime();
      const err = logs.find((l) => {
        if (l.level !== "error" && l.level !== "warn") return false;
        const lt = new Date(l.created_at).getTime();
        if (Math.abs(lt - t) > 60_000) return false;
        const md = (l.metadata ?? {}) as { remoteJid?: string; recipient?: string };
        return (
          !jid ||
          md.remoteJid === jid ||
          md.recipient === jid ||
          (md.recipient ?? "").startsWith((jid ?? "").split("@")[0])
        );
      });
      map.set(m.id, err ? "error" : "sent");
    }
    return map;
  }, [msgs, logs]);
  const errorLogs = useMemo(
    () => logs.filter((l) => (l.level === "error" || l.level === "warn") && !isAuthzLog(l)),
    [logs],
  );
  const authzLogs = useMemo(
    () => logs.filter((l) => (l.level === "error" || l.level === "warn") && isAuthzLog(l)),
    [logs],
  );

  const agentName = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.name])), [agents]);

  return (
    <PageShell
      title="Conversas"
      description="Visualize conversas e mensagens salvas."
      icon={<MessagesSquare className="h-6 w-6" />}
      status="ativo"
      actions={
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      }
    >
      <div className="grid gap-3 md:grid-cols-4 rounded-2xl border border-border/60 bg-card/40 p-3">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Agente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos agentes</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="De"
        />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Até" />
      </div>

      <div className="grid gap-3 md:grid-cols-[380px_1fr]">
        <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
          <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
            {convs.length} conversas
          </div>
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
                  <Badge variant="outline" className="text-[10px]">
                    {c.status ?? "—"}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "—"}
                  </span>
                  {(c.unread_count ?? 0) > 0 && (
                    <span className="text-primary">{c.unread_count} não lidas</span>
                  )}
                </div>
              </button>
            ))}
            {!convs.length && !loading && (
              <div className="p-6 text-center text-xs text-muted-foreground">Nenhuma conversa</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden flex flex-col">
          {!selected ? (
            <div className="grid place-items-center h-[65vh] text-sm text-muted-foreground">
              Selecione uma conversa
            </div>
          ) : (
            <>
              <div className="border-b border-border/60 px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">
                    {selected.agent_id ? (agentName[selected.agent_id] ?? "Agente") : "Sem agente"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{msgs.length} mensagens</div>
                </div>
                <Badge variant="outline">{selected.status ?? "—"}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[60vh]">
                {msgs.map((m) => {
                  const out = m.direction === "outbound";
                  const st = msgStatus.get(m.id);
                  return (
                    <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${out ? "bg-primary text-primary-foreground" : "bg-accent/50"}`}
                      >
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-80">
                          <span>{new Date(m.created_at).toLocaleString()}</span>
                          {out && st === "sent" && (
                            <>
                              <Check className="h-3 w-3" />
                              <span>enviada</span>
                            </>
                          )}
                          {out && st === "error" && (
                            <>
                              <CircleAlert className="h-3 w-3" />
                              <span>falhou</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!msgs.length && (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    Sem mensagens
                  </div>
                )}
              </div>
              {errorLogs.length > 0 && (
                <div className="border-t border-border/60 bg-destructive/5 max-h-40 overflow-y-auto">
                  <div className="px-4 py-2 text-xs font-semibold flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> Erros de envio ({errorLogs.length})
                  </div>
                  <ul className="px-4 pb-3 space-y-1 text-[11px]">
                    {errorLogs.slice(0, 20).map((l) => (
                      <li key={l.id} className="flex gap-2">
                        <span className="text-muted-foreground shrink-0">
                          {new Date(l.created_at).toLocaleTimeString()}
                        </span>
                        <span className="truncate">{l.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {authzLogs.length > 0 && (
                <div className="border-t border-border/60 bg-amber-500/5 max-h-40 overflow-y-auto">
                  <div className="px-4 py-2 text-xs font-semibold flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> Erros de autorização (Supabase/RLS) (
                    {authzLogs.length})
                  </div>
                  <ul className="px-4 pb-3 space-y-1 text-[11px]">
                    {authzLogs.slice(0, 20).map((l) => (
                      <li key={l.id} className="flex gap-2">
                        <span className="text-muted-foreground shrink-0">
                          {new Date(l.created_at).toLocaleTimeString()}
                        </span>
                        <span className="shrink-0 uppercase text-[9px] text-muted-foreground">
                          {l.source}
                        </span>
                        <span className="truncate">{l.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function isAuthzLog(l: { source: string | null; message: string | null; metadata: unknown }) {
  const src = (l.source ?? "").toLowerCase();
  if (src.startsWith("supabase:") || src.startsWith("auth:") || src.startsWith("rls:")) return true;
  const hay = `${l.message ?? ""} ${JSON.stringify(l.metadata ?? {})}`.toLowerCase();
  return /(row-level security|rls|permission denied|unauthorized|jwt|policy|forbidden|42501|pgrst)/.test(
    hay,
  );
}
