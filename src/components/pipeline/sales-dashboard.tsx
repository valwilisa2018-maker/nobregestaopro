import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, ShoppingBag, TrendingUp, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { formatBRL } from "./types";

type Sale = {
  id: string; contact_name: string; phone: string | null;
  payment_method: string | null; total_cents: number; status: string;
  created_at: string;
};
type Item = { sale_id: string; product_name: string; quantity: number; subtotal_cents: number };

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#ef4444", "#10b981", "#a855f7", "#ec4899"];

export function SalesDashboard() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setLoading(false); return; }
      const [s, i] = await Promise.all([
        supabase.from("sales" as never).select("id,contact_name,phone,payment_method,total_cents,status,created_at").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("sale_items" as never).select("sale_id,product_name,quantity,subtotal_cents").eq("user_id", uid),
      ]);
      setSales(((s.data as unknown) as Sale[]) || []);
      setItems(((i.data as unknown) as Item[]) || []);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const total = sales.reduce((a, b) => a + b.total_cents, 0);
    const count = sales.length;
    const avg = count ? total / count : 0;
    const clients = new Set(sales.map((s) => s.contact_name.toLowerCase())).size;
    return { total, count, avg, clients };
  }, [sales]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach((s) => {
      const d = new Date(s.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(k, (map.get(k) || 0) + s.total_cents);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([k, v]) => ({ month: k, total: v / 100 }));
  }, [sales]);

  const byProduct = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => map.set(i.product_name, (map.get(i.product_name) || 0) + i.subtotal_cents));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 7)
      .map(([name, v]) => ({ name, value: v / 100 }));
  }, [items]);

  const byPayment = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach((s) => map.set(s.payment_method || "Outro", (map.get(s.payment_method || "Outro") || 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [sales]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatCard icon={DollarSign} label="Faturamento" value={formatBRL(stats.total)} tone="emerald" />
        <StatCard icon={ShoppingBag} label="Vendas" value={String(stats.count)} tone="primary" />
        <StatCard icon={TrendingUp} label="Ticket médio" value={formatBRL(stats.avg)} tone="amber" />
        <StatCard icon={Users} label="Clientes" value={String(stats.clients)} tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="p-5">
          <p className="text-sm font-bold mb-3">Faturamento por mês</p>
          {byMonth.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatBRL(v * 100)} />
                <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-5">
          <p className="text-sm font-bold mb-3">Top produtos</p>
          {byProduct.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byProduct} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={110} />
                <Tooltip formatter={(v: number) => formatBRL(v * 100)} />
                <Bar dataKey="value" fill="#22d3ee" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-5">
          <p className="text-sm font-bold mb-3">Formas de pagamento</p>
          {byPayment.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byPayment} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {byPayment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-5">
          <p className="text-sm font-bold mb-3">Últimas vendas</p>
          {sales.length === 0 ? <p className="text-xs text-muted-foreground py-8 text-center">Nenhuma venda registrada.</p> : (
            <div className="divide-y divide-border/50 max-h-[240px] overflow-y-auto">
              {sales.slice(0, 10).map((s) => (
                <div key={s.id} className="py-2 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{s.contact_name}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(s.created_at).toLocaleString("pt-BR")} · {s.payment_method || "—"}</p>
                  </div>
                  <Badge variant="outline" className="tabular-nums">{formatBRL(s.total_cents)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="h-[240px] grid place-items-center text-xs text-muted-foreground">Sem dados ainda</div>;
}

function StatCard({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: "emerald" | "primary" | "amber" | "violet" }) {
  const tones = {
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-400",
    primary: "from-primary/20 to-primary/5 text-primary",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-400",
    violet: "from-violet-500/20 to-violet-500/5 text-violet-400",
  } as const;
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${tones[tone].split(" ").slice(0, 2).join(" ")} opacity-60 pointer-events-none`} />
      <CardContent className="relative p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
            <p className="text-2xl font-black mt-1 tabular-nums truncate">{value}</p>
          </div>
          <div className={`h-9 w-9 shrink-0 grid place-items-center rounded-xl bg-gradient-to-br ${tones[tone]} ring-1 ring-white/10`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}