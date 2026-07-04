import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, MessageSquare, MessagesSquare, Timer, Coins, DollarSign, Plug, Bot,
  Plus, Search, ArrowUpRight, Zap, Users, ScrollText, RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Plataforma IA" }] }),
  component: Dashboard,
});

const nf = new Intl.NumberFormat("pt-BR");
const cf = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };

type ConvRow = { id: string; status: string; last_message_at: string | null; unread_count: number; created_at: string };
type LogRow = { id: string; level: string; source: string | null; message: string; created_at: string };

function Dashboard() {
  const { user } = useAuth();
  const uid = user?.id;

  const dash = useQuery({
    queryKey: ["dashboard", uid],
    enabled: !!uid,
    queryFn: async () => {
      const today = startOfToday();
      const month = startOfMonth();
      const [
        agentsActive, agentsTotal, convsToday, msgsToday, contactsTotal,
        billing, usage, recentConvs, recentLogs, avgTime,
      ] = await Promise.all([
        supabase.from("agents").select("id", { count: "exact", head: true }).eq("user_id", uid!).eq("is_active", true),
        supabase.from("agents").select("id", { count: "exact", head: true }).eq("user_id", uid!),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", uid!).gte("created_at", today),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", uid!).gte("created_at", today),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", uid!),
        supabase.from("billing_events").select("kind, quantity, amount").eq("user_id", uid!).gte("occurred_at", month),
        supabase.from("usage_counters").select("day_count, month_count").eq("user_id", uid!).maybeSingle(),
        supabase.from("conversations").select("id, status, last_message_at, unread_count, created_at").eq("user_id", uid!).order("last_message_at", { ascending: false, nullsFirst: false }).limit(6),
        supabase.from("logs").select("id, level, source, message, created_at").eq("user_id", uid!).order("created_at", { ascending: false }).limit(6),
        supabase.rpc("noop_avg_response", {}).then(() => null).catch(() => null),
      ]);

      const tokens = (billing.data ?? [])
        .filter((r) => /token/i.test(r.kind))
        .reduce((s, r) => s + Number(r.quantity || 0), 0);
      const cost = (billing.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);

      return {
        tokens,
        cost,
        requests: usage.data?.month_count ?? 0,
        requestsToday: usage.data?.day_count ?? 0,
        agentsActive: agentsActive.count ?? 0,
        agentsTotal: agentsTotal.count ?? 0,
        convsToday: convsToday.count ?? 0,
        msgsToday: msgsToday.count ?? 0,
        contactsTotal: contactsTotal.count ?? 0,
        recentConvs: (recentConvs.data ?? []) as ConvRow[],
        recentLogs: (recentLogs.data ?? []) as LogRow[],
        avgTime: avgTime as string | null,
      };
    },
  });

  // Realtime refresh on inserts to core tables
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`dash-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${uid}` }, () => dash.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${uid}` }, () => dash.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts", filter: `user_id=eq.${uid}` }, () => dash.refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, dash]);

  const d = dash.data;
  const stats = [
    { label: "Tokens", value: d ? nf.format(d.tokens) : "—", delta: "mês atual", icon: Coins, tone: "primary" as const },
    { label: "Custo IA", value: d ? cf.format(d.cost) : "—", delta: "mês atual", icon: DollarSign, tone: "accent" as const },
    { label: "Requisições", value: d ? nf.format(d.requests) : "—", delta: `${d?.requestsToday ?? 0} hoje`, icon: Zap, tone: "primary" as const },
    { label: "Contatos", value: d ? nf.format(d.contactsTotal) : "—", delta: "total", icon: Users, tone: "accent" as const },
    { label: "Agentes Ativos", value: d ? nf.format(d.agentsActive) : "—", delta: `${d?.agentsTotal ?? 0} total`, icon: Bot, tone: "primary" as const },
    { label: "Conversas", value: d ? nf.format(d.convsToday) : "—", delta: "hoje", icon: MessagesSquare, tone: "accent" as const },
    { label: "Mensagens", value: d ? nf.format(d.msgsToday) : "—", delta: "hoje", icon: MessageSquare, tone: "primary" as const },
    { label: "Tempo médio", value: "—", delta: "em breve", icon: Timer, tone: "accent" as const },
  ];

  const fmtWhen = (iso: string | null) => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "agora";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl border border-border/60 p-6 md:p-8"
        style={{ background: "var(--gradient-mesh), var(--card)" }}
      >
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0 space-y-2">
            <Badge variant="outline" className="bg-primary/15 text-primary border-primary/40">
              <Zap className="h-3 w-3" /> Plataforma IA Premium
            </Badge>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-primary)" }}>
              Central de Comando
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Gerencie agentes de IA, conexões e conversas em tempo real com performance de nível enterprise.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar agentes, conversas..." className="pl-9 w-72 bg-background/40 backdrop-blur border-border/60" />
            </div>
            <Button variant="outline" onClick={() => dash.refetch()} disabled={dash.isFetching}>
              <RefreshCw className={`h-4 w-4 ${dash.isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button asChild className="shadow-lg" style={{ boxShadow: "var(--shadow-elegant)" }}>
              <Link to="/agents"><Plus className="h-4 w-4" /> Novo Agente</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="group relative overflow-hidden border-border/50 hover:border-primary/40 transition-all hover:-translate-y-0.5">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "var(--gradient-mesh)" }} />
            <CardHeader className="relative pb-1 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</CardTitle>
              <div className={`grid h-8 w-8 place-items-center rounded-lg ${s.tone === "primary" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"}`}>
                <s.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="relative space-y-1">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3" /> {s.delta}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Panels */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/50 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Últimas Conversas</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Interações mais recentes dos seus agentes</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/conversations">Ver todas <ArrowUpRight className="h-3 w-3" /></Link></Button>
          </CardHeader>
          <CardContent>
            {d && d.recentConvs.length > 0 ? (
              <ul className="divide-y divide-border/50">
                {d.recentConvs.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary shrink-0">
                        <MessagesSquare className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">Conversa {c.id.slice(0, 8)}</div>
                        <div className="text-[11px] text-muted-foreground">{c.status} · {fmtWhen(c.last_message_at ?? c.created_at)}</div>
                      </div>
                    </div>
                    {c.unread_count > 0 && (
                      <Badge variant="outline" className="bg-primary/15 text-primary border-primary/40">{c.unread_count}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-10 text-center space-y-2">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                  <MessagesSquare className="h-5 w-5" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhuma conversa ainda. Conecte seu WhatsApp para começar.</p>
                <Button asChild variant="outline" size="sm"><Link to="/whatsapp"><Plug className="h-3.5 w-3.5" /> Conectar</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4 text-accent" /> Logs Recentes</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Atividade do sistema</p>
          </CardHeader>
          <CardContent>
            {d && d.recentLogs.length > 0 ? (
              <ul className="space-y-2">
                {d.recentLogs.map((l) => (
                  <li key={l.id} className="text-xs border border-border/50 rounded-lg p-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="uppercase text-[10px]">{l.level}</Badge>
                      <span className="text-muted-foreground">{fmtWhen(l.created_at)}</span>
                    </div>
                    <div className="mt-1 line-clamp-2">{l.message}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">Sistema aguardando eventos.</p>
                <Button asChild variant="ghost" size="sm"><Link to="/logs">Abrir logs</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}