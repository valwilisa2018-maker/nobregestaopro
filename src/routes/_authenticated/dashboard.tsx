import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/auth";
import {
  DollarSign, TrendingUp, Calendar, Trophy, CheckCircle2, Clock, AlertCircle, Package,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

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
  const sales = useQuery({
    queryKey: ["dash-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,total_amount,paid_amount,payment_status,created_at,seller_id,producer_id");
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
        .select("id,column_id,kanban_columns(name,is_done)");
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

  const all = sales.data ?? [];
  const sumIn = (since: string) =>
    all.filter((s) => s.created_at >= since).reduce((a, s) => a + Number(s.total_amount), 0);

  const dayTotal = sumIn(startOf("day"));
  const weekTotal = sumIn(startOf("week"));
  const monthTotal = sumIn(startOf("month"));
  const yearTotal = sumIn(startOf("year"));

  const goalFor = (p: string) =>
    Number((goals.data ?? []).find((g) => g.period === p)?.target_amount ?? 0);

  const counts = {
    pago_total: all.filter((s) => s.payment_status === "pago_total").length,
    pago_parcial: all.filter((s) => s.payment_status === "pago_parcial").length,
    pendente: all.filter((s) => s.payment_status === "pendente").length,
  };

  const ordersInProd = (orders.data ?? []).filter((o: any) => !o.kanban_columns?.is_done).length;
  const ordersDelivered = (orders.data ?? []).filter((o: any) => o.kanban_columns?.is_done).length;

  const sellerRanking = (sellers.data ?? []).map((s) => ({
    name: s.name,
    total: all.filter((x) => x.seller_id === s.id).reduce((a, x) => a + Number(x.total_amount), 0),
  })).sort((a, b) => b.total - a.total).slice(0, 5);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral de vendas e produção</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vendas hoje" value={formatCurrency(dayTotal)} icon={DollarSign} accent
          hint={`Meta ${formatCurrency(goalFor("daily"))}`} />
        <StatCard label="Semana" value={formatCurrency(weekTotal)} icon={Calendar}
          hint={`Meta ${formatCurrency(goalFor("weekly"))}`} />
        <StatCard label="Mês" value={formatCurrency(monthTotal)} icon={TrendingUp}
          hint={`Meta ${formatCurrency(goalFor("monthly"))}`} />
        <StatCard label="Ano" value={formatCurrency(yearTotal)} icon={Trophy}
          hint={`Meta ${formatCurrency(goalFor("yearly"))}`} />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pagas" value={String(counts.pago_total)} icon={CheckCircle2} />
        <StatCard label="Parciais" value={String(counts.pago_parcial)} icon={Clock} />
        <StatCard label="Pendentes" value={String(counts.pendente)} icon={AlertCircle} />
        <StatCard label="Em produção / Entregues" value={`${ordersInProd} / ${ordersDelivered}`} icon={Package} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle>Vendas por mês</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 270)" />
                <XAxis dataKey="mes" stroke="oklch(0.68 0.02 270)" />
                <YAxis stroke="oklch(0.68 0.02 270)" />
                <Tooltip contentStyle={{ background: "oklch(0.16 0.008 270)", border: "1px solid oklch(0.25 0.01 270)", borderRadius: 8 }} />
                <Bar dataKey="total" fill="oklch(0.58 0.22 25)" radius={[6, 6, 0, 0]} />
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
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle>Ranking de Vendedores</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sellerRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem vendedores cadastrados ainda.</p>}
            {sellerRanking.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</div>
                  <span className="font-medium">{s.name}</span>
                </div>
                <span className="font-semibold">{formatCurrency(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle>Ranking de Produtores</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(producers.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem produtores cadastrados ainda.</p>}
            {(producers.data ?? []).slice(0, 5).map((p: any, i: number) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</div>
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.specialty ?? "—"}</div>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div>Qualidade {Number(p.quality_score ?? 0).toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">{Number(p.average_delivery_days ?? 0).toFixed(1)} d</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}