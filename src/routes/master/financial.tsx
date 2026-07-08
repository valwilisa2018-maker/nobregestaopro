import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, ShoppingCart, Coins, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/master/financial")({
  head: () => ({ meta: [{ title: "Financeiro — Admin Master" }] }),
  component: Page,
});

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Order = { id: string; user_id: string; tokens: number; price_cents: number; status: string; created_at: string; paid_at: string | null };

function Page() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("credit_orders").select("*").order("created_at", { ascending: false }).limit(100);
      setOrders((data as Order[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const paidMonth = orders.filter(o => o.status === "paid" && o.paid_at && new Date(o.paid_at) >= monthStart);
  const totalMonth = paidMonth.reduce((a, o) => a + o.price_cents, 0);
  const pending = orders.filter(o => o.status === "pending");
  const pendingValue = pending.reduce((a, o) => a + o.price_cents, 0);
  const totalAll = orders.filter(o => o.status === "paid").reduce((a, o) => a + o.price_cents, 0);

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      map.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const o of orders) {
      if (o.status !== "paid" || !o.paid_at) continue;
      const d = new Date(o.paid_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (map.has(key)) map.set(key, (map.get(key) || 0) + o.price_cents);
    }
    return Array.from(map.entries()).map(([k, v]) => ({
      mes: k.slice(5) + "/" + k.slice(2, 4),
      valor: v / 100,
    }));
  }, [orders]);

  const exportCSV = () => {
    const rows = orders.map((o) => ({
      id: o.id,
      cliente: o.user_id,
      tokens: o.tokens,
      valor_reais: (o.price_cents / 100).toFixed(2),
      status: o.status,
      criado_em: o.created_at,
      pago_em: o.paid_at ?? "",
    }));
    downloadCSV(`financeiro-${new Date().toISOString().slice(0, 10)}`, toCSV(rows));
  };

  const cards = [
    { label: "Receita do mês", value: formatBRL(totalMonth), icon: DollarSign },
    { label: "Receita total", value: formatBRL(totalAll), icon: TrendingUp },
    { label: "Pedidos pendentes", value: `${pending.length} · ${formatBRL(pendingValue)}`, icon: ShoppingCart },
    { label: "Pedidos pagos (mês)", value: String(paidMonth.length), icon: Coins },
  ];

  return (
    <PageShell
      title="Financeiro"
      description="Receita, pedidos e movimentação da plataforma."
      icon={<DollarSign className="h-6 w-6" />}
      status="ativo"
      actions={
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!orders.length}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      }
    >
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {cards.map(c => (
              <Card key={c.label}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className="text-2xl font-black mt-1">{c.value}</p>
                    </div>
                    <div className="h-9 w-9 grid place-items-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-4 w-4" /></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="mt-4">
            <CardContent className="p-5">
              <p className="text-sm font-semibold mb-3">Receita nos últimos 6 meses</p>
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
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Data</th>
                    <th className="text-left p-3">Cliente</th>
                    <th className="text-left p-3">Tokens</th>
                    <th className="text-left p-3">Valor</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 30).map(o => (
                    <tr key={o.id} className="border-t">
                      <td className="p-3">{new Date(o.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="p-3 font-mono text-xs">{o.user_id.slice(0, 8)}</td>
                      <td className="p-3">{o.tokens.toLocaleString("pt-BR")}</td>
                      <td className="p-3 font-medium">{formatBRL(o.price_cents)}</td>
                      <td className="p-3">{o.status}</td>
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