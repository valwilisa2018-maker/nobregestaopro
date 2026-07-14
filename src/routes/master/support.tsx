import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  LifeBuoy, Loader2, Send, CheckCircle2, Search, Activity, Clock, X,
  RefreshCw, TrendingUp, Users, AlertTriangle, Timer, Settings2, Star,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

export const Route = createFileRoute("/master/support")({
  head: () => ({ meta: [{ title: "Suporte — Painel Master" }] }),
  component: Page,
});

type Ticket = {
  id: string; user_id: string; ticket_number: number | null; subject: string;
  status: string; priority: string | null; category: string | null;
  first_response_at: string | null; resolved_at: string | null; closed_at: string | null;
  last_message_at: string; created_at: string; rating: number | null;
};
type Msg = { id: string; ticket_id: string; sender_id: string; sender_role: string; body: string; created_at: string };

const STATUS_META: Record<string, { label: string; color: string; cls: string }> = {
  open:         { label: "Aberto",              color: "#3b82f6", cls: "bg-blue-500/15 text-blue-500 border-blue-500/40" },
  in_analysis:  { label: "Em análise",          color: "#8b5cf6", cls: "bg-violet-500/15 text-violet-500 border-violet-500/40" },
  in_progress:  { label: "Em andamento",        color: "#f59e0b", cls: "bg-amber-500/15 text-amber-500 border-amber-500/40" },
  pending:      { label: "Aguardando cliente",  color: "#06b6d4", cls: "bg-cyan-500/15 text-cyan-500 border-cyan-500/40" },
  waiting_dev:  { label: "Aguardando dev",      color: "#d946ef", cls: "bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/40" },
  resolved:     { label: "Resolvido",           color: "#10b981", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" },
  closed:       { label: "Fechado",             color: "#64748b", cls: "bg-muted text-muted-foreground border-border" },
  cancelled:    { label: "Cancelado",           color: "#ef4444", cls: "bg-red-500/15 text-red-500 border-red-500/40" },
};
const PRIORITIES = [
  { value: "low",    label: "Baixa",   icon: "🟢", color: "#10b981" },
  { value: "normal", label: "Normal",  icon: "🟡", color: "#eab308" },
  { value: "high",   label: "Alta",    icon: "🟠", color: "#f97316" },
  { value: "urgent", label: "Urgente", icon: "🔴", color: "#ef4444" },
];
const NEXT_STATUS = ["open", "in_analysis", "in_progress", "pending", "waiting_dev", "resolved", "closed"];

function fmtDur(ms: number) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [range, setRange] = useState<"7" | "30" | "90">("30");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("support_tickets").select("*").order("last_message_at", { ascending: false }).limit(1000);
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("master-sup-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", selected.id).order("created_at");
      setMessages((data as Msg[]) ?? []);
    })();
    const ch = supabase.channel(`sup-msgs-${selected.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${selected.id}` },
        (p) => setMessages(m => [...m, p.new as Msg]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected]);

  const send = async () => {
    if (!reply.trim() || !selected) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "master", body: reply,
    });
    if (!error) {
      const patch: { last_message_at: string; first_response_at?: string; status?: string } = {
        last_message_at: new Date().toISOString(),
      };
      if (!selected.first_response_at) patch.first_response_at = new Date().toISOString();
      if (selected.status === "open") patch.status = "in_progress";
      await supabase.from("support_tickets").update(patch).eq("id", selected.id);
      setReply("");
      load();
    } else toast.error(error.message);
    setSending(false);
  };

  const setStatus = async (status: string) => {
    if (!selected) return;
    const patch: { status: string; resolved_at?: string; closed_at?: string } = { status };
    if (status === "resolved") patch.resolved_at = new Date().toISOString();
    if (status === "closed") patch.closed_at = new Date().toISOString();
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", selected.id);
    if (error) toast.error(error.message); else { toast.success("Status atualizado"); load(); }
  };

  const setPriority = async (priority: string) => {
    if (!selected) return;
    const { error } = await supabase.from("support_tickets").update({ priority }).eq("id", selected.id);
    if (error) toast.error(error.message); else load();
  };

  // ---------- KPIs ----------
  const stats = useMemo(() => {
    const days = parseInt(range, 10);
    const from = Date.now() - days * 86400_000;
    const inRange = tickets.filter(t => new Date(t.created_at).getTime() >= from);
    const c = (arr: string[]) => tickets.filter(t => arr.includes(t.status)).length;
    const responded = tickets.filter(t => t.first_response_at);
    const avgResp = responded.length
      ? responded.reduce((s, t) => s + (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()), 0) / responded.length
      : 0;
    const resolved = tickets.filter(t => t.resolved_at);
    const avgRes = resolved.length
      ? resolved.reduce((s, t) => s + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0) / resolved.length
      : 0;
    const rated = tickets.filter(t => t.rating != null);
    const avgRating = rated.length ? rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length : 0;
    const uniqueClients = new Set(tickets.map(t => t.user_id)).size;
    return {
      newInRange: inRange.length,
      total: tickets.length,
      open: c(["open"]),
      inProgress: c(["in_analysis", "in_progress", "waiting_dev"]),
      pending: c(["pending"]),
      resolved: c(["resolved"]),
      closed: c(["closed"]),
      urgent: tickets.filter(t => t.priority === "urgent" && !["resolved", "closed", "cancelled"].includes(t.status)).length,
      avgResp: fmtDur(avgResp),
      avgRes: fmtDur(avgRes),
      avgRating,
      uniqueClients,
    };
  }, [tickets, range]);

  // ---------- Chart data ----------
  const trendData = useMemo(() => {
    const days = parseInt(range, 10);
    const buckets: Record<string, { date: string; abertos: number; resolvidos: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const k = d.toISOString().slice(0, 10);
      buckets[k] = { date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), abertos: 0, resolvidos: 0 };
    }
    tickets.forEach(t => {
      const k = t.created_at.slice(0, 10);
      if (buckets[k]) buckets[k].abertos++;
      if (t.resolved_at) {
        const rk = t.resolved_at.slice(0, 10);
        if (buckets[rk]) buckets[rk].resolvidos++;
      }
    });
    return Object.values(buckets);
  }, [tickets, range]);

  const statusPie = useMemo(() => Object.entries(STATUS_META).map(([k, v]) => ({
    name: v.label, value: tickets.filter(t => t.status === k).length, color: v.color,
  })).filter(x => x.value > 0), [tickets]);

  const priorityBar = useMemo(() => PRIORITIES.map(p => ({
    name: p.label, total: tickets.filter(t => t.priority === p.value).length, color: p.color,
  })), [tickets]);

  const categoryBar = useMemo(() => {
    const map = new Map<string, number>();
    tickets.forEach(t => { if (t.category) map.set(t.category, (map.get(t.category) ?? 0) + 1); });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, total]) => ({ name, total }));
  }, [tickets]);

  const filtered = useMemo(() => tickets.filter(t => {
    if (fStatus !== "all" && t.status !== fStatus) return false;
    if (fPriority !== "all" && t.priority !== fPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.subject.toLowerCase().includes(q)
        && !String(t.ticket_number ?? "").includes(q)
        && !t.user_id.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [tickets, fStatus, fPriority, search]);

  return (
    <PageShell
      title="Central de Suporte — Master"
      description="Atenda seus clientes com métricas, gráficos e conversa em tempo real."
      icon={<LifeBuoy className="h-6 w-6" />}
      status="ativo"
      actions={
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as "7" | "30" | "90")}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/master/support-settings"><Settings2 className="h-4 w-4" /> Configurações</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
        </div>
      }
    >
      {/* Hero KPIs (large) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <BigKpi label={`Novos (últimos ${range}d)`} value={stats.newInRange} tone="blue" icon={<TrendingUp className="h-5 w-5" />} sub={`${stats.total} chamados totais`} />
        <BigKpi label="Abertos + em andamento" value={stats.open + stats.inProgress} tone="amber" icon={<Activity className="h-5 w-5" />} sub={`${stats.pending} aguardando cliente`} />
        <BigKpi label="Urgentes ativos" value={stats.urgent} tone="red" icon={<AlertTriangle className="h-5 w-5" />} sub="Atenção prioritária" />
        <BigKpi label="Avaliação média" value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} tone="violet" icon={<Star className="h-5 w-5" />} sub={`${stats.uniqueClients} clientes atendidos`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MiniKpi label="Resolvidos" value={stats.resolved} tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} />
        <MiniKpi label="Fechados" value={stats.closed} tone="muted" icon={<X className="h-4 w-4" />} />
        <MiniKpi label="Tempo médio de resposta" value={stats.avgResp} tone="cyan" icon={<Timer className="h-4 w-4" />} />
        <MiniKpi label="Tempo médio de resolução" value={stats.avgRes} tone="fuchsia" icon={<Clock className="h-4 w-4" />} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/60 bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Tendência de chamados</h3>
              <span className="text-xs text-muted-foreground">Abertos vs resolvidos</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="gAbertos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gResolvidos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="abertos" name="Abertos" stroke="#3b82f6" fill="url(#gAbertos)" strokeWidth={2} />
                <Area type="monotone" dataKey="resolvidos" name="Resolvidos" stroke="#10b981" fill="url(#gResolvidos)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Distribuição por status</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3}>
                  {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" /> Chamados por prioridade</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={priorityBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                  {priorityBar.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Top categorias</h3>
            {categoryBar.length === 0 ? (
              <div className="h-[240px] grid place-items-center text-sm text-muted-foreground">Sem categorias registradas</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryBar} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={140} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="total" fill="var(--primary)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por título, #número ou ID do cliente" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPriority} onValueChange={setFPriority}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.icon} {p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Lista + Chat */}
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card><CardContent className="p-0 max-h-[75vh] overflow-y-auto">
            {filtered.map(t => {
              const st = STATUS_META[t.status] ?? STATUS_META.open;
              const p = PRIORITIES.find(x => x.value === t.priority);
              return (
                <button key={t.id} onClick={() => setSelected(t)}
                  className={`w-full text-left p-3 border-b transition hover:bg-muted/40 ${selected?.id === t.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-muted-foreground">#{String(t.ticket_number ?? "—").padStart(6, "0")}</div>
                      <div className="font-medium text-sm truncate">{t.subject}</div>
                    </div>
                    <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {p && <span>{p.icon} {p.label}</span>}
                    {t.category && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{t.category}</span>}
                    <span className="ml-auto">{new Date(t.last_message_at).toLocaleString("pt-BR")}</span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Nenhum chamado encontrado.</div>}
          </CardContent></Card>

          <Card>
            <CardContent className="p-4 flex flex-col h-[75vh]">
              {!selected ? (
                <div className="flex-1 grid place-items-center text-muted-foreground">
                  <div className="text-center space-y-2">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><LifeBuoy className="h-6 w-6" /></div>
                    <p className="text-sm">Selecione um chamado para responder</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-muted-foreground">#{String(selected.ticket_number ?? "—").padStart(6, "0")}</div>
                      <h3 className="font-semibold truncate">{selected.subject}</h3>
                      <p className="text-xs text-muted-foreground">
                        Cliente {selected.user_id.slice(0, 8)} · Aberto em {new Date(selected.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={selected.priority ?? "normal"} onValueChange={setPriority}>
                        <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.icon} {p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={selected.status} onValueChange={setStatus}>
                        <SelectTrigger className="w-[190px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {NEXT_STATUS.map(s => <SelectItem key={s} value={s}>{STATUS_META[s]?.label ?? s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto py-3 space-y-2">
                    {messages.map(m => (
                      <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        className={`flex ${m.sender_role === "master" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.sender_role === "master" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      </motion.div>
                    ))}
                    {messages.length === 0 && <div className="grid place-items-center text-xs text-muted-foreground py-8">Nenhuma mensagem ainda.</div>}
                  </div>
                  <div className="flex gap-2 border-t pt-3">
                    <Textarea rows={2} value={reply} onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                      placeholder="Escreva uma resposta cordial e clara..." />
                    <Button onClick={send} disabled={sending || !reply.trim()} size="lg" className="gap-2">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

// ---------- KPI components ----------
const TONES: Record<string, string> = {
  blue: "from-blue-500/20 to-blue-500/5 text-blue-500 border-blue-500/30",
  amber: "from-amber-500/20 to-amber-500/5 text-amber-500 border-amber-500/30",
  cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-500 border-cyan-500/30",
  emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500 border-emerald-500/30",
  muted: "from-muted/60 to-muted/20 text-muted-foreground border-border",
  violet: "from-violet-500/20 to-violet-500/5 text-violet-500 border-violet-500/30",
  fuchsia: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-500 border-fuchsia-500/30",
  red: "from-red-500/20 to-red-500/5 text-red-500 border-red-500/30",
};

function BigKpi({ label, value, tone, icon, sub }: { label: string; value: number | string; tone: string; icon: React.ReactNode; sub?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${TONES[tone]} backdrop-blur-xl p-5`}>
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-current opacity-10 blur-3xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-80">{label}</div>
          <div className="text-4xl font-black mt-1 text-foreground tabular-nums">{value}</div>
          {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
        </div>
        <div className="rounded-xl bg-background/50 p-2.5 backdrop-blur">{icon}</div>
      </div>
    </motion.div>
  );
}

function MiniKpi({ label, value, tone, icon }: { label: string; value: number | string; tone: string; icon: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${TONES[tone]} backdrop-blur p-4`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider opacity-80">{label}</span>
        <div className="opacity-80">{icon}</div>
      </div>
      <div className="font-bold text-2xl mt-1 text-foreground tabular-nums">{value}</div>
    </div>
  );
}
