import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Coins,
  Loader2,
  Download,
  FileText,
  Brain,
  Clock,
  CheckCircle2,
  PieChart as PieIcon,
  Activity,
  Wallet,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  ComposedChart,
  Line,
} from "recharts";
import { toCSV, downloadCSV } from "@/lib/csv";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/master/financial")({
  head: () => ({ meta: [{ title: "Financeiro — Admin Master" }] }),
  component: Page,
});

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Order = {
  id: string;
  user_id: string;
  tokens: number;
  price_cents: number;
  status: string;
  created_at: string;
  paid_at: string | null;
};
type PlanReq = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  created_at: string;
  approved_at: string | null;
};
type Plan = { id: string; name: string; price_cents: number };
type UsageTx = {
  user_id: string;
  cost_cents: number | null;
  total_tokens: number | null;
  occurred_at: string;
  model: string | null;
};
type Profile = { id: string; full_name: string | null };

function Page() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [planReqs, setPlanReqs] = useState<PlanReq[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<UsageTx[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [detail, setDetail] = useState<null | {
    tipo: "Crédito" | "Plano";
    order?: Order;
    req?: PlanReq;
  }>(null);

  useEffect(() => {
    (async () => {
      const [o, r, p, u, pr] = await Promise.all([
        supabase
          .from("credit_orders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("plan_activation_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("plans").select("id,name,price_cents"),
        supabase
          .from("credit_transactions")
          .select("user_id,cost_cents,total_tokens,occurred_at,model")
          .eq("kind", "usage")
          .eq("status", "ok")
          .order("occurred_at", { ascending: false })
          .limit(2000),
        supabase.from("profiles").select("id,full_name"),
      ]);
      setOrders((o.data as Order[]) ?? []);
      setPlanReqs((r.data as PlanReq[]) ?? []);
      setPlans((p.data as Plan[]) ?? []);
      setUsage((u.data as UsageTx[]) ?? []);
      setProfiles((pr.data as Profile[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const planPrice = useMemo(() => new Map(plans.map((p) => [p.id, p.price_cents])), [plans]);
  const planName = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  const userName = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.full_name ?? p.id.slice(0, 8)])),
    [profiles],
  );

  const fromDate = useMemo(() => new Date(from + "T00:00:00"), [from]);
  const toDate = useMemo(() => {
    const d = new Date(to + "T23:59:59");
    return d;
  }, [to]);

  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= fromDate && d <= toDate;
  };

  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (!inRange(o.created_at)) return false;
        if (statusFilter !== "all" && o.status !== statusFilter) return false;
        return true;
      }),
    [orders, from, to, statusFilter],
  );

  const filteredPlanReqs = useMemo(
    () =>
      planReqs.filter((r) => {
        if (!inRange(r.created_at)) return false;
        if (statusFilter === "paid" && r.status !== "approved") return false;
        if (statusFilter === "pending" && r.status !== "pending") return false;
        return true;
      }),
    [planReqs, from, to, statusFilter],
  );

  const showCredits = typeFilter === "all" || typeFilter === "credits";
  const showPlans = typeFilter === "all" || typeFilter === "plans";

  // Revenue calculations
  const creditsPaid = showCredits
    ? filteredOrders.filter((o) => o.status === "paid").reduce((a, o) => a + o.price_cents, 0)
    : 0;
  const creditsPending = showCredits
    ? filteredOrders.filter((o) => o.status === "pending").reduce((a, o) => a + o.price_cents, 0)
    : 0;
  const plansPaid = showPlans
    ? filteredPlanReqs
        .filter((r) => r.status === "approved")
        .reduce((a, r) => a + (planPrice.get(r.plan_id) ?? 0), 0)
    : 0;
  const plansPending = showPlans
    ? filteredPlanReqs
        .filter((r) => r.status === "pending")
        .reduce((a, r) => a + (planPrice.get(r.plan_id) ?? 0), 0)
    : 0;
  const totalPaid = creditsPaid + plansPaid;
  const totalPending = creditsPending + plansPending;

  const aiCostCents = useMemo(
    () => usage.filter((u) => inRange(u.occurred_at)).reduce((a, u) => a + (u.cost_cents ?? 0), 0),
    [usage, from, to],
  );
  const aiTokens = useMemo(
    () =>
      usage.filter((u) => inRange(u.occurred_at)).reduce((a, u) => a + (u.total_tokens ?? 0), 0),
    [usage, from, to],
  );

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    // seed months in range
    const start = new Date(fromDate);
    start.setDate(1);
    const end = new Date(toDate);
    end.setDate(1);
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      map.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    const add = (iso: string, cents: number) => {
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (map.has(key)) map.set(key, (map.get(key) || 0) + cents);
    };
    if (showCredits)
      for (const o of filteredOrders)
        if (o.status === "paid" && o.paid_at) add(o.paid_at, o.price_cents);
    if (showPlans)
      for (const r of filteredPlanReqs)
        if (r.status === "approved" && r.approved_at)
          add(r.approved_at, planPrice.get(r.plan_id) ?? 0);
    return Array.from(map.entries()).map(([k, v]) => ({
      mes: k.slice(5) + "/" + k.slice(2, 4),
      valor: v / 100,
    }));
  }, [filteredOrders, filteredPlanReqs, fromDate, toDate, showCredits, showPlans, planPrice]);

  // Daily cashflow: entradas (receita) vs saídas (custo IA) e lucro
  const dailyData = useMemo(() => {
    const map = new Map<string, { entrada: number; saida: number }>();
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      map.set(k, { entrada: 0, saida: 0 });
    }
    const addIn = (iso: string, cents: number) => {
      const k = new Date(iso).toISOString().slice(0, 10);
      if (map.has(k)) map.get(k)!.entrada += cents;
    };
    const addOut = (iso: string, cents: number) => {
      const k = new Date(iso).toISOString().slice(0, 10);
      if (map.has(k)) map.get(k)!.saida += cents;
    };
    if (showCredits)
      for (const o of filteredOrders)
        if (o.status === "paid" && o.paid_at) addIn(o.paid_at, o.price_cents);
    if (showPlans)
      for (const r of filteredPlanReqs)
        if (r.status === "approved" && r.approved_at)
          addIn(r.approved_at, planPrice.get(r.plan_id) ?? 0);
    for (const u of usage) if (inRange(u.occurred_at)) addOut(u.occurred_at, u.cost_cents ?? 0);
    return Array.from(map.entries()).map(([k, v]) => ({
      dia: k.slice(8, 10) + "/" + k.slice(5, 7),
      entrada: v.entrada / 100,
      saida: v.saida / 100,
      lucro: (v.entrada - v.saida) / 100,
    }));
  }, [
    filteredOrders,
    filteredPlanReqs,
    usage,
    fromDate,
    toDate,
    showCredits,
    showPlans,
    planPrice,
    from,
    to,
  ]);

  // Pizza: composição da receita
  const pieData = useMemo(
    () =>
      [
        { name: "Planos pagos", value: plansPaid / 100, color: "var(--primary)" },
        { name: "Créditos pagos", value: creditsPaid / 100, color: "hsl(142 76% 45%)" },
        { name: "Planos pendentes", value: plansPending / 100, color: "hsl(48 96% 53%)" },
        { name: "Créditos pendentes", value: creditsPending / 100, color: "hsl(24 95% 53%)" },
      ].filter((x) => x.value > 0),
    [plansPaid, creditsPaid, plansPending, creditsPending],
  );

  // Pizza: gastos IA por modelo
  const modelPieData = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of usage)
      if (inRange(u.occurred_at)) {
        const k = u.model || "desconhecido";
        map.set(k, (map.get(k) || 0) + (u.cost_cents ?? 0));
      }
    const palette = [
      "var(--primary)",
      "hsl(280 80% 60%)",
      "hsl(200 80% 55%)",
      "hsl(340 80% 60%)",
      "hsl(48 96% 53%)",
      "hsl(142 70% 45%)",
    ];
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, cents], i) => ({
        name,
        value: cents / 100,
        color: palette[i % palette.length],
      }));
  }, [usage, from, to]);

  const ticketMedio = (() => {
    const n =
      (showCredits ? filteredOrders.filter((o) => o.status === "paid").length : 0) +
      (showPlans ? filteredPlanReqs.filter((r) => r.status === "approved").length : 0);
    return n > 0 ? totalPaid / n : 0;
  })();
  const totalTransactions =
    (showCredits ? filteredOrders.length : 0) + (showPlans ? filteredPlanReqs.length : 0);
  const paidTransactions =
    (showCredits ? filteredOrders.filter((o) => o.status === "paid").length : 0) +
    (showPlans ? filteredPlanReqs.filter((r) => r.status === "approved").length : 0);
  const conversao = totalTransactions > 0 ? (paidTransactions / totalTransactions) * 100 : 0;
  const margemPct = totalPaid > 0 ? ((totalPaid - aiCostCents) / totalPaid) * 100 : 0;

  const exportCSV = () => {
    const rows = [
      ...(showCredits
        ? filteredOrders.map((o) => ({
            tipo: "Crédito",
            data: o.created_at,
            cliente: userName.get(o.user_id) ?? o.user_id,
            descricao: `${o.tokens.toLocaleString("pt-BR")} tokens`,
            valor_reais: (o.price_cents / 100).toFixed(2),
            status: o.status,
          }))
        : []),
      ...(showPlans
        ? filteredPlanReqs.map((r) => ({
            tipo: "Plano",
            data: r.created_at,
            cliente: userName.get(r.user_id) ?? r.user_id,
            descricao: planName.get(r.plan_id) ?? "—",
            valor_reais: ((planPrice.get(r.plan_id) ?? 0) / 100).toFixed(2),
            status: r.status,
          }))
        : []),
    ];
    downloadCSV(`financeiro-${new Date().toISOString().slice(0, 10)}`, toCSV(rows));
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Relatório Financeiro", 14, 18);
    doc.setFontSize(10);
    const statusLabel =
      statusFilter === "all"
        ? "Todos"
        : statusFilter === "paid"
          ? "Pagos/Aprovados"
          : statusFilter === "pending"
            ? "Pendentes"
            : "Cancelados";
    const typeLabel =
      typeFilter === "all"
        ? "Planos + Créditos"
        : typeFilter === "plans"
          ? "Somente Planos"
          : "Somente Créditos";
    doc.text(`Período: ${from} a ${to}`, 14, 26);
    doc.text(`Filtros — Status: ${statusLabel}   |   Tipo: ${typeLabel}`, 14, 32);
    doc.text(
      `Entradas: ${formatBRL(totalPaid)}   |   Pendente: ${formatBRL(totalPending)}   |   Saídas IA: ${formatBRL(aiCostCents)}`,
      14,
      38,
    );
    doc.text(
      `Lucro: ${formatBRL(totalPaid - aiCostCents)}   |   Margem: ${margemPct.toFixed(1)}%   |   Ticket médio: ${formatBRL(ticketMedio)}   |   Conversão: ${conversao.toFixed(1)}%`,
      14,
      44,
    );
    doc.text(
      `Planos pagos: ${formatBRL(plansPaid)}   |   Créditos pagos: ${formatBRL(creditsPaid)}   |   Tokens IA: ${aiTokens.toLocaleString("pt-BR")}`,
      14,
      50,
    );

    const body: string[][] = [];
    if (showCredits)
      for (const o of filteredOrders)
        body.push([
          new Date(o.created_at).toLocaleDateString("pt-BR"),
          "Crédito",
          userName.get(o.user_id) ?? o.user_id.slice(0, 8),
          `${o.tokens.toLocaleString("pt-BR")} tokens`,
          formatBRL(o.price_cents),
          o.status,
        ]);
    if (showPlans)
      for (const r of filteredPlanReqs)
        body.push([
          new Date(r.created_at).toLocaleDateString("pt-BR"),
          "Plano",
          userName.get(r.user_id) ?? r.user_id.slice(0, 8),
          planName.get(r.plan_id) ?? "—",
          formatBRL(planPrice.get(r.plan_id) ?? 0),
          r.status,
        ]);
    body.sort((a, b) => {
      const da = a[0].split("/").reverse().join("-");
      const db = b[0].split("/").reverse().join("-");
      return db.localeCompare(da);
    });
    autoTable(doc, {
      startY: 58,
      head: [["Data", "Tipo", "Cliente", "Descrição", "Valor", "Status"]],
      body,
      styles: { fontSize: 8 },
      foot: [["", "", "", `Total (${body.length})`, formatBRL(totalPaid + totalPending), ""]],
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
    });
    doc.save(`financeiro-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const cards = [
    {
      label: "Entradas (pago)",
      value: formatBRL(totalPaid),
      icon: TrendingUp,
      sub: "Planos + Créditos",
      accent: "from-emerald-500/20 to-emerald-500/0",
      color: "text-emerald-500",
    },
    {
      label: "Saídas (custo IA)",
      value: formatBRL(aiCostCents),
      icon: TrendingDown,
      sub: `${aiTokens.toLocaleString("pt-BR")} tokens`,
      accent: "from-rose-500/20 to-rose-500/0",
      color: "text-rose-500",
    },
    {
      label: "Lucro líquido",
      value: formatBRL(totalPaid - aiCostCents),
      icon: Wallet,
      sub: `Margem ${margemPct.toFixed(1)}%`,
      accent: "from-primary/25 to-primary/0",
      color: "text-primary",
    },
    {
      label: "Aguardando",
      value: formatBRL(totalPending),
      icon: Clock,
      sub: "A receber",
      accent: "from-amber-500/20 to-amber-500/0",
      color: "text-amber-500",
    },
    {
      label: "Receita Planos",
      value: formatBRL(plansPaid),
      icon: CheckCircle2,
      sub: `${filteredPlanReqs.filter((r) => r.status === "approved").length} aprovados`,
      accent: "from-primary/15 to-transparent",
      color: "text-primary",
    },
    {
      label: "Receita Créditos",
      value: formatBRL(creditsPaid),
      icon: Coins,
      sub: `${filteredOrders.filter((o) => o.status === "paid").length} pagos`,
      accent: "from-primary/15 to-transparent",
      color: "text-primary",
    },
    {
      label: "Ticket médio",
      value: formatBRL(ticketMedio),
      icon: Target,
      sub: `${paidTransactions} vendas`,
      accent: "from-primary/15 to-transparent",
      color: "text-primary",
    },
    {
      label: "Conversão",
      value: `${conversao.toFixed(1)}%`,
      icon: Activity,
      sub: `${paidTransactions}/${totalTransactions}`,
      accent: "from-primary/15 to-transparent",
      color: "text-primary",
    },
  ];

  return (
    <PageShell
      title="Financeiro"
      description="Receita, pedidos, gastos com IA e movimentação completa da plataforma."
      icon={<DollarSign className="h-6 w-6" />}
      status="ativo"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={loading}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={loading}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="p-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="paid">Pagos / Aprovados</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="cancelled">Cancelados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Planos + Créditos</SelectItem>
                    <SelectItem value="plans">Somente Planos</SelectItem>
                    <SelectItem value="credits">Somente Créditos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.label} className="relative overflow-hidden border-border/60">
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${c.accent} pointer-events-none`}
                />
                <CardContent className="p-5 relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className={`text-2xl font-black mt-1 ${c.color}`}>{c.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{c.sub}</p>
                    </div>
                    <div
                      className={`h-9 w-9 grid place-items-center rounded-lg bg-background/60 backdrop-blur ${c.color}`}
                    >
                      <c.icon className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="mt-4">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Fluxo de caixa diário — entradas ×
                  saídas
                </p>
                <Badge variant="outline" className="text-[10px]">
                  Lucro em linha
                </Badge>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="entrada" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(142 76% 45%)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="hsl(142 76% 45%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="saida" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={11}
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
                      name="Entradas"
                      dataKey="entrada"
                      stroke="hsl(142 76% 45%)"
                      fill="url(#entrada)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      name="Saídas"
                      dataKey="saida"
                      stroke="hsl(0 84% 60%)"
                      fill="url(#saida)"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      name="Lucro"
                      dataKey="lucro"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 mt-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <PieIcon className="h-4 w-4 text-primary" /> Composição da receita
                </p>
                <div className="h-72">
                  {pieData.length === 0 ? (
                    <div className="h-full grid place-items-center text-xs text-muted-foreground">
                      Sem dados no período
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={2}
                        >
                          {pieData.map((e, i) => (
                            <Cell key={i} fill={e.color} />
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
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" /> Custo IA por modelo
                </p>
                <div className="h-72">
                  {modelPieData.length === 0 ? (
                    <div className="h-full grid place-items-center text-xs text-muted-foreground">
                      Sem uso registrado
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={modelPieData}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={95}
                          label={(e: any) => e.name}
                        >
                          {modelPieData.map((e, i) => (
                            <Cell key={i} fill={e.color} />
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
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardContent className="p-5">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Receita mensal (montanha)
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
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
                    <Area
                      type="monotone"
                      dataKey="valor"
                      stroke="var(--primary)"
                      fill="url(#rev)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="p-5">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary" /> Entradas × Saídas por dia (barras)
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={11}
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
                    <Bar
                      name="Entradas"
                      dataKey="entrada"
                      fill="hsl(142 76% 45%)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      name="Saídas"
                      dataKey="saida"
                      fill="hsl(0 84% 60%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardContent className="p-0 overflow-x-auto">
              <div className="p-4 border-b flex items-center justify-between">
                <p className="text-sm font-semibold">Movimentação detalhada</p>
                <Badge variant="outline">
                  {(showCredits ? filteredOrders.length : 0) +
                    (showPlans ? filteredPlanReqs.length : 0)}{" "}
                  registros
                </Badge>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Data</th>
                    <th className="text-left p-3">Tipo</th>
                    <th className="text-left p-3">Cliente</th>
                    <th className="text-left p-3">Descrição</th>
                    <th className="text-left p-3">Valor</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...(showCredits
                      ? filteredOrders.map((o) => ({
                          k: `o-${o.id}`,
                          date: o.created_at,
                          tipo: "Crédito",
                          cliente: userName.get(o.user_id) ?? o.user_id.slice(0, 8),
                          desc: `${o.tokens.toLocaleString("pt-BR")} tokens`,
                          valor: o.price_cents,
                          status: o.status,
                        }))
                      : []),
                    ...(showPlans
                      ? filteredPlanReqs.map((r) => ({
                          k: `r-${r.id}`,
                          date: r.created_at,
                          tipo: "Plano",
                          cliente: userName.get(r.user_id) ?? r.user_id.slice(0, 8),
                          desc: planName.get(r.plan_id) ?? "—",
                          valor: planPrice.get(r.plan_id) ?? 0,
                          status: r.status,
                        }))
                      : []),
                  ]
                    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
                    .slice(0, 100)
                    .map((row) => (
                      <tr
                        key={row.k}
                        className="border-t cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => {
                          if (row.k.startsWith("o-")) {
                            const o = orders.find((x) => x.id === row.k.slice(2));
                            if (o) setDetail({ tipo: "Crédito", order: o });
                          } else {
                            const r = planReqs.find((x) => x.id === row.k.slice(2));
                            if (r) setDetail({ tipo: "Plano", req: r });
                          }
                        }}
                      >
                        <td className="p-3">{new Date(row.date).toLocaleDateString("pt-BR")}</td>
                        <td className="p-3">{row.tipo}</td>
                        <td className="p-3">{row.cliente}</td>
                        <td className="p-3 text-muted-foreground">{row.desc}</td>
                        <td className="p-3 font-medium">{formatBRL(row.valor)}</td>
                        <td className="p-3">
                          {(() => {
                            const s = row.status;
                            const label =
                              s === "paid"
                                ? "Pago"
                                : s === "approved"
                                  ? "Aprovado"
                                  : s === "pending"
                                    ? "Pendente"
                                    : s === "rejected"
                                      ? "Rejeitado"
                                      : s === "canceled" || s === "cancelled"
                                        ? "Cancelado"
                                        : s;
                            const isGreen = s === "paid" || s === "approved";
                            return (
                              <Badge
                                className={
                                  isGreen
                                    ? "bg-emerald-500 hover:bg-emerald-500 text-foreground border-transparent"
                                    : ""
                                }
                                variant={
                                  isGreen ? "default" : s === "pending" ? "secondary" : "outline"
                                }
                              >
                                {label}
                              </Badge>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail?.tipo === "Crédito" ? (
                    <Coins className="h-4 w-4 text-primary" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                  Detalhamento — {detail?.tipo}
                </DialogTitle>
                <DialogDescription>
                  Origem, datas e valores do lançamento selecionado.
                </DialogDescription>
              </DialogHeader>
              {detail?.order &&
                (() => {
                  const o = detail.order;
                  const userUsage = usage.filter(
                    (u) => u.user_id === o.user_id && inRange(u.occurred_at),
                  );
                  const userAiCost = userUsage.reduce((a, u) => a + (u.cost_cents ?? 0), 0);
                  const userTokens = userUsage.reduce((a, u) => a + (u.total_tokens ?? 0), 0);
                  return (
                    <div className="text-sm space-y-2">
                      <Row k="ID do pedido" v={<code className="text-xs">{o.id}</code>} />
                      <Row k="Cliente" v={`${userName.get(o.user_id) ?? "—"}`} />
                      <Row k="User ID" v={<code className="text-xs">{o.user_id}</code>} />
                      <Row k="Tokens comprados" v={o.tokens.toLocaleString("pt-BR")} />
                      <Row
                        k="Valor"
                        v={
                          <span className="font-bold text-emerald-500">
                            {formatBRL(o.price_cents)}
                          </span>
                        }
                      />
                      <Row
                        k="Status"
                        v={
                          <Badge
                            className={
                              o.status === "paid"
                                ? "bg-emerald-500 hover:bg-emerald-500 text-foreground border-transparent"
                                : ""
                            }
                            variant={
                              o.status === "paid"
                                ? "default"
                                : o.status === "pending"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {o.status === "paid"
                              ? "Pago"
                              : o.status === "pending"
                                ? "Pendente"
                                : o.status === "canceled" || o.status === "cancelled"
                                  ? "Cancelado"
                                  : o.status}
                          </Badge>
                        }
                      />
                      <Row k="Origem" v="Compra de créditos (credit_orders)" />
                      <Row k="Criado em" v={new Date(o.created_at).toLocaleString("pt-BR")} />
                      <Row
                        k="Pago em"
                        v={o.paid_at ? new Date(o.paid_at).toLocaleString("pt-BR") : "—"}
                      />
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">
                          Consumo deste cliente no período
                        </p>
                        <Row
                          k="Custo IA"
                          v={<span className="text-rose-500">{formatBRL(userAiCost)}</span>}
                        />
                        <Row k="Tokens consumidos" v={userTokens.toLocaleString("pt-BR")} />
                      </div>
                    </div>
                  );
                })()}
              {detail?.req &&
                (() => {
                  const r = detail.req;
                  const price = planPrice.get(r.plan_id) ?? 0;
                  return (
                    <div className="text-sm space-y-2">
                      <Row k="ID da solicitação" v={<code className="text-xs">{r.id}</code>} />
                      <Row k="Cliente" v={`${userName.get(r.user_id) ?? "—"}`} />
                      <Row k="User ID" v={<code className="text-xs">{r.user_id}</code>} />
                      <Row k="Plano" v={planName.get(r.plan_id) ?? "—"} />
                      <Row
                        k="Valor do plano"
                        v={<span className="font-bold text-emerald-500">{formatBRL(price)}</span>}
                      />
                      <Row
                        k="Status"
                        v={
                          <Badge
                            className={
                              r.status === "approved"
                                ? "bg-emerald-500 hover:bg-emerald-500 text-foreground border-transparent"
                                : ""
                            }
                            variant={
                              r.status === "approved"
                                ? "default"
                                : r.status === "pending"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {r.status === "approved"
                              ? "Aprovado"
                              : r.status === "pending"
                                ? "Pendente"
                                : r.status === "rejected"
                                  ? "Rejeitado"
                                  : r.status}
                          </Badge>
                        }
                      />
                      <Row
                        k="Origem"
                        v="Solicitação de ativação de plano (plan_activation_requests)"
                      />
                      <Row k="Solicitado em" v={new Date(r.created_at).toLocaleString("pt-BR")} />
                      <Row
                        k="Aprovado em"
                        v={r.approved_at ? new Date(r.approved_at).toLocaleString("pt-BR") : "—"}
                      />
                    </div>
                  );
                })()}
            </DialogContent>
          </Dialog>
        </>
      )}
    </PageShell>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-muted-foreground text-xs">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
