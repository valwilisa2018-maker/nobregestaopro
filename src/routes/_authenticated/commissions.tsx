import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, TrendingUp, DollarSign, Download } from "lucide-react";
import { formatCurrency } from "@/lib/auth";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/commissions")({
  component: CommissionsPage,
});

type PeriodKey = "this_month" | "last_month" | "this_year" | "all" | "custom";

function rangeFor(period: PeriodKey, from: string, to: string): { from: string; to: string } | null {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (period === "this_month") return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (period === "last_month") return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (period === "this_year") return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
  if (period === "all") return null;
  return { from, to };
}

function CommissionsPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  const range = useMemo(() => rangeFor(period, from, to), [period, from, to]);

  const sellers = useQuery({
    queryKey: ["commissions-sellers"],
    queryFn: async () => (await supabase.from("sellers").select("id,name,email,commission_rate,monthly_goal,active")).data ?? [],
  });

  const producers = useQuery({
    queryKey: ["commissions-producers"],
    queryFn: async () => (await supabase.from("producers").select("id,name,email,commission_rate,active" as any)).data ?? [],
  });

  const sales = useQuery({
    queryKey: ["commissions-sales", range?.from, range?.to],
    queryFn: async () => {
      let q = supabase.from("sales").select("id,seller_id,producer_id,total_amount,paid_amount,payment_status,sale_date,is_payment_link");
      if (range) q = q.gte("sale_date", range.from).lte("sale_date", range.to);
      return (await q).data ?? [];
    },
  });

  const deliveredOrders = useQuery({
    queryKey: ["commissions-delivered-orders", range?.from, range?.to],
    queryFn: async () => {
      let q = supabase
        .from("service_orders")
        .select("id,sale_id,producer_id,delivered_at")
        .not("delivered_at", "is", null);
      if (range) q = q.gte("delivered_at", range.from).lte("delivered_at", range.to + "T23:59:59");
      return (await q).data ?? [];
    },
  });

  const rows = useMemo(() => {
    const list = (sellers.data ?? []).map((s: any) => {
      const sellerSales = (sales.data ?? []).filter((v: any) => v.seller_id === s.id && !v.is_payment_link);
      const totalSold = sellerSales.reduce((t: number, v: any) => t + Number(v.total_amount ?? 0), 0);
      const totalPaid = sellerSales.reduce((t: number, v: any) => t + Number(v.paid_amount ?? 0), 0);
      const pending = totalSold - totalPaid;
      const rate = Number(s.commission_rate ?? 0);
      const commissionPaid = (totalPaid * rate) / 100;
      const commissionPending = (pending * rate) / 100;
      const commissionTotal = commissionPaid + commissionPending;
      const monthlyGoal = Number(s.monthly_goal ?? 0);
      const goalPct = monthlyGoal > 0 ? Math.min(100, (totalSold / monthlyGoal) * 100) : 0;
      const goalPaidPct = monthlyGoal > 0 ? Math.min(100, (totalPaid / monthlyGoal) * 100) : 0;
      return {
        id: s.id,
        name: s.name,
        email: s.email,
        rate,
        salesCount: sellerSales.length,
        totalSold,
        totalPaid,
        pending,
        commissionPaid,
        commissionPending,
        commissionTotal,
        monthlyGoal,
        goalPct,
        goalPaidPct,
      };
    });
    return list.sort((a, b) => b.commissionPaid - a.commissionPaid);
  }, [sellers.data, sales.data]);

  const producerRows = useMemo(() => {
    const salesById = new Map<string, any>();
    (sales.data ?? []).forEach((v: any) => salesById.set(v.id, v));

    const list = ((producers.data as any[]) ?? []).map((p: any) => {
      const pOrders = (deliveredOrders.data ?? []).filter((o: any) => o.producer_id === p.id);
      // Valor entregue = soma do valor unitário de cada serviço entregue no Trello
      let totalDelivered = 0;
      let totalDeliveredPaid = 0;
      pOrders.forEach((o: any) => {
        const sale = salesById.get(o.sale_id);
        if (!sale || sale.is_payment_link) return;
        const qty = 1; // valor por card entregue; service_orders já são 1 por serviço
        const totalAmount = Number(sale.total_amount ?? 0);
        const paidAmount = Number(sale.paid_amount ?? 0);
        // proporcional ao número de cards da venda
        const saleOrdersCount = (deliveredOrders.data ?? []).filter((x: any) => x.sale_id === o.sale_id).length || 1;
        // usar count total de service_orders da venda seria mais correto; aproximamos por entregues
        const unit = totalAmount / Math.max(saleOrdersCount, qty);
        const unitPaid = paidAmount > 0 ? (paidAmount / Math.max(saleOrdersCount, qty)) : 0;
        totalDelivered += unit;
        totalDeliveredPaid += Math.min(unit, unitPaid);
      });
      const totalSold = totalDelivered;
      const totalPaid = totalDeliveredPaid;
      const pending = totalSold - totalPaid;
      const rate = Number(p.commission_rate ?? 2);
      const commissionPaid = (totalPaid * rate) / 100;
      const commissionPending = (pending * rate) / 100;
      const commissionTotal = commissionPaid + commissionPending;
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        rate,
        salesCount: pOrders.length,
        totalSold,
        totalPaid,
        pending,
        commissionPaid,
        commissionPending,
        commissionTotal,
      };
    });
    return list.sort((a, b) => b.commissionPaid - a.commissionPaid);
  }, [producers.data, sales.data, deliveredOrders.data]);

  const producerTotals = useMemo(() => {
    return producerRows.reduce(
      (acc, r) => ({
        sold: acc.sold + r.totalSold,
        paid: acc.paid + r.totalPaid,
        commPaid: acc.commPaid + r.commissionPaid,
        commPending: acc.commPending + r.commissionPending,
      }),
      { sold: 0, paid: 0, commPaid: 0, commPending: 0 }
    );
  }, [producerRows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        sold: acc.sold + r.totalSold,
        paid: acc.paid + r.totalPaid,
        commPaid: acc.commPaid + r.commissionPaid,
        commPending: acc.commPending + r.commissionPending,
      }),
      { sold: 0, paid: 0, commPaid: 0, commPending: 0 }
    );
  }, [rows]);

  const updateRate = async (id: string, value: string) => {
    const rate = Number(value);
    if (isNaN(rate) || rate < 0 || rate > 100) { toast.error("Informe um percentual entre 0 e 100"); return; }
    const { error } = await supabase.from("sellers").update({ commission_rate: rate }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Comissão atualizada");
    qc.invalidateQueries({ queryKey: ["commissions-sellers"] });
    qc.invalidateQueries({ queryKey: ["admin-sellers"] });
  };

  const updateProducerRate = async (id: string, value: string) => {
    const rate = Number(value);
    if (isNaN(rate) || rate < 0 || rate > 100) { toast.error("Informe um percentual entre 0 e 100"); return; }
    const { error } = await (supabase.from("producers") as any).update({ commission_rate: rate }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Comissão atualizada");
    qc.invalidateQueries({ queryKey: ["commissions-producers"] });
  };

  const exportCsv = () => {
    const head = ["Vendedor", "Comissão (%)", "Vendas", "Total vendido", "Total pago", "A receber", "Comissão paga", "Comissão pendente", "Comissão total"];
    const body = rows.map((r) => [
      r.name, r.rate, r.salesCount, r.totalSold, r.totalPaid, r.pending, r.commissionPaid.toFixed(2), r.commissionPending.toFixed(2), r.commissionTotal.toFixed(2),
    ]);
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comissoes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: "Total vendido", value: totals.sold, icon: TrendingUp },
    { label: "Total pago", value: totals.paid, icon: DollarSign },
    { label: "Comissão paga", value: totals.commPaid, icon: Wallet },
    { label: "Comissão pendente", value: totals.commPending, icon: Wallet },
  ];

  const chartData = useMemo(
    () =>
      rows
        .filter((r) => r.monthlyGoal > 0 || r.totalSold > 0)
        .map((r) => ({
          name: r.name.length > 14 ? r.name.slice(0, 12) + "…" : r.name,
          Meta: r.monthlyGoal,
          Vendido: r.totalSold,
          Pago: r.totalPaid,
          Comissão: Number(r.commissionTotal.toFixed(2)),
        })),
    [rows]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comissões</h1>
          <p className="text-muted-foreground">Cálculo automático com base no valor pago de cada venda</p>
        </div>
        <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Exportar</Button>
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">Mês atual</SelectItem>
                <SelectItem value="last_month">Mês passado</SelectItem>
                <SelectItem value="this_year">Ano atual</SelectItem>
                <SelectItem value="all">Todo período</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {range && (
            <Badge variant="secondary" className="ml-auto">
              {range.from} → {range.to}
            </Badge>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="sellers" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sellers">Vendedores</TabsTrigger>
          <TabsTrigger value="producers">Produtores</TabsTrigger>
        </TabsList>

        <TabsContent value="sellers" className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/50 lg:col-span-2" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle className="text-base">Meta × Vendido × Pago × Comissão</CardTitle></CardHeader>
          <CardContent className="h-[320px]">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Sem dados no período. Defina metas mensais em Configurações → Comissões.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `R$ ${Math.round(v / 1000)}k`} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                    formatter={(value: any) => formatCurrency(Number(value))}
                  />
                  <Legend />
                  <Bar dataKey="Meta" fill="var(--muted-foreground)" opacity={0.4} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Vendido" fill="var(--primary)" opacity={0.6} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pago" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Comissão" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle className="text-base">Progresso individual</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-h-[320px] overflow-y-auto">
            {rows.length === 0 && <p className="text-sm text-muted-foreground">Sem vendedores.</p>}
            {rows.map((r) => (
              <div key={r.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm truncate">{r.name}</div>
                  <Badge variant="secondary" className="text-xs">
                    {r.monthlyGoal > 0 ? `${r.goalPct.toFixed(0)}%` : "sem meta"}
                  </Badge>
                </div>
                <Progress value={r.goalPct} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Pago {formatCurrency(r.totalPaid)} / {formatCurrency(r.monthlyGoal)}</span>
                  <span className="text-success font-medium">+{formatCurrency(r.commissionTotal)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{c.label}</p>
                  <p className="text-2xl font-bold tracking-tight">{formatCurrency(c.value)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader><CardTitle className="text-base">Comissão por vendedor</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-center">%</TableHead>
                <TableHead className="text-center">Vendas</TableHead>
                <TableHead className="text-right">Vendido</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">A receber</TableHead>
                <TableHead className="text-right">Comissão paga</TableHead>
                <TableHead className="text-right">Comissão pendente</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        defaultValue={r.rate}
                        onBlur={(e) => {
                          if (Number(e.target.value) !== r.rate) updateRate(r.id, e.target.value);
                        }}
                        className="h-8 w-20 text-center"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{r.salesCount}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.totalSold)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.totalPaid)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(r.pending)}</TableCell>
                  <TableCell className="text-right font-semibold text-success">{formatCurrency(r.commissionPaid)}</TableCell>
                  <TableCell className="text-right text-amber-500">{formatCurrency(r.commissionPending)}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(r.commissionTotal)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Sem vendedores cadastrados.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="producers" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total vendido", value: producerTotals.sold, icon: TrendingUp },
              { label: "Total pago", value: producerTotals.paid, icon: DollarSign },
              { label: "Comissão paga", value: producerTotals.commPaid, icon: Wallet },
              { label: "Comissão pendente", value: producerTotals.commPending, icon: Wallet },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <Card key={c.label} className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{c.label}</p>
                      <p className="text-2xl font-bold tracking-tight">{formatCurrency(c.value)}</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardHeader><CardTitle className="text-base">Comissão por produtor</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produtor</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead className="text-center">Entregas</TableHead>
                    <TableHead className="text-right">Entregue</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead className="text-right">A receber</TableHead>
                    <TableHead className="text-right">Comissão paga</TableHead>
                    <TableHead className="text-right">Comissão pendente</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {producerRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            defaultValue={r.rate}
                            onBlur={(e) => {
                              if (Number(e.target.value) !== r.rate) updateProducerRate(r.id, e.target.value);
                            }}
                            className="h-8 w-20 text-center"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{r.salesCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.totalSold)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.totalPaid)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(r.pending)}</TableCell>
                      <TableCell className="text-right font-semibold text-success">{formatCurrency(r.commissionPaid)}</TableCell>
                      <TableCell className="text-right text-amber-500">{formatCurrency(r.commissionPending)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(r.commissionTotal)}</TableCell>
                    </TableRow>
                  ))}
                  {producerRows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Sem produtores cadastrados.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}