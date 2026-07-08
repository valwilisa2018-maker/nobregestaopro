import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/master/orders")({
  head: () => ({ meta: [{ title: "Pedidos — Admin Master" }] }),
  component: Page,
});

type Order = { id: string; user_id: string; tokens: number; price_cents: number; status: string; created_at: string; paid_at: string | null };
const sbRpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;

function formatBRL(cents: number) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function Page() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("credit_orders").select("*").order("created_at", { ascending: false }).limit(200);
    setItems((data as Order[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const markPaid = async (id: string) => {
    setBusy(id);
    const { error } = await sbRpc("master_mark_order_paid", { _order_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Pedido marcado como pago");
    load();
  };

  return (
    <PageShell title="Pedidos de crédito" description="Aprove pagamentos manualmente." icon={<CreditCard className="h-6 w-6" />} status="ativo">
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Tokens</th>
                <th className="text-left p-3">Valor</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(o => (
                <tr key={o.id} className="border-t">
                  <td className="p-3">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-3 font-mono text-xs">{o.user_id.slice(0, 8)}</td>
                  <td className="p-3">{o.tokens.toLocaleString("pt-BR")}</td>
                  <td className="p-3 font-medium">{formatBRL(o.price_cents)}</td>
                  <td className="p-3">
                    {o.status === "paid" ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Pago</Badge>
                      : o.status === "pending" ? <Badge variant="outline">Pendente</Badge>
                      : <Badge variant="secondary">{o.status}</Badge>}
                  </td>
                  <td className="p-3 text-right">
                    {o.status === "pending" && (
                      <Button size="sm" onClick={() => markPaid(o.id)} disabled={busy === o.id}>
                        {busy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Marcar pago
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum pedido.</td></tr>}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </PageShell>
  );
}