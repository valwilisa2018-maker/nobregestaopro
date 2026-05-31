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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/auth";
import {
  DollarSign, TrendingUp, Calendar, Trophy, AlertCircle,
  Package, FileText, FileCheck2, ListTodo, Truck, ShoppingCart, Users, Factory, Filter, X,
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
  const [scope, setScope] = useState<"day" | "week" | "month">("day");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  // Drill-down: clique em ranking abre lista detalhada
  const [drill, setDrill] = useState<
    | { kind: "seller" | "producer"; id: string; label: string }
    | { kind: "product"; name: string; label: string }
    | null
  >(null);
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
  const customers = useQuery({
    queryKey: ["dash-customers"],
    queryFn: async () => (await supabase.from("customers").select("id,name")).data ?? [],
  });

  const allRaw = sales.data ?? [];

  // Aplica filtros de vendedor + tipo de serviço a TODAS as métricas
  const all = useMemo(() => {
    return allRaw.filter((s) => {
      if (sellerFilter !== "all" && s.seller_id !== sellerFilter) return false;
      if (serviceFilter !== "all" && s.service_type_id !== serviceFilter) return false;
      return true;
    });
  }, [allRaw, sellerFilter, serviceFilter]);

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

  // Escopo principal — dia / semana / mês
  const scopeMap = {
    day: { total: dayTotal, count: dayCount, goal: goalFor("daily"), label: "Hoje", icon: DollarSign, since: startOf("day") },
    week: { total: weekTotal, count: weekCount, goal: goalFor("weekly"), label: "Semana", icon: Calendar, since: startOf("week") },
    month: { total: monthTotal, count: monthCount, goal: goalFor("monthly"), label: "Mês", icon: TrendingUp, since: startOf("month") },
  } as const;
  const current = scopeMap[scope];
  const scopeSince = current.since;
  const dayGoal = goalFor("daily");
  const dayPct = dayGoal ? Math.min(100, Math.round((dayTotal / dayGoal) * 100)) : 0;
  const scopePct = current.goal ? Math.min(100, Math.round((current.total / current.goal) * 100)) : 0;

  const counts = {
    pago_total: all.filter((s) => s.payment_status === "pago_total" && s.created_at >= scopeSince).length,
    pago_parcial: all.filter((s) => s.payment_status === "pago_parcial" && s.created_at >= scopeSince).length,
    pendente: all.filter((s) => s.payment_status === "pendente" && s.created_at >= scopeSince).length,
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

  // Vendas sem nota / com nota (no escopo selecionado)
  const scopeSaleIds = new Set(
    all.filter((s) => s.created_at >= scopeSince).map((s) => s.id),
  );
  const salesWithInvoice = new Set(invList.filter((i) => i.sale_id && scopeSaleIds.has(i.sale_id)).map((i) => i.sale_id));
  const scopeSalesWithInvoice = salesWithInvoice.size;
  const scopeSalesWithoutInvoice = scopeSaleIds.size - scopeSalesWithInvoice;

  // Ranking vendedores (no escopo)
  const sellerRanking = (sellers.data ?? []).map((s) => {
    const list = all.filter((x) => x.seller_id === s.id && x.created_at >= scopeSince);
    return {
      id: s.id,
      name: s.name,
      total: list.reduce((a, x) => a + Number(x.total_amount), 0),
      qtd: list.length,
    };
  }).filter((s) => s.qtd > 0).sort((a, b) => b.total - a.total).slice(0, 5);

  // Ranking produtores (no escopo)
  const producerRanking = (producers.data ?? []).map((p: any) => {
    const list = all.filter((x) => x.producer_id === p.id && x.created_at >= scopeSince);
    return {
      id: p.id,
      name: p.name,
      total: list.reduce((a, x) => a + Number(x.total_amount), 0),
      qtd: list.length,
    };
  }).filter((p) => p.qtd > 0).sort((a, b) => b.total - a.total).slice(0, 5);

  // Produtos / serviços mais vendidos (no escopo) — combina service_types + packages
  const productRanking = useMemo(() => {
    const map = new Map<string, { name: string; total: number; qtd: number }>();
    const stById = new Map((serviceTypes.data ?? []).map((s: any) => [s.id, s.name]));
    const pkById = new Map((packages.data ?? []).map((p: any) => [p.id, p.name]));
    for (const s of all) {
      if (s.created_at < scopeSince) continue;
      const name = s.package_id
        ? (pkById.get(s.package_id) ?? "Pacote")
        : (stById.get(s.service_type_id ?? "") ?? "Outro");
      const cur = map.get(name) ?? { name, total: 0, qtd: 0 };
      cur.total += Number(s.total_amount);
      cur.qtd += 1;
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [all, serviceTypes.data, packages.data, scopeSince]);

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
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral de vendas, produção e faturamento — atualizado em tempo real</p>
      </div>

      {/* Filtros */}
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mr-2">
            <Filter className="w-4 h-4 text-primary" />
            Filtros
          </div>

          <ToggleGroup
            type="single"
            value={scope}
            onValueChange={(v) => v && setScope(v as typeof scope)}
            size="sm"
          >
            <ToggleGroupItem value="day">Dia</ToggleGroupItem>
            <ToggleGroupItem value="week">Semana</ToggleGroupItem>
            <ToggleGroupItem value="month">Mês</ToggleGroupItem>
          </ToggleGroup>

          <Select value={sellerFilter} onValueChange={setSellerFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {(sellers.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Tipo de serviço" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os serviços</SelectItem>
              {(serviceTypes.data ?? []).map((st: any) => (
                <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(sellerFilter !== "all" || serviceFilter !== "all" || scope !== "day") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setSellerFilter("all"); setServiceFilter("all"); setScope("day"); }}
              className="gap-1"
            >
              <X className="w-4 h-4" />
              Limpar
            </Button>
          )}

          <div className="ml-auto text-xs text-muted-foreground">
            Exibindo <span className="font-semibold text-foreground">{all.length}</span> de {allRaw.length} vendas
          </div>
        </CardContent>
      </Card>

      {/* Hero — Hoje */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2 relative overflow-hidden border-success/30 bg-gradient-to-br from-success/15 via-card to-card"
          style={{ boxShadow: "0 10px 40px -10px oklch(0.65 0.18 145 / 0.35)" }}
        >
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-success/25 blur-3xl pointer-events-none" />
          <CardContent className="relative p-6 sm:p-8">
            <div className="flex items-center gap-2 text-success">
              <current.icon className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wider">Vendas — {current.label}</span>
            </div>
            <div className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground">
              {formatCurrency(current.total)}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {current.count} {current.count === 1 ? "venda" : "vendas"} no período
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Meta {formatCurrency(current.goal)}</span>
              <span className="font-semibold text-foreground">{scopePct}%</span>
            </div>
            <Progress value={scopePct} className="h-2 mt-2 [&>div]:bg-success" />
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo do ano</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Trophy className="w-4 h-4" />
              <span>Ano</span>
            </div>
            <div className="text-3xl font-bold mt-1">{formatCurrency(yearTotal)}</div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Meta {formatCurrency(goalFor("yearly"))}</span>
              <span className="font-semibold text-foreground">{goalFor("yearly") ? Math.min(100, Math.round((yearTotal / goalFor("yearly")) * 100)) : 0}%</span>
            </div>
            <Progress value={goalFor("yearly") ? Math.min(100, (yearTotal / goalFor("yearly")) * 100) : 0} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* KPIs principais */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard tone="success" accent label="Hoje" value={formatCurrency(dayTotal)} icon={DollarSign} hint={`${dayCount} vendas`} />
        <StatCard tone="info" label="Semana" value={formatCurrency(weekTotal)} icon={Calendar} hint={`${weekCount} vendas`} />
        <StatCard tone="violet" label="Mês" value={formatCurrency(monthTotal)} icon={TrendingUp} hint={`${monthCount} vendas`} />
        <StatCard tone="amber" label="Ticket médio" value={formatCurrency(ticketMedio)} icon={ShoppingCart} hint="no mês" />
        <StatCard tone="warning" label="Ano" value={formatCurrency(yearTotal)} icon={Trophy} />
      </div>

      {/* Produção */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard tone="warning" label="Serviços a fazer" value={String(ordersTodo)} icon={ListTodo} />
        <StatCard tone="info" label="Em produção" value={String(ordersInProd)} icon={Package} />
        <StatCard tone="success" label="Entregues" value={String(ordersDelivered)} icon={Truck} />
        <StatCard tone="violet" label="Notas emitidas" value={`${invIssued} / ${invList.length}`} icon={FileCheck2} hint={`${invPending} aguardando`} />
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
              <CardTitle className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" />Top Vendedores ({current.label})</CardTitle>
              <Badge variant="outline">{sellerRanking.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {sellerRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem vendas no período para os filtros atuais.</p>}
            {sellerRanking.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setDrill({ kind: "seller", id: s.id, label: s.name })}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 hover:ring-1 hover:ring-primary/40 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${i === 0 ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>{i + 1}</div>
                  <div>
                    <div className="font-medium leading-tight">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.qtd} vendas</div>
                  </div>
                </div>
                <span className="font-semibold">{formatCurrency(s.total)}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Factory className="w-4 h-4 text-primary" />Top Produtores ({current.label})</CardTitle>
              <Badge variant="outline">{producerRanking.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {producerRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem produtores com vendas no período.</p>}
            {producerRanking.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDrill({ kind: "producer", id: p.id, label: p.name })}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 hover:ring-1 hover:ring-primary/40 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${i === 0 ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"}`}>{i + 1}</div>
                  <div>
                    <div className="font-medium leading-tight">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">{p.qtd} vendas</div>
                  </div>
                </div>
                <span className="font-semibold">{formatCurrency(p.total)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Produtos / serviços mais vendidos (mês) */}
      <Card className="border-border/50 hover:border-primary/40 transition" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Package className="w-4 h-4 text-primary" />Produtos / serviços mais vendidos ({current.label})</CardTitle>
            <Badge variant="outline">{productRanking.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {productRanking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem vendas registradas no período.</p>
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={productRanking}
                    layout="vertical"
                    margin={{ left: 12, right: 16, top: 8, bottom: 0 }}
                    onClick={(e: any) => {
                      const name = e?.activePayload?.[0]?.payload?.name;
                      if (name) setDrill({ kind: "product", name, label: name });
                    }}
                  >
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
                    <Bar dataKey="total" fill="url(#prodBar)" radius={[0, 6, 6, 0]} className="cursor-pointer" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {productRanking.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => setDrill({ kind: "product", name: p.name, label: p.name })}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/40 hover:bg-muted/70 hover:ring-1 hover:ring-primary/40 transition text-left cursor-pointer text-sm"
                  >
                    <span className="font-medium truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.qtd} • {formatCurrency(p.total)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Notas fiscais — mês */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-success" />Com nota ({current.label})</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-success">{scopeSalesWithInvoice}</div>
            <div className="text-xs text-muted-foreground mt-1">vendas no período já com nota emitida ou registrada</div>
          </CardContent>
        </Card>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4 text-warning" />Sem nota ({current.label})</CardTitle></CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-warning">{scopeSalesWithoutInvoice}</div>
            <div className="text-xs text-muted-foreground mt-1">vendas no período ainda sem nota</div>
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

      {/* Drill-down dialog */}
      <DrillDialog
        drill={drill}
        onClose={() => setDrill(null)}
        sales={all}
        scopeSince={scopeSince}
        scopeLabel={current.label}
        customers={customers.data ?? []}
        sellers={sellers.data ?? []}
        producers={(producers.data ?? []) as any}
        serviceTypes={(serviceTypes.data ?? []) as any}
        packages={(packages.data ?? []) as any}
      />
    </div>
  );
}

function DrillDialog({
  drill, onClose, sales, scopeSince, scopeLabel, customers, sellers, producers, serviceTypes, packages,
}: {
  drill: { kind: "seller" | "producer"; id: string; label: string } | { kind: "product"; name: string; label: string } | null;
  onClose: () => void;
  sales: any[];
  scopeSince: string;
  scopeLabel: string;
  customers: { id: string; name: string }[];
  sellers: { id: string; name: string }[];
  producers: { id: string; name: string }[];
  serviceTypes: { id: string; name: string }[];
  packages: { id: string; name: string }[];
}) {
  const open = !!drill;
  const cName = new Map(customers.map((c) => [c.id, c.name]));
  const sName = new Map(sellers.map((s) => [s.id, s.name]));
  const pName = new Map(producers.map((p) => [p.id, p.name]));
  const stName = new Map(serviceTypes.map((s) => [s.id, s.name]));
  const pkName = new Map(packages.map((p) => [p.id, p.name]));

  const rows = (() => {
    if (!drill) return [] as any[];
    return sales
      .filter((s) => s.created_at >= scopeSince)
      .filter((s) => {
        if (drill.kind === "seller") return s.seller_id === drill.id;
        if (drill.kind === "producer") return s.producer_id === drill.id;
        const name = s.package_id ? (pkName.get(s.package_id) ?? "Pacote") : (stName.get(s.service_type_id ?? "") ?? "Outro");
        return name === (drill as { name: string }).name;
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  })();

  const total = rows.reduce((a, r) => a + Number(r.total_amount), 0);
  const paid = rows.reduce((a, r) => a + Number(r.paid_amount ?? 0), 0);

  const kindLabel = drill?.kind === "seller" ? "Vendedor" : drill?.kind === "producer" ? "Produtor" : "Produto / serviço";

  const statusBadge = (st: string | null) => {
    if (st === "pago_total") return <Badge className="bg-success/15 text-success border-success/30">Pago</Badge>;
    if (st === "pago_parcial") return <Badge className="bg-warning/15 text-warning border-warning/30">Parcial</Badge>;
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30">Pendente</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kindLabel}: <span className="text-primary">{drill?.label}</span>
          </DialogTitle>
          <DialogDescription>
            Vendas no período: <span className="font-semibold text-foreground">{scopeLabel}</span> — {rows.length} {rows.length === 1 ? "venda" : "vendas"} • Total {formatCurrency(total)} • Recebido {formatCurrency(paid)}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Nenhuma venda encontrada no período.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2 font-medium">Data</th>
                  <th className="p-2 font-medium">Cliente</th>
                  <th className="p-2 font-medium">Serviço</th>
                  {drill?.kind !== "seller" && <th className="p-2 font-medium">Vendedor</th>}
                  {drill?.kind !== "producer" && <th className="p-2 font-medium">Produtor</th>}
                  <th className="p-2 font-medium text-right">Valor</th>
                  <th className="p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const svc = r.package_id ? (pkName.get(r.package_id) ?? "Pacote") : (stName.get(r.service_type_id ?? "") ?? "—");
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                      <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="p-2">{cName.get(r.customer_id) ?? "—"}</td>
                      <td className="p-2">{svc}</td>
                      {drill?.kind !== "seller" && <td className="p-2">{r.seller_id ? (sName.get(r.seller_id) ?? "—") : "—"}</td>}
                      {drill?.kind !== "producer" && <td className="p-2">{r.producer_id ? (pName.get(r.producer_id) ?? "—") : "—"}</td>}
                      <td className="p-2 text-right font-semibold">{formatCurrency(Number(r.total_amount))}</td>
                      <td className="p-2">{statusBadge(r.payment_status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}