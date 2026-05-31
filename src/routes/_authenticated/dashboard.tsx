import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/auth";
import {
  DollarSign, TrendingUp, Calendar, Trophy, AlertCircle,
  Package, FileText, FileCheck2, ListTodo, Truck, ShoppingCart, Users, Factory, Sparkles, Filter, X,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function startOf(period: "day" | "week" | "month" | "year") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "week") { const day = d.getDay(); d.setDate(d.getDate() - day); }
  if (period === "month") d.setDate(1);
  if (period === "year") { d.setMonth(0); d.setDate(1); }
  return d.toISOString();
}

function Dashboard() {
  // Filtros principais
  const [scope, setScope] = useState<"day" | "week" | "month">("month");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const qc = useQueryClient();

  // Tick a cada 60s — vira o dia/semana/mês automaticamente
  const [, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Realtime — recarrega quando vendas / serviços / notas mudam
  useEffect(() => {
    const ch = supabase
      .channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        qc.invalidateQueries({ queryKey: ["dash-sales"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () => {
        qc.invalidateQueries({ queryKey: ["dash-orders"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        qc.invalidateQueries({ queryKey: ["dash-invoices"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const sales = useQuery({
    queryKey: ["dash-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,total_amount,paid_amount,payment_status,created_at,seller_id,producer_id,customer_id,service_type_id,package_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const goals = useQuery({
    queryKey: ["dash-goals"],
    queryFn: async () => {
      const { data } = await supabase.from("goals").select("*").is("seller_id", null);
      return data ?? [];
    },
  });

  const orders = useQuery({
    queryKey: ["dash-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_orders")
        .select("id,column_id,delivered_at,sale_id,kanban_columns(name,is_done,sort_order)");
      return data ?? [];
    },
  });

  const sellers = useQuery({
    queryKey: ["dash-sellers"],
    queryFn: async () => (await supabase.from("sellers").select("id,name")).data ?? [],
  });
  const producers = useQuery({
    queryKey: ["dash-producers"],
    queryFn: async () => (await supabase.from("producers").select("id,name,quality_score,average_delivery_days")).data ?? [],
  });
  const invoices = useQuery({
    queryKey: ["dash-invoices"],
    queryFn: async () => (await supabase.from("invoices").select("id,status,sale_id,amount,issued_at,created_at")).data ?? [],
  });
  const serviceTypes = useQuery({
    queryKey: ["dash-service-types"],
    queryFn: async () => (await supabase.from("service_types").select("id,name")).data ?? [],
  });
  const packages = useQuery({
    queryKey: ["dash-packages"],
    queryFn: async () => (await supabase.from("packages").select("id,name")).data ?? [],
  });

  const all = sales.data ?? [];
  const sumIn = (since: string) =>
    all.filter((s) => s.created_at >= since).reduce((a, s) => a + Number(s.total_amount), 0);

  const dayTotal = sumIn(startOf("day"));
  const weekTotal = sumIn(startOf("week"));
  const monthTotal = sumIn(startOf("month"));
  const yearTotal = sumIn(startOf("year"));

  const dayCount = all.filter((s) => s.created_at >= startOf("day")).length;
  const weekCount = all.filter((s) => s.created_at >= startOf("week")).length;
  const monthCount = all.filter((s) => s.created_at >= startOf("month")).length;
  const ticketMedio = monthCount ? monthTotal / monthCount : 0;

  const goalFor = (p: string) =>
    Number((goals.data ?? []).find((g) => g.period === p)?.target_amount ?? 0);

  const periodMap = {
    week: { total: weekTotal, goal: goalFor("weekly"), label: "Semana", icon: Calendar },
    month: { total: monthTotal, goal: goalFor("monthly"), label: "Mês", icon: TrendingUp },
    year: { total: yearTotal, goal: goalFor("yearly"), label: "Ano", icon: Trophy },
  } as const;
  const current = periodMap[period];
  const dayGoal = goalFor("daily");
  const dayPct = dayGoal ? Math.min(100, Math.round((dayTotal / dayGoal) * 100)) : 0;
  const periodPct = current.goal ? Math.min(100, Math.round((current.total / current.goal) * 100)) : 0;

  const counts = {
    pago_total: all.filter((s) => s.payment_status === "pago_total").length,
    pago_parcial: all.filter((s) => s.payment_status === "pago_parcial").length,
    pendente: all.filter((s) => s.payment_status === "pendente").length,
  };

  // Service Orders por etapa
  const ordersList = (orders.data ?? []) as any[];
  const ordersTodo = ordersList.filter((o) => (o.kanban_columns?.sort_order ?? 0) === 0 && !o.kanban_columns?.is_done).length;
  const ordersInProd = ordersList.filter((o) => !o.kanban_columns?.is_done).length;
  const ordersDelivered = ordersList.filter((o) => !!o.delivered_at || o.kanban_columns?.is_done).length;

  // Invoices: emitidas vs aguardando
  const invList = (invoices.data ?? []) as any[];
  const invIssued = invList.filter((i) => i.status === "emitida" || !!i.issued_at).length;
  const invPending = invList.length - invIssued;

  // Vendas sem nota / com nota (no mês)
  const monthSaleIds = new Set(
    all.filter((s) => s.created_at >= startOf("month")).map((s) => s.id),
  );
  const salesWithInvoice = new Set(invList.filter((i) => i.sale_id && monthSaleIds.has(i.sale_id)).map((i) => i.sale_id));
  const monthSalesWithInvoice = salesWithInvoice.size;
  const monthSalesWithoutInvoice = monthSaleIds.size - monthSalesWithInvoice;

  // Ranking vendedores (no mês)
  const monthSince = startOf("month");
  const sellerRanking = (sellers.data ?? []).map((s) => {
    const list = all.filter((x) => x.seller_id === s.id && x.created_at >= monthSince);
    return {
      name: s.name,
      total: list.reduce((a, x) => a + Number(x.total_amount), 0),
      qtd: list.length,
    };
  }).sort((a, b) => b.total - a.total).slice(0, 5);

  // Ranking produtores (no mês) por valor das vendas
  const producerRanking = (producers.data ?? []).map((p: any) => {
    const list = all.filter((x) => x.producer_id === p.id && x.created_at >= monthSince);
    return {
      name: p.name,
      total: list.reduce((a, x) => a + Number(x.total_amount), 0),
      qtd: list.length,
    };
  }).sort((a, b) => b.total - a.total).slice(0, 5);

  // Produtos / serviços mais vendidos (no mês) — combina service_types + packages
  const productRanking = useMemo(() => {
    const map = new Map<string, { name: string; total: number; qtd: number }>();
    const stById = new Map((serviceTypes.data ?? []).map((s: any) => [s.id, s.name]));
    const pkById = new Map((packages.data ?? []).map((p: any) => [p.id, p.name]));
    for (const s of all) {
      if (s.created_at < monthSince) continue;
      const name = s.package_id
        ? (pkById.get(s.package_id) ?? "Pacote")
        : (stById.get(s.service_type_id ?? "") ?? "Outro");
      const cur = map.get(name) ?? { name, total: 0, qtd: 0 };
      cur.total += Number(s.total_amount);
      cur.qtd += 1;
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [all, serviceTypes.data, packages.data, monthSince]);

  const monthChart = Array.from({ length: 12 }, (_, i) => {
    const m = new Date().getMonth();
    const month = (m - 11 + i + 12) % 12;
    const year = new Date().getFullYear() - (m - 11 + i < 0 ? 1 : 0);
    const total = all
      .filter((s) => {
        const d = new Date(s.created_at);
        return d.getMonth() === month && d.getFullYear() === year;
      })
      .reduce((a, s) => a + Number(s.total_amount), 0);
    return { mes: ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][month], total };
  });

  // Últimos 30 dias (Area)
  const last30 = useMemo(() => {
    const days: { dia: string; total: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const total = all
        .filter((s) => new Date(s.created_at) >= d && new Date(s.created_at) < next)
        .reduce((a, s) => a + Number(s.total_amount), 0);
      days.push({ dia: `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`, total });
    }
    return days;
  }, [all]);

  // Pagamento — Pie
  const paymentPie = [
    { name: "Pago total", value: counts.pago_total, color: "var(--success)" },
    { name: "Pago parcial", value: counts.pago_parcial, color: "var(--warning)" },
    { name: "Pendente", value: counts.pendente, color: "var(--destructive)" },
  ];

  const chartTheme = {
    grid: "color-mix(in oklab, var(--foreground) 12%, transparent)",
    axis: "color-mix(in oklab, var(--foreground) 55%, transparent)",
    tooltipBg: "var(--popover)",
    tooltipBorder: "var(--border)",
    primary: "var(--primary)",
    primaryGlow: "var(--primary-glow)",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Dashboard
        </h1>
        <p className="text-muted-foreground">Visão geral de vendas, produção e faturamento — atualizado em tempo real</p>
      </div>

      {/* Hero — Hoje */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2 relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card"
          style={{ boxShadow: "var(--shadow-premium)" }}
        >
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <CardContent className="relative p-6 sm:p-8">
            <div className="flex items-center gap-2 text-primary">
              <DollarSign className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">Vendas hoje</span>
            </div>
            <div className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground">
              {formatCurrency(dayTotal)}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {dayCount} {dayCount === 1 ? "venda" : "vendas"} hoje
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Meta {formatCurrency(dayGoal)}</span>
              <span className="font-semibold text-foreground">{dayPct}%</span>
            </div>
            <Progress value={dayPct} className="h-2 mt-2" />
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Período</CardTitle>
              <ToggleGroup
                type="single"
                value={period}
                onValueChange={(v) => v && setPeriod(v as typeof period)}
                size="sm"
              >
                <ToggleGroupItem value="week">Semana</ToggleGroupItem>
                <ToggleGroupItem value="month">Mês</ToggleGroupItem>
                <ToggleGroupItem value="year">Ano</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <current.icon className="w-4 h-4" />
              <span>{current.label}</span>
            </div>
            <div className="text-3xl font-bold mt-1">{formatCurrency(current.total)}</div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Meta {formatCurrency(current.goal)}</span>
              <span className="font-semibold text-foreground">{periodPct}%</span>
            </div>
            <Progress value={periodPct} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* KPIs principais */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard label="Hoje" value={formatCurrency(dayTotal)} icon={DollarSign} accent hint={`${dayCount} vendas`} />
        <StatCard label="Semana" value={formatCurrency(weekTotal)} icon={Calendar} hint={`${weekCount} vendas`} />
        <StatCard label="Mês" value={formatCurrency(monthTotal)} icon={TrendingUp} hint={`${monthCount} vendas`} />
        <StatCard label="Ticket médio" value={formatCurrency(ticketMedio)} icon={ShoppingCart} hint="no mês" />
        <StatCard label="Ano" value={formatCurrency(yearTotal)} icon={Trophy} />
      </div>

      {/* Produção */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Serviços a fazer" value={String(ordersTodo)} icon={ListTodo} />
        <StatCard label="Em produção" value={String(ordersInProd)} icon={Package} />
        <StatCard label="Entregues" value={String(ordersDelivered)} icon={Truck} />
        <StatCard label="Notas emitidas" value={`${invIssued} / ${invList.length}`} icon={FileCheck2} hint={`${invPending} aguardando`} />
      </div>

      {/* Charts: 30 dias + Pagamento */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle>Vendas — últimos 30 dias</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last30} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                <XAxis dataKey="dia" stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
                <YAxis stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, color: "var(--popover-foreground)" }}
                  formatter={(v: any) => formatCurrency(Number(v))}
                />
                <Area type="monotone" dataKey="total" stroke={chartTheme.primary} fill="url(#areaFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle>Status de pagamento</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {paymentPie.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, color: "var(--popover-foreground)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Vendas por mês + Metas */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle>Vendas por mês</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthChart} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.primaryGlow} stopOpacity={1} />
                    <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                <XAxis dataKey="mes" stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
                <YAxis stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, color: "var(--popover-foreground)" }}
                  formatter={(v: any) => formatCurrency(Number(v))}
                />
                <Bar dataKey="total" fill="url(#barFill)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle>Metas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Diária", v: dayTotal, g: goalFor("daily") },
              { label: "Semanal", v: weekTotal, g: goalFor("weekly") },
              { label: "Mensal", v: monthTotal, g: goalFor("monthly") },
              { label: "Anual", v: yearTotal, g: goalFor("yearly") },
            ].map((m) => (
              <div key={m.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-medium">{m.g ? Math.min(100, Math.round((m.v / m.g) * 100)) : 0}%</span>
                </div>
                <Progress value={m.g ? Math.min(100, (m.v / m.g) * 100) : 0} className="h-2" />
                <div className="text-[11px] text-muted-foreground mt-1">{formatCurrency(m.v)} {m.g ? `/ ${formatCurrency(m.g)}` : ""}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" />Top Vendedores (mês)</CardTitle>
              <Badge variant="outline">{sellerRanking.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {sellerRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem vendedores cadastrados ainda.</p>}
            {sellerRanking.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${i === 0 ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>{i + 1}</div>
                  <div>
                    <div className="font-medium leading-tight">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.qtd} vendas</div>
                  </div>
                </div>
                <span className="font-semibold">{formatCurrency(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Factory className="w-4 h-4 text-primary" />Top Produtores (mês)</CardTitle>
              <Badge variant="outline">{producerRanking.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {producerRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem produtores com vendas no mês.</p>}
            {producerRanking.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${i === 0 ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>{i + 1}</div>
                  <div>
                    <div className="font-medium leading-tight">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.qtd} vendas</div>
                  </div>
                </div>
                <span className="font-semibold">{formatCurrency(p.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Produtos / serviços mais vendidos (mês) */}
      <Card className="border-border/50 hover:border-primary/40 transition" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Package className="w-4 h-4 text-primary" />Produtos / serviços mais vendidos (mês)</CardTitle>
            <Badge variant="outline">{productRanking.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="h-80">
          {productRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem vendas registradas no mês.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productRanking} layout="vertical" margin={{ left: 12, right: 16, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="prodBar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={chartTheme.primaryGlow} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                <XAxis type="number" stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" stroke={chartTheme.axis} tick={{ fontSize: 11 }} width={140} />
                <Tooltip
                  contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 8, color: "var(--popover-foreground)" }}
                  formatter={(v: any, _n, p: any) => [`${formatCurrency(Number(v))} • ${p?.payload?.qtd ?? 0} vendas`, "Total"]}
                />
                <Bar dataKey="total" fill="url(#prodBar)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Notas fiscais — mês */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-success" />Com nota (mês)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-success">{monthSalesWithInvoice}</div>
            <div className="text-xs text-muted-foreground mt-1">vendas do mês já com nota emitida ou registrada</div>
          </CardContent>
        </Card>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4 text-warning" />Sem nota (mês)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-warning">{monthSalesWithoutInvoice}</div>
            <div className="text-xs text-muted-foreground mt-1">vendas do mês ainda sem nota</div>
          </CardContent>
        </Card>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-destructive" />Pagamentos pendentes</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-destructive">{counts.pendente}</div>
            <div className="text-xs text-muted-foreground mt-1">vendas com status pendente</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}