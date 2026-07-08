import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Users, DollarSign, CreditCard, LifeBuoy, Coins, TrendingUp, ShieldAlert, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/master/")({
  head: () => ({ meta: [{ title: "Dashboard Master — Plataforma" }] }),
  component: Page,
});

type Stats = {
  clients_total: number;
  clients_active: number;
  clients_suspended: number;
  clients_pending: number;
  orders_pending: number;
  orders_paid_month_cents: number;
  tokens_month: number;
  tickets_open: number;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNum(n: number) { return n.toLocaleString("pt-BR"); }

function Page() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const iso = monthStart.toISOString();
      const [profiles, ordersPending, ordersPaid, tokens, tickets] = await Promise.all([
        supabase.from("profiles").select("status", { count: "exact" }),
        supabase.from("credit_orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("credit_orders").select("price_cents").eq("status", "paid").gte("paid_at", iso),
        supabase.from("credit_transactions").select("total_tokens").eq("kind", "usage").gte("occurred_at", iso),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      ]);
      const rows = profiles.data ?? [];
      const s: Stats = {
        clients_total: profiles.count ?? rows.length,
        clients_active: rows.filter((r: { status: string }) => r.status === "active").length,
        clients_suspended: rows.filter((r: { status: string }) => r.status === "suspended").length,
        clients_pending: rows.filter((r: { status: string }) => r.status === "pending").length,
        orders_pending: ordersPending.count ?? 0,
        orders_paid_month_cents: (ordersPaid.data ?? []).reduce((a, b: { price_cents: number }) => a + (b.price_cents ?? 0), 0),
        tokens_month: (tokens.data ?? []).reduce((a, b: { total_tokens: number }) => a + (Number(b.total_tokens) || 0), 0),
        tickets_open: tickets.count ?? 0,
      };
      setStats(s);
      setLoading(false);
    })();
  }, []);

  const cards = stats ? [
    { label: "Clientes ativos", value: fmtNum(stats.clients_active), icon: Users, hint: `${fmtNum(stats.clients_total)} no total` },
    { label: "Contas pendentes", value: fmtNum(stats.clients_pending), icon: ShieldAlert, hint: "aguardando ativação" },
    { label: "Contas suspensas", value: fmtNum(stats.clients_suspended), icon: ShieldAlert, hint: "bloqueadas" },
    { label: "Receita do mês", value: formatBRL(stats.orders_paid_month_cents), icon: DollarSign, hint: "pedidos pagos" },
    { label: "Pedidos pendentes", value: fmtNum(stats.orders_pending), icon: CreditCard, hint: "aguardando aprovação" },
    { label: "Tokens IA (mês)", value: fmtNum(stats.tokens_month), icon: Coins, hint: "consumidos" },
    { label: "Tickets abertos", value: fmtNum(stats.tickets_open), icon: LifeBuoy, hint: "suporte" },
    { label: "Crescimento", value: "—", icon: TrendingUp, hint: "em breve" },
  ] : [];

  return (
    <PageShell title="Dashboard Master" description="Visão geral da plataforma" icon={<Package className="h-6 w-6" />} status="ativo">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : cards.map((c) => (
              <Card key={c.label}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className="text-2xl font-black mt-1">{c.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{c.hint}</p>
                    </div>
                    <div className="h-9 w-9 grid place-items-center rounded-lg bg-primary/10 text-primary">
                      <c.icon className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>
    </PageShell>
  );
}