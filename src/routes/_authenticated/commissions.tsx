import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, DollarSign, Download } from "lucide-react";
import { formatCurrency } from "@/lib/auth";

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

  const sales = useQuery({
    queryKey: ["commissions-sales", range?.from, range?.to],
    queryFn: async () => {
      let q = supabase.from("sales").select("id,seller_id,total_amount,paid_amount,payment_status,sale_date");
      if (range) q = q.gte("sale_date", range.from).lte("sale_date", range.to);
      return (await q).data ?? [];
    },
  });

  const rows = useMemo(() => {
    const list = (sellers.data ?? []).map((s: any) => {
      const sellerSales = (sales.data ?? []).filter((v: any) => v.seller_id === s.id);
      const totalSold = sellerSales.reduce((t: number, v: any) => t + Number(v.total_amount ?? 0), 0);
      const totalPaid = sellerSales.reduce((t: number, v: any) => t + Number(v.paid_amount ?? 0), 0);
      const pending = totalSold - totalPaid;
      const rate = Number(s.commission_rate ?? 0);
      const commissionPaid = (totalPaid * rate) / 100;
      const commissionPending = (pending * rate) / 100;
      const commissionTotal = commissionPaid + commissionPending;
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
      };
    });
    return list.sort((a, b) => b.commissionPaid - a.commissionPaid);
  }, [sellers.data, sales.data]);

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
                  <TableCell className="text-center">{r.rate}%</TableCell>
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
    </div>
  );
}