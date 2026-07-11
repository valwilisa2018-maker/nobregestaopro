import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, ShoppingCart, Coins, Loader2, Download, FileText, Brain, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
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

type Order = { id: string; user_id: string; tokens: number; price_cents: number; status: string; created_at: string; paid_at: string | null };
type PlanReq = { id: string; user_id: string; plan_id: string; status: string; created_at: string; approved_at: string | null };
type Plan = { id: string; name: string; price_cents: number };
type UsageTx = { user_id: string; cost_cents: number | null; total_tokens: number | null; occurred_at: string; model: string | null };
type Profile = { id: string; full_name: string | null };

function Page() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [planReqs, setPlanReqs] = useState<PlanReq[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<UsageTx[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0,10); });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const [o, r, p, u, pr] = await Promise.all([
        supabase.from("credit_orders").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("plan_activation_requests").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("plans").select("id,name,price_cents"),
        supabase.from("credit_transactions").select("user_id,cost_cents,total_tokens,occurred_at,model").eq("kind","usage").eq("status","ok").order("occurred_at",{ascending:false}).limit(2000),
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

  const planPrice = useMemo(() => new Map(plans.map(p => [p.id, p.price_cents])), [plans]);
  const planName = useMemo(() => new Map(plans.map(p => [p.id, p.name])), [plans]);
  const userName = useMemo(() => new Map(profiles.map(p => [p.id, p.full_name ?? p.id.slice(0,8)])), [profiles]);

  const fromDate = useMemo(() => new Date(from + "T00:00:00"), [from]);
  const toDate = useMemo(() => { const d = new Date(to + "T23:59:59"); return d; }, [to]);

  const inRange = (iso: string | null) => { if (!iso) return false; const d = new Date(iso); return d >= fromDate && d <= toDate; };

  const filteredOrders = useMemo(() => orders.filter(o => {
    if (!inRange(o.created_at)) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    return true;
  }), [orders, from, to, statusFilter]);

  const filteredPlanReqs = useMemo(() => planReqs.filter(r => {
    if (!inRange(r.created_at)) return false;
    if (statusFilter === "paid" && r.status !== "approved") return false;
    if (statusFilter === "pending" && r.status !== "pending") return false;
    return true;
  }), [planReqs, from, to, statusFilter]);

  const showCredits = typeFilter === "all" || typeFilter === "credits";
  const showPlans = typeFilter === "all" || typeFilter === "plans";

  // Revenue calculations
  const creditsPaid = showCredits ? filteredOrders.filter(o => o.status === "paid").reduce((a,o)=>a+o.price_cents,0) : 0;
  const creditsPending = showCredits ? filteredOrders.filter(o => o.status === "pending").reduce((a,o)=>a+o.price_cents,0) : 0;
  const plansPaid = showPlans ? filteredPlanReqs.filter(r => r.status === "approved").reduce((a,r)=>a+(planPrice.get(r.plan_id)??0),0) : 0;
  const plansPending = showPlans ? filteredPlanReqs.filter(r => r.status === "pending").reduce((a,r)=>a+(planPrice.get(r.plan_id)??0),0) : 0;
  const totalPaid = creditsPaid + plansPaid;
  const totalPending = creditsPending + plansPending;

  const aiCostCents = useMemo(() => usage
    .filter(u => inRange(u.occurred_at))
    .reduce((a,u) => a + (u.cost_cents ?? 0), 0), [usage, from, to]);
  const aiTokens = useMemo(() => usage
    .filter(u => inRange(u.occurred_at))
    .reduce((a,u) => a + (u.total_tokens ?? 0), 0), [usage, from, to]);

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    // seed months in range
    const start = new Date(fromDate); start.setDate(1);
    const end = new Date(toDate); end.setDate(1);
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth()+1)) {
      map.set(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, 0);
    }
    const add = (iso: string, cents: number) => {
      const d = new Date(iso);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (map.has(key)) map.set(key, (map.get(key)||0) + cents);
    };
    if (showCredits) for (const o of filteredOrders) if (o.status === "paid" && o.paid_at) add(o.paid_at, o.price_cents);
    if (showPlans) for (const r of filteredPlanReqs) if (r.status === "approved" && r.approved_at) add(r.approved_at, planPrice.get(r.plan_id) ?? 0);
    return Array.from(map.entries()).map(([k, v]) => ({
      mes: k.slice(5) + "/" + k.slice(2, 4),
      valor: v / 100,
    }));
  }, [filteredOrders, filteredPlanReqs, fromDate, toDate, showCredits, showPlans, planPrice]);

  const exportCSV = () => {
    const rows = [
      ...(showCredits ? filteredOrders.map(o => ({
        tipo: "Crédito", data: o.created_at, cliente: userName.get(o.user_id) ?? o.user_id,
        descricao: `${o.tokens.toLocaleString("pt-BR")} tokens`,
        valor_reais: (o.price_cents/100).toFixed(2), status: o.status,
      })) : []),
      ...(showPlans ? filteredPlanReqs.map(r => ({
        tipo: "Plano", data: r.created_at, cliente: userName.get(r.user_id) ?? r.user_id,
        descricao: planName.get(r.plan_id) ?? "—",
        valor_reais: ((planPrice.get(r.plan_id) ?? 0)/100).toFixed(2), status: r.status,
      })) : []),
    ];
    downloadCSV(`financeiro-${new Date().toISOString().slice(0, 10)}`, toCSV(rows));
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Relatório Financeiro", 14, 18);
    doc.setFontSize(10);
    doc.text(`Período: ${from} a ${to}`, 14, 26);
    doc.text(`Receita paga: ${formatBRL(totalPaid)}   |   Pendente: ${formatBRL(totalPending)}`, 14, 32);
    doc.text(`Gastos IA: ${formatBRL(aiCostCents)}   |   Tokens: ${aiTokens.toLocaleString("pt-BR")}`, 14, 38);

    const body: string[][] = [];
    if (showCredits) for (const o of filteredOrders) body.push([
      new Date(o.created_at).toLocaleDateString("pt-BR"), "Crédito",
      userName.get(o.user_id) ?? o.user_id.slice(0,8),
      `${o.tokens.toLocaleString("pt-BR")} tokens`,
      formatBRL(o.price_cents), o.status,
    ]);
    if (showPlans) for (const r of filteredPlanReqs) body.push([
      new Date(r.created_at).toLocaleDateString("pt-BR"), "Plano",
      userName.get(r.user_id) ?? r.user_id.slice(0,8),
      planName.get(r.plan_id) ?? "—",
      formatBRL(planPrice.get(r.plan_id) ?? 0), r.status,
    ]);
    autoTable(doc, { startY: 44, head: [["Data","Tipo","Cliente","Descrição","Valor","Status"]], body, styles: { fontSize: 8 } });
    doc.save(`financeiro-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const cards = [
    { label: "Receita paga", value: formatBRL(totalPaid), icon: DollarSign, sub: "Planos + Créditos" },
    { label: "Aguardando pagamento", value: formatBRL(totalPending), icon: Clock, sub: "Pendentes" },
    { label: "Receita — Planos", value: formatBRL(plansPaid), icon: CheckCircle2, sub: `${filteredPlanReqs.filter(r=>r.status==="approved").length} aprovados` },
    { label: "Receita — Créditos", value: formatBRL(creditsPaid), icon: Coins, sub: `${filteredOrders.filter(o=>o.status==="paid").length} pagos` },
    { label: "Pendentes — Planos", value: formatBRL(plansPending), icon: ShoppingCart, sub: `${filteredPlanReqs.filter(r=>r.status==="pending").length} solicitações` },
    { label: "Pendentes — Créditos", value: formatBRL(creditsPending), icon: ShoppingCart, sub: `${filteredOrders.filter(o=>o.status==="pending").length} pedidos` },
    { label: "Gastos IA (custo)", value: formatBRL(aiCostCents), icon: Brain, sub: `${aiTokens.toLocaleString("pt-BR")} tokens` },
    { label: "Lucro estimado", value: formatBRL(totalPaid - aiCostCents), icon: TrendingUp, sub: "Receita − IA" },
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
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={to} onChange={e=>setTo(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="paid">Pagos / Aprovados</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="cancelled">Cancelados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Tipo</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
            {cards.map(c => (
              <Card key={c.label}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className="text-2xl font-black mt-1">{c.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{c.sub}</p>
                    </div>
                    <div className="h-9 w-9 grid place-items-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-4 w-4" /></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="mt-4">
            <CardContent className="p-5">
              <p className="text-sm font-semibold mb-3">Receita no período (por mês)</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    />
                    <Area type="monotone" dataKey="valor" stroke="hsl(var(--primary))" fill="url(#rev)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardContent className="p-0 overflow-x-auto">
              <div className="p-4 border-b flex items-center justify-between">
                <p className="text-sm font-semibold">Movimentação detalhada</p>
                <Badge variant="outline">{(showCredits?filteredOrders.length:0) + (showPlans?filteredPlanReqs.length:0)} registros</Badge>
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
                    ...(showCredits ? filteredOrders.map(o => ({
                      k: `o-${o.id}`, date: o.created_at, tipo: "Crédito",
                      cliente: userName.get(o.user_id) ?? o.user_id.slice(0,8),
                      desc: `${o.tokens.toLocaleString("pt-BR")} tokens`,
                      valor: o.price_cents, status: o.status,
                    })) : []),
                    ...(showPlans ? filteredPlanReqs.map(r => ({
                      k: `r-${r.id}`, date: r.created_at, tipo: "Plano",
                      cliente: userName.get(r.user_id) ?? r.user_id.slice(0,8),
                      desc: planName.get(r.plan_id) ?? "—",
                      valor: planPrice.get(r.plan_id) ?? 0, status: r.status,
                    })) : []),
                  ].sort((a,b) => +new Date(b.date) - +new Date(a.date)).slice(0, 100).map(row => (
                    <tr key={row.k} className="border-t">
                      <td className="p-3">{new Date(row.date).toLocaleDateString("pt-BR")}</td>
                      <td className="p-3">{row.tipo}</td>
                      <td className="p-3">{row.cliente}</td>
                      <td className="p-3 text-muted-foreground">{row.desc}</td>
                      <td className="p-3 font-medium">{formatBRL(row.valor)}</td>
                      <td className="p-3">
                        <Badge variant={row.status === "paid" || row.status === "approved" ? "default" : row.status === "pending" ? "secondary" : "outline"}>
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}