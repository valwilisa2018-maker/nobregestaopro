import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/stat-card";
import { TopVendorBadge } from "@/components/top-vendor-badge";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/auth";
import { toast } from "sonner";
import {
  DollarSign, TrendingUp, Calendar, Trophy, AlertCircle,
  Package, FileText, FileCheck2, ListTodo, Truck, ShoppingCart, Users, Factory, Filter, X, Sparkles,
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
  const navigate = useNavigate();
  // Filtros principais
  const [scope, setScope] = useState<"day" | "week" | "month" | "year" | "custom">("day");
  const todayStr = new Date().toISOString().slice(0, 10);
  const [customFrom, setCustomFrom] = useState<string>(todayStr);
  const [customTo, setCustomTo] = useState<string>(todayStr);
  const { user } = useAuth();
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
    // Throttle invalidations to avoid flooding queries on bursts of changes
    let pendingKeys = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (key: string) => {
      pendingKeys.add(key);
      if (timer) return;
      timer = setTimeout(() => {
        pendingKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        pendingKeys.clear();
        timer = null;
      }, 5000);
    };
    const ch = supabase
      .channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => schedule("dash-sales"))
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () => schedule("dash-orders"))
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => schedule("dash-invoices"))
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [qc]);

  const sales = useQuery({
    queryKey: ["dash-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,total_amount,paid_amount,payment_status,created_at,sale_date,seller_id,producer_id,customer_id,service_type_id,package_id,service_quantity,is_payment_link");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const goals = useQuery({
    queryKey: ["dash-goals"],
    queryFn: async () => {
      const { data } = await supabase.from("goals").select("*").is("seller_id", null);
      return data ?? [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const orders = useQuery({
    queryKey: ["dash-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id,column_id,delivered_at,sale_id,producer_id,created_at,kanban_columns(name,is_done,sort_order)");
      if (error) { toast.error("Erro ao carregar pedidos"); throw error; }
      return data ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const sellers = useQuery({
    queryKey: ["dash-sellers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sellers").select("id,name");
      if (error) { toast.error("Erro ao carregar vendedores"); throw error; }
      return data ?? [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
  const producers = useQuery({
    queryKey: ["dash-producers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("producers").select("id,name,quality_score,average_delivery_days");
      if (error) { toast.error("Erro ao carregar produtores"); throw error; }
      return data ?? [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
  const invoices = useQuery({
    queryKey: ["dash-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("id,status,sale_id,amount,issued_at,created_at");
      if (error) { toast.error("Erro ao carregar faturas"); throw error; }
      return data ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const serviceTypes = useQuery({
    queryKey: ["dash-service-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_types").select("id,name");
      if (error) { toast.error("Erro ao carregar serviços"); throw error; }
      return data ?? [];
    },
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });
  const packages = useQuery({
    queryKey: ["dash-packages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("id,name");
      if (error) { toast.error("Erro ao carregar pacotes"); throw error; }
      return data ?? [];
    },
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });
  const customers = useQuery({
    queryKey: ["dash-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name");
      if (error) { toast.error("Erro ao carregar clientes"); throw error; }
      return data ?? [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const allRaw = sales.data ?? [];

  // Aplica filtros de vendedor + tipo de serviço a TODAS as métricas
  const all = useMemo(() => {
    return allRaw.filter((s) => {
      if (s.is_payment_link) return false;
      if (sellerFilter !== "all" && s.seller_id !== sellerFilter) return false;
      if (serviceFilter !== "all" && s.service_type_id !== serviceFilter) return false;
      return true;
    });
  }, [allRaw, sellerFilter, serviceFilter]);

  const sumIn = (since: string) => {
    const sinceDate = since.slice(0, 10);
    return all.filter((s) => (s.sale_date || s.created_at.slice(0, 10)) >= sinceDate).reduce((a, s) => a + Number(s.total_amount), 0);
  };

  const dayTotal = sumIn(startOf("day"));
  const weekTotal = sumIn(startOf("week"));
  const monthTotal = sumIn(startOf("month"));
  const yearTotal = sumIn(startOf("year"));

  const dayCount = all.filter((s) => (s.sale_date || s.created_at.slice(0, 10)) >= startOf("day").slice(0, 10)).length;
  const weekCount = all.filter((s) => (s.sale_date || s.created_at.slice(0, 10)) >= startOf("week").slice(0, 10)).length;
  const monthCount = all.filter((s) => (s.sale_date || s.created_at.slice(0, 10)) >= startOf("month").slice(0, 10)).length;
  const ticketMedio = monthCount ? monthTotal / monthCount : 0;

  // Valores pendentes a receber (parcial + pendente)
  const pendingList = all.filter((s) => s.payment_status === "pago_parcial" || s.payment_status === "pendente");
  const pendingTotal = pendingList.reduce((a, s) => a + (Number(s.total_amount) - Number(s.paid_amount ?? 0)), 0);
  const pendingCount = pendingList.length;

  const goalFor = (p: string) =>
    Number((goals.data ?? []).find((g) => g.period === p)?.target_amount ?? 0);

  // Escopo principal — dia / semana / mês
  const scopeMap = {
    day: { total: dayTotal, count: dayCount, goal: goalFor("daily"), label: "Hoje", icon: DollarSign, since: startOf("day") },
    week: { total: weekTotal, count: weekCount, goal: goalFor("weekly"), label: "Semana", icon: Calendar, since: startOf("week") },
    month: { total: monthTotal, count: monthCount, goal: goalFor("monthly"), label: "Mês", icon: TrendingUp, since: startOf("month") },
    year: { total: yearTotal, count: all.filter((s) => (s.sale_date || s.created_at.slice(0, 10)) >= startOf("year").slice(0, 10)).length, goal: goalFor("yearly"), label: "Ano", icon: TrendingUp, since: startOf("year") },
  } as const;
  const scopeSince = scope === "custom" ? customFrom : scopeMap[scope].since.slice(0, 10);
  const scopeUntil = scope === "custom" ? customTo : "9999-12-31";
  const inScope = (d?: string | null) => !!d && d.slice(0, 10) >= scopeSince && d.slice(0, 10) <= scopeUntil;
  const customList = scope === "custom"
    ? all.filter((s) => { const d = s.sale_date || s.created_at.slice(0, 10); return d >= scopeSince && d <= scopeUntil; })
    : [];
  const current = scope === "custom"
    ? { total: customList.reduce((a, s) => a + Number(s.total_amount), 0), count: customList.length, goal: 0, label: `${customFrom} → ${customTo}`, icon: Calendar, since: customFrom + "T00:00:00.000Z" }
    : scopeMap[scope];
  const dayGoal = goalFor("daily");
  const dayPct = dayGoal ? Math.min(100, Math.round((dayTotal / dayGoal) * 100)) : 0;
  const scopePct = current.goal ? Math.min(100, Math.round((current.total / current.goal) * 100)) : 0;

  const counts = {
    pago_total: all.filter((s) => s.payment_status === "pago_total" && inScope(s.sale_date || s.created_at)).length,
    pago_parcial: all.filter((s) => s.payment_status === "pago_parcial" && inScope(s.sale_date || s.created_at)).length,
    pendente: all.filter((s) => s.payment_status === "pendente" && inScope(s.sale_date || s.created_at)).length,
  };

  // Service Orders por etapa
  const ordersList = (orders.data ?? []) as any[];
  const ordersTodo = ordersList.filter((o) => {
    const colOrder = o.kanban_columns?.sort_order ?? 999;
    // Pega a menor ordem de coluna disponível nos dados
    const allOrders = ordersList.map(x => x.kanban_columns?.sort_order).filter(Boolean) as number[];
    const minOrder = allOrders.length > 0 ? Math.min(...allOrders) : 0;
    return colOrder === minOrder && !o.kanban_columns?.is_done;
  }).length;
  const ordersInProd = ordersList.filter((o) => !o.kanban_columns?.is_done).length;
  const ordersDelivered = ordersList.filter((o) => !!o.delivered_at || o.kanban_columns?.is_done).length;

  const totalRecordingStats = useMemo(() => {
    const influencers = all.filter(sale => {
      const st = (serviceTypes.data ?? []).find(x => x.id === sale.service_type_id);
      if (!st) return false;
      const name = st.name.toLowerCase();
      return name.includes("pamela") || name.includes("ester") || name.includes("influencer");
    });

    const total = influencers.reduce((acc, s) => acc + Number(s.service_quantity || 1), 0);
    
    // Contar quantos desses serviços (service_orders) já foram entregues
    const saleIds = new Set(influencers.map(s => s.id));
    const influencerOrders = ordersList.filter(o => saleIds.has(o.sale_id));
    const delivered = influencerOrders.filter(o => !!o.delivered_at || o.kanban_columns?.is_done).length;

    return { total, delivered };
  }, [all, serviceTypes.data, ordersList]);

  // Invoices: emitidas vs aguardando
  const invList = (invoices.data ?? []) as any[];
  const invIssued = invList.filter((i) => i.status === "emitida" || !!i.issued_at).length;
  const invPending = invList.length - invIssued;

  // Vendas sem nota / com nota (no escopo selecionado)
  const scopeSaleIds = new Set(
    all.filter((s) => inScope(s.sale_date || s.created_at)).map((s) => s.id),
  );
  const salesWithInvoice = new Set(invList.filter((i) => i.sale_id && scopeSaleIds.has(i.sale_id)).map((i) => i.sale_id));
  const scopeSalesWithInvoice = salesWithInvoice.size;
  const scopeSalesWithoutInvoice = scopeSaleIds.size - scopeSalesWithInvoice;

  // Ranking vendedores (no escopo)
  const sellerRanking = (sellers.data ?? []).map((s) => {
    const list = all.filter((x) => x.seller_id === s.id && inScope(x.sale_date || x.created_at));
    return {
      id: s.id,
      name: s.name,
      total: list.reduce((a, x) => a + Number(x.total_amount), 0),
      qtd: list.length,
    };
  }).filter((s) => s.qtd > 0).sort((a, b) => b.total - a.total).slice(0, 5);

  // Ranking produtores (no escopo) — conta cada card que foi movido para
  // "serviço pronto" dentro do período, usando delivered_at (gravado uma
  // única vez na primeira vez que o card chega na coluna concluída).
  // Assim, mover o mesmo card de volta para pronto NÃO recontabiliza.
  const producerRanking = (producers.data ?? []).map((p: any) => {
    const entreguesList = ordersList.filter(
      (o) => o.producer_id === p.id && inScope(o.delivered_at)
    );
    const emProducaoList = ordersList.filter(
      (o) => o.producer_id === p.id && !o.delivered_at && !o.kanban_columns?.is_done
    );
    const entregues = entreguesList.length;
    const emProducao = emProducaoList.length;
    return {
      id: p.id,
      name: p.name,
      entregues,
      emProducao,
      qtd: entregues + emProducao,
    };
  }).filter((p) => p.entregues > 0 || p.emProducao > 0)
    .sort((a, b) => b.entregues - a.entregues || b.qtd - a.qtd).slice(0, 5);

  // Produtos / serviços mais vendidos (no escopo) — combina service_types + packages
  const productRanking = useMemo(() => {
    const map = new Map<string, { name: string; total: number; qtd: number }>();
    const stById = new Map((serviceTypes.data ?? []).map((s: any) => [s.id, s.name]));
    const pkById = new Map((packages.data ?? []).map((p: any) => [p.id, p.name]));
    for (const s of all) {
      if (!inScope(s.sale_date || s.created_at)) continue;
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
        const d = new Date(s.sale_date || s.created_at);
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
        .filter((s) => new Date(s.sale_date || s.created_at) >= d && new Date(s.sale_date || s.created_at) < next)
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
            <ToggleGroupItem value="year">Ano</ToggleGroupItem>
            <ToggleGroupItem value="custom">Personalizado</ToggleGroupItem>
          </ToggleGroup>

          {scope === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
              <span className="text-sm text-muted-foreground">até</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
          )}

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

        <Card
          className="relative overflow-hidden border-info/30 bg-gradient-to-br from-info/15 via-card to-card"
          style={{ boxShadow: "0 10px 40px -10px oklch(0.62 0.18 240 / 0.35)" }}
        >
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-info/25 blur-3xl pointer-events-none" />
          <CardHeader className="pb-2 relative">
            <CardTitle className="text-base flex items-center gap-2 text-info">
              <Calendar className="w-4 h-4" />
              <span className="uppercase tracking-wider text-xs font-semibold">Meta da semana</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {formatCurrency(weekTotal)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {weekCount} {weekCount === 1 ? "venda" : "vendas"} na semana
            </div>
            {(() => {
              const weekGoal = goalFor("weekly");
              const pct = weekGoal ? Math.min(100, Math.round((weekTotal / weekGoal) * 100)) : 0;
              const missing = Math.max(0, weekGoal - weekTotal);
              return (
                <>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Meta {formatCurrency(weekGoal)}</span>
                    <span className="font-bold text-info">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2 mt-2 [&>div]:bg-info" />
                  <div className="mt-3 text-xs">
                    {weekGoal === 0 ? (
                      <span className="text-muted-foreground">Defina a meta semanal nas configurações</span>
                    ) : missing > 0 ? (
                      <span className="text-muted-foreground">
                        Faltam <span className="font-semibold text-foreground">{formatCurrency(missing)}</span> para bater a meta
                      </span>
                    ) : (
                      <span className="font-semibold text-success">🎯 Meta da semana batida!</span>
                    )}
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* KPIs principais */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard tone="info" label="Semana" value={formatCurrency(weekTotal)} icon={Calendar} hint={`${weekCount} vendas`} />
        <StatCard tone="violet" label="Mês" value={formatCurrency(monthTotal)} icon={TrendingUp} hint={`${monthCount} vendas`} />
        <StatCard tone="amber" label="Ticket médio" value={formatCurrency(ticketMedio)} icon={ShoppingCart} hint="no mês" />
        <StatCard tone="warning" label="Ano" value={formatCurrency(yearTotal)} icon={Trophy} />
        <StatCard tone="warning" label="Valores Pendentes" value={formatCurrency(pendingTotal)} icon={AlertCircle} hint={`${pendingCount} ${pendingCount === 1 ? "cliente" : "clientes"}`} />
      </div>

      {/* Produção */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => navigate({ to: "/kanban", search: { card: undefined } })}
          className="text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <StatCard tone="warning" label="Serviços a fazer" value={String(ordersTodo)} icon={ListTodo} />
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/kanban", search: { card: undefined } })}
          className="text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <StatCard tone="info" label="Em produção" value={String(ordersInProd)} icon={Package} />
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/kanban", search: { card: undefined } })}
          className="text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <StatCard tone="success" label="Entregues" value={String(ordersDelivered)} icon={Truck} />
        </button>
        <StatCard 
          tone="primary" 
          label="Gravação Influencer" 
          value={`${totalRecordingStats.delivered} / ${totalRecordingStats.total}`} 
          icon={Factory} 
          hint={`${totalRecordingStats.total - totalRecordingStats.delivered} aguardando`} 
        />
        <StatCard tone="violet" label="Notas emitidas" value={`${invIssued} / ${invList.length}`} icon={FileCheck2} hint={`${invPending} aguardando`} />
      </div>

      {/* Rankings — Top Vendedores / Top Produtores (logo abaixo dos cards de produção) */}
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
                  {i === 0 ? (
                    <TopVendorBadge rank={1} size="sm" />
                  ) : (
                    <div className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center bg-primary/20 text-primary">{i + 1}</div>
                  )}
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
            {producerRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem produção no período.</p>}
            {producerRanking.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDrill({ kind: "producer", id: p.id, label: p.name })}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 hover:ring-1 hover:ring-primary/40 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {i === 0 ? (
                    <TopVendorBadge rank={1} size="sm" />
                  ) : (
                    <div className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center bg-primary/20 text-primary">{i + 1}</div>
                  )}
                  <div>
                    <div className="font-medium leading-tight">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.emProducao > 0 ? `${p.emProducao} em produção` : "—"}
                    </div>
                  </div>
                </div>
                <span className="font-semibold">{p.entregues} vídeo{p.entregues === 1 ? "" : "s"}</span>
              </button>
            ))}
          </CardContent>
        </Card>
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