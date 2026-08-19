import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  DollarSign,
  CreditCard,
  LifeBuoy,
  Coins,
  TrendingUp,
  ShieldAlert,
  Package,
  Bot,
  AlertTriangle,
  Sparkles,
  Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";

export const Route = createFileRoute("/master/")({
  head: () => ({ meta: [{ title: "Dashboard Master — Plataforma" }] }),
  component: Page,
});

type Order = {
  price_cents: number;
  tokens: number;
  status: string;
  paid_at: string | null;
  created_at: string;
};
type Profile = { status: string; plan_id: string | null; plan_activated_at: string | null };
type Plan = { id: string; name: string; price_cents: number };
type Tx = {
  total_tokens: number | null;
  cost_cents: number | null;
  kind: string;
  occurred_at: string;
};
type Agent = { id: string; user_id: string; is_active: boolean };
type Log = {
  id: string;
  level: string;
  source: string | null;
  message: string;
  created_at: string;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNum(n: number) {
  return n.toLocaleString("pt-BR");
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function last6Months() {
  const arr: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    arr.push({
      key: monthKey(d),
      label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    });
  }
  return arr;
}

const PIE_COLORS = ["var(--primary)", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function Page() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [ordersPending, setOrdersPending] = useState(0);
  const [ticketsOpen, setTicketsOpen] = useState(0);

  useEffect(() => {
    (async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const iso6 = sixMonthsAgo.toISOString();
      const [o, p, pl, t, a, lg, op, tk] = await Promise.all([
        supabase
          .from("credit_orders")
          .select("price_cents,tokens,status,paid_at,created_at")
          .gte("created_at", iso6),
        supabase.from("profiles").select("status,plan_id,plan_activated_at"),
        supabase.from("plans").select("id,name,price_cents"),
        supabase
          .from("credit_transactions")
          .select("total_tokens,cost_cents,kind,occurred_at")
          .eq("kind", "usage")
          .gte("occurred_at", iso6),
        supabase.from("agents").select("id,user_id,is_active"),
        supabase
          .from("logs")
          .select("id,level,source,message,created_at")
          .in("level", ["error", "warn"])
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("credit_orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("support_tickets")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
      ]);
      setOrders((o.data as Order[]) ?? []);
      setProfiles((p.data as Profile[]) ?? []);
      setPlans((pl.data as Plan[]) ?? []);
      setTxs((t.data as Tx[]) ?? []);
      setAgents((a.data as Agent[]) ?? []);
      setLogs((lg.data as Log[]) ?? []);
      setOrdersPending(op.count ?? 0);
      setTicketsOpen(tk.count ?? 0);
      setLoading(false);
    })();
  }, []);

  const derived = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const planPriceById = new Map(plans.map((p) => [p.id, p.price_cents ?? 0]));
    const active = profiles.filter((p) => p.status === "active");
    const suspended = profiles.filter((p) => p.status === "suspended").length;
    const pending = profiles.filter((p) => p.status === "pending").length;

    const creditsMonth = orders
      .filter((o) => o.status === "paid" && o.paid_at && new Date(o.paid_at) >= monthStart)
      .reduce((a, o) => a + (o.price_cents ?? 0), 0);
    const plansMonth = active
      .filter((p) => p.plan_activated_at && new Date(p.plan_activated_at) >= monthStart)
      .reduce((a, p) => a + (planPriceById.get(p.plan_id ?? "") ?? 0), 0);
    const creditsTotal = orders
      .filter((o) => o.status === "paid")
      .reduce((a, o) => a + o.price_cents, 0);
    const plansTotal = active.reduce((a, p) => a + (planPriceById.get(p.plan_id ?? "") ?? 0), 0);

    const tokensMonth = txs
      .filter((t) => new Date(t.occurred_at) >= monthStart)
      .reduce((a, t) => a + Number(t.total_tokens ?? 0), 0);
    const costMonth = txs
      .filter((t) => new Date(t.occurred_at) >= monthStart)
      .reduce((a, t) => a + Number(t.cost_cents ?? 0), 0);

    // 6-month time series
    const months = last6Months();
    const revByMonth = new Map(months.map((m) => [m.key, { credits: 0, plans: 0 }]));
    const tokByMonth = new Map(months.map((m) => [m.key, 0]));
    for (const o of orders) {
      if (o.status !== "paid" || !o.paid_at) continue;
      const k = monthKey(new Date(o.paid_at));
      const row = revByMonth.get(k);
      if (row) row.credits += o.price_cents;
    }
    for (const p of active) {
      if (!p.plan_activated_at) continue;
      const k = monthKey(new Date(p.plan_activated_at));
      const row = revByMonth.get(k);
      if (row) row.plans += planPriceById.get(p.plan_id ?? "") ?? 0;
    }
    for (const t of txs) {
      const k = monthKey(new Date(t.occurred_at));
      if (tokByMonth.has(k))
        tokByMonth.set(k, (tokByMonth.get(k) || 0) + Number(t.total_tokens ?? 0));
    }
    const revSeries = months.map((m) => ({
      mes: m.label,
      creditos: (revByMonth.get(m.key)?.credits ?? 0) / 100,
      planos: (revByMonth.get(m.key)?.plans ?? 0) / 100,
      total: ((revByMonth.get(m.key)?.credits ?? 0) + (revByMonth.get(m.key)?.plans ?? 0)) / 100,
    }));
    const tokSeries = months.map((m) => ({ mes: m.label, tokens: tokByMonth.get(m.key) ?? 0 }));

    // Pie: clients by status
    const statusPie = [
      { name: "Ativos", value: active.length },
      { name: "Pendentes", value: pending },
      { name: "Suspensos", value: suspended },
    ].filter((s) => s.value > 0);

    // Pie: revenue split month
    const revenuePie = [
      { name: "Créditos", value: creditsMonth / 100 },
      { name: "Planos", value: plansMonth / 100 },
    ].filter((s) => s.value > 0);

    // Plans distribution
    const planCount = new Map<string, number>();
    for (const p of active)
      if (p.plan_id) planCount.set(p.plan_id, (planCount.get(p.plan_id) ?? 0) + 1);
    const plansBar = plans
      .map((p) => ({
        name: p.name,
        ativos: planCount.get(p.id) ?? 0,
        receita: ((planCount.get(p.id) ?? 0) * (p.price_cents ?? 0)) / 100,
      }))
      .filter((r) => r.ativos > 0);

    const agentsActive = agents.filter((a) => a.is_active).length;
    const uniqAgentUsers = new Set(agents.map((a) => a.user_id)).size;

    return {
      clientsTotal: profiles.length,
      clientsActive: active.length,
      suspended,
      pending,
      creditsMonth,
      plansMonth,
      mrr: plansTotal,
      revenueTotal: creditsTotal + plansTotal,
      tokensMonth,
      costMonth,
      agentsTotal: agents.length,
      agentsActive,
      uniqAgentUsers,
      revSeries,
      tokSeries,
      statusPie,
      revenuePie,
      plansBar,
    };
  }, [orders, profiles, plans, txs, agents]);

  const kpis = [
    {
      label: "Clientes ativos",
      value: fmtNum(derived.clientsActive),
      icon: Users,
      hint: `${fmtNum(derived.clientsTotal)} no total`,
      tone: "primary" as const,
    },
    {
      label: "Receita do mês",
      value: formatBRL(derived.creditsMonth + derived.plansMonth),
      icon: DollarSign,
      hint: "créditos + planos",
      tone: "emerald" as const,
    },
    {
      label: "MRR (planos)",
      value: formatBRL(derived.mrr),
      icon: TrendingUp,
      hint: "recorrência mensal",
      tone: "violet" as const,
    },
    {
      label: "Receita total",
      value: formatBRL(derived.revenueTotal),
      icon: Sparkles,
      hint: "histórico",
      tone: "amber" as const,
    },
    {
      label: "Créditos vendidos (mês)",
      value: formatBRL(derived.creditsMonth),
      icon: Coins,
      hint: "avulso",
      tone: "cyan" as const,
    },
    {
      label: "Tokens consumidos (mês)",
      value: fmtNum(derived.tokensMonth),
      icon: Activity,
      hint: `custo ${formatBRL(derived.costMonth)}`,
      tone: "primary" as const,
    },
    {
      label: "Agentes ativos",
      value: fmtNum(derived.agentsActive),
      icon: Bot,
      hint: `${fmtNum(derived.agentsTotal)} totais · ${fmtNum(derived.uniqAgentUsers)} contas`,
      tone: "emerald" as const,
    },
    {
      label: "Pedidos pendentes",
      value: fmtNum(ordersPending),
      icon: CreditCard,
      hint: "aguardando aprovação",
      tone: "amber" as const,
    },
    {
      label: "Contas pendentes",
      value: fmtNum(derived.pending),
      icon: ShieldAlert,
      hint: "aguardando ativação",
      tone: "amber" as const,
    },
    {
      label: "Contas suspensas",
      value: fmtNum(derived.suspended),
      icon: ShieldAlert,
      hint: "bloqueadas",
      tone: "red" as const,
    },
    {
      label: "Tickets abertos",
      value: fmtNum(ticketsOpen),
      icon: LifeBuoy,
      hint: "suporte",
      tone: "violet" as const,
    },
    {
      label: "Alertas plataforma",
      value: fmtNum(logs.filter((l) => l.level === "error").length),
      icon: AlertTriangle,
      hint: "erros recentes",
      tone: "red" as const,
    },
  ];

  const toneMap: Record<string, string> = {
    primary: "from-primary/20 to-primary/5 text-primary",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-400",
    violet: "from-violet-500/20 to-violet-500/5 text-violet-400",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-400",
    cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-400",
    red: "from-red-500/20 to-red-500/5 text-red-400",
  };

  return (
    <PageShell
      title="Dashboard Master"
      description="Visão geral premium da plataforma"
      icon={<Package className="h-6 w-6" />}
      status="ativo"
    >
      {loading ? (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {kpis.map((c) => (
              <Card
                key={c.label}
                className="relative overflow-hidden group hover:border-primary/40 transition"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${toneMap[c.tone].split(" ").slice(0, 2).join(" ")} opacity-60 pointer-events-none`}
                />
                <CardContent className="relative p-5">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                        {c.label}
                      </p>
                      <p className="text-2xl font-black mt-1 tabular-nums truncate">{c.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">{c.hint}</p>
                    </div>
                    <div
                      className={`h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-gradient-to-br ${toneMap[c.tone]} ring-1 ring-white/10`}
                    >
                      <c.icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Row: revenue area + status pie */}
          <div className="grid gap-4 mt-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold">Receita nos últimos 6 meses</p>
                    <p className="text-xs text-muted-foreground">
                      Créditos avulsos + planos ativados
                    </p>
                  </div>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                    BRL
                  </Badge>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={derived.revSeries}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="gCred" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gPla" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        fontSize={12}
                        tickFormatter={(v) => `R$${v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                        }}
                        formatter={(v: number) =>
                          v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area
                        type="monotone"
                        dataKey="creditos"
                        name="Créditos"
                        stroke="var(--primary)"
                        fill="url(#gCred)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="planos"
                        name="Planos"
                        stroke="#10b981"
                        fill="url(#gPla)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-bold mb-3">Status dos clientes</p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={derived.statusPie}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={95}
                        paddingAngle={4}
                      >
                        {derived.statusPie.map((_, i) => (
                          <Cell
                            key={i}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                            stroke="var(--background)"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row: tokens bar + revenue pie + plans bar */}
          <div className="grid gap-4 mt-4 lg:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-bold mb-3">Consumo de tokens (6 meses)</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={derived.tokSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        fontSize={12}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                        }}
                        formatter={(v: number) => v.toLocaleString("pt-BR")}
                      />
                      <Bar dataKey="tokens" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-bold mb-3">Origem da receita (mês)</p>
                <div className="h-64">
                  {derived.revenuePie.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={derived.revenuePie}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={95}
                          label={(e) => `${e.name}`}
                        >
                          {derived.revenuePie.map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                              stroke="var(--background)"
                              strokeWidth={2}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                          }}
                          formatter={(v: number) =>
                            v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full grid place-items-center text-sm text-muted-foreground">
                      Sem receita neste mês
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-bold mb-3">Planos ativos por cliente</p>
                <div className="h-64">
                  {derived.plansBar.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={derived.plansBar} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={90}
                          stroke="var(--muted-foreground)"
                          fontSize={12}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                          }}
                        />
                        <Bar dataKey="ativos" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full grid place-items-center text-sm text-muted-foreground">
                      Nenhum plano ativado
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alerts / logs */}
          <Card className="mt-4">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-bold">Alertas & erros recentes</p>
                <Badge variant="outline" className="ml-auto">
                  {logs.length}
                </Badge>
              </div>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum alerta nas últimas execuções — plataforma saudável.
                </p>
              ) : (
                <div className="divide-y divide-border/50">
                  {logs.map((l) => (
                    <div key={l.id} className="py-2 flex items-start gap-3 text-sm">
                      <Badge
                        variant={l.level === "error" ? "destructive" : "outline"}
                        className="mt-0.5 uppercase text-[10px]"
                      >
                        {l.level}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{l.message}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {l.source ?? "—"} · {new Date(l.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
