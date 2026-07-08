import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, ShoppingCart, Coins, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_master/financial")({
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

  const cards = [
    { label: "Receita do mês", value: formatBRL(totalMonth), icon: DollarSign },
    { label: "Receita total", value: formatBRL(totalAll), icon: TrendingUp },
    { label: "Pedidos pendentes", value: `${pending.length} · ${formatBRL(pendingValue)}`, icon: ShoppingCart },
    { label: "Pedidos pagos (mês)", value: String(paidMonth.length), icon: Coins },
  ];

  return (
    <PageShell title="Financeiro" description="Receita, pedidos e movimentação da plataforma." icon={<DollarSign className="h-6 w-6" />} status="ativo">
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