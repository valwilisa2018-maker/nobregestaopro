import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, DollarSign, ShoppingBag, TrendingUp, Users, Clock, CheckCircle2, AlertCircle, Wallet, Trophy, Search, Download, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend } from "recharts";
import { formatBRL } from "./types";
import { toast } from "sonner";

type Sale = {
  id: string; contact_name: string; phone: string | null;
  payment_method: string | null; total_cents: number; status: string;
  created_at: string;
  company?: string | null; document?: string | null;
  invoice_number?: string | null; note?: string | null;
  payment_status?: string | null; down_payment_cents?: number | null;
  seller_name?: string | null;
};
type Item = { sale_id: string; product_name: string; quantity: number; subtotal_cents: number };

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#ef4444", "#10b981", "#a855f7", "#ec4899"];
const RANGES = [
  { key: "7d", label: "7 dias", days: 7 },
  { key: "30d", label: "30 dias", days: 30 },
  { key: "90d", label: "90 dias", days: 90 },
  { key: "12m", label: "12 meses", days: 365 },
  { key: "all", label: "Tudo", days: 0 },
] as const;

export function SalesDashboard() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30d");
  const [query, setQuery] = useState("");
  const [sellerFilter, setSellerFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setLoading(false); return; }
      const [s, i] = await Promise.all([
        supabase.from("sales" as never).select("id,contact_name,phone,payment_method,total_cents,status,created_at,company,document,invoice_number,note,payment_status,down_payment_cents,seller_name").eq("user_id", uid).is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("sale_items" as never).select("sale_id,product_name,quantity,subtotal_cents").eq("user_id", uid),
      ]);
      const salesRows = ((s.data as unknown) as Sale[]) || [];
      const activeIds = new Set(salesRows.map((r) => r.id));
      const itemsRows = (((i.data as unknown) as Item[]) || []).filter((it) => activeIds.has(it.sale_id));
      setSales(salesRows);
      setItems(itemsRows);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    const cutoff = r.days > 0 ? Date.now() - r.days * 86400000 : 0;
    const q = query.trim().toLowerCase();
    return sales.filter((s) => {
      if (cutoff && new Date(s.created_at).getTime() < cutoff) return false;
      if (sellerFilter !== "all") {
        const sn = (s.seller_name || "").trim();
        if (sellerFilter === "__none__" ? sn !== "" : sn !== sellerFilter) return false;
      }
      if (!q) return true;
      return [s.contact_name, s.company, s.document, s.phone, s.invoice_number]
        .some((f) => (f || "").toLowerCase().includes(q));
    });
  }, [sales, range, query, sellerFilter]);

  const sellerOptions = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => { const n = (s.seller_name || "").trim(); if (n) set.add(n); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sales]);

  const bySeller = useMemo(() => {
    const map = new Map<string, { rev: number; count: number }>();
    filtered.forEach((s) => {
      const k = (s.seller_name || "").trim() || "Sem vendedor";
      const cur = map.get(k) || { rev: 0, count: 0 };
      map.set(k, { rev: cur.rev + s.total_cents, count: cur.count + 1 });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].rev - a[1].rev)
      .map(([name, v]) => ({ name, value: v.rev / 100, count: v.count }));
  }, [filtered]);

  const stats = useMemo(() => {
    const total = filtered.reduce((a, b) => a + b.total_cents, 0);
    const count = filtered.length;
    const avg = count ? total / count : 0;
    const clients = new Set(filtered.map((s) => s.contact_name.toLowerCase())).size;
    const paid = filtered.filter((s) => s.payment_status === "paid").reduce((a, b) => a + b.total_cents, 0);
    const partial = filtered.filter((s) => s.payment_status === "partial");
    const partialReceived = partial.reduce((a, b) => a + (b.down_payment_cents || 0), 0);
    const partialPending = partial.reduce((a, b) => a + (b.total_cents - (b.down_payment_cents || 0)), 0);
    const pending = filtered.filter((s) => s.payment_status === "pending").reduce((a, b) => a + b.total_cents, 0);
    const received = paid + partialReceived;
    const receivable = partialPending + pending;
    return { total, count, avg, clients, received, receivable, paid, partialCount: partial.length, pendingCount: filtered.filter((s) => s.payment_status === "pending").length };
  }, [filtered]);

  const byDay = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    filtered.forEach((s) => {
      const d = new Date(s.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const cur = map.get(k) || { total: 0, count: 0 };
      map.set(k, { total: cur.total + s.total_cents, count: cur.count + 1 });
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ day: k.slice(5), total: v.total / 100, count: v.count }));
  }, [filtered]);

  const byProduct = useMemo(() => {
    const ids = new Set(filtered.map((s) => s.id));
    const map = new Map<string, { rev: number; qty: number }>();
    items.filter((i) => ids.has(i.sale_id)).forEach((i) => {
      const cur = map.get(i.product_name) || { rev: 0, qty: 0 };
      map.set(i.product_name, { rev: cur.rev + i.subtotal_cents, qty: cur.qty + i.quantity });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].rev - a[1].rev).slice(0, 8)
      .map(([name, v]) => ({ name, value: v.rev / 100, qty: v.qty }));
  }, [items, filtered]);

  const byPayment = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((s) => map.set(s.payment_method || "Outro", (map.get(s.payment_method || "Outro") || 0) + s.total_cents));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: value / 100 }));
  }, [filtered]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((s) => {
      const k = s.payment_status === "paid" ? "Pago" : s.payment_status === "partial" ? "Parcial" : s.payment_status === "pending" ? "Pendente" : "Outro";
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const topClients = useMemo(() => {
    const map = new Map<string, { rev: number; count: number; company: string | null }>();
    filtered.forEach((s) => {
      const k = s.contact_name;
      const cur = map.get(k) || { rev: 0, count: 0, company: s.company || null };
      map.set(k, { rev: cur.rev + s.total_cents, count: cur.count + 1, company: cur.company || s.company || null });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].rev - a[1].rev).slice(0, 6)
      .map(([name, v]) => ({ name, ...v }));
  }, [filtered]);

  const exportCsv = () => {
    const header = ["Data","Cliente","Empresa","CPF/CNPJ","Telefone","Vendedor","Pagamento","Status","Nota","Total","Entrada"];
    const rows = filtered.map((s) => [
      new Date(s.created_at).toLocaleString("pt-BR"),
      s.contact_name, s.company || "", s.document || "", s.phone || "",
      s.seller_name || "",
      s.payment_method || "", s.payment_status || "", s.invoice_number || "",
      (s.total_cents / 100).toFixed(2).replace(".", ","),
      ((s.down_payment_cents || 0) / 100).toFixed(2).replace(".", ","),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `vendas-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const deleteSale = async (s: Sale) => {
    if (!confirm(`Excluir a venda de ${s.contact_name} (${formatBRL(s.total_cents)})? Esta ação não pode ser desfeita.`)) return;
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;
    const { error } = await supabase.from("sales" as never).update({ deleted_at: new Date().toISOString() } as never).eq("id", s.id).eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    const removedItems = items.filter((it) => it.sale_id === s.id);
    setSales((prev) => prev.filter((x) => x.id !== s.id));
    toast.success("Venda excluída", {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error: e2 } = await supabase.from("sales" as never).update({ deleted_at: null } as never).eq("id", s.id).eq("user_id", uid);
          if (e2) { toast.error(e2.message); return; }
          setSales((prev) => [s, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at)));
          setItems((prev) => [...prev, ...removedItems]);
          toast.success("Venda restaurada");
        },
      },
      duration: 8000,
    });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50 border border-border/50">
          {RANGES.map((r) => (
            <Button key={r.key} size="sm" variant={range === r.key ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setRange(r.key)}>
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 flex-1 md:flex-none md:min-w-[320px]">
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
          >
            <option value="all">Todos os vendedores</option>
            <option value="__none__">Sem vendedor</option>
            {sellerOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Buscar cliente, empresa, doc…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <StatCard icon={DollarSign} label="Faturamento" value={formatBRL(stats.total)} tone="emerald" />
        <StatCard icon={ShoppingBag} label="Vendas" value={String(stats.count)} tone="primary" />
        <StatCard icon={TrendingUp} label="Ticket médio" value={formatBRL(stats.avg)} tone="amber" />
        <StatCard icon={Users} label="Clientes" value={String(stats.clients)} tone="violet" />
        <StatCard icon={CheckCircle2} label="Recebido" value={formatBRL(stats.received)} tone="emerald" />
        <StatCard icon={Clock} label="A receber" value={formatBRL(stats.receivable)} tone="amber" />
        <StatCard icon={Wallet} label="Parciais" value={String(stats.partialCount)} tone="primary" />
        <StatCard icon={AlertCircle} label="Pendentes" value={String(stats.pendingCount)} tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">Evolução do faturamento</p>
            <Badge variant="outline" className="text-[10px]">{byDay.length} pts</Badge>
          </div>
          {byDay.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={byDay}>
                <defs>
                  <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, k: string) => k === "total" ? formatBRL(v * 100) : v} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area name="Faturamento" type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fill="url(#gradRev)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-5">
          <p className="text-sm font-bold mb-3">Status de pagamento</p>
          {byStatus.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2} label>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-5">
          <p className="text-sm font-bold mb-3">Top produtos</p>
          {byProduct.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
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
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byPayment}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatBRL(v * 100)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {byPayment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-400" /> Top clientes</p>
          </div>
          {topClients.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Sem clientes ainda.</p>
          ) : (
            <div className="divide-y divide-border/50 max-h-[260px] overflow-y-auto">
              {topClients.map((c, idx) => (
                <div key={c.name} className="py-2 flex items-center gap-3">
                  <div className={`h-7 w-7 shrink-0 grid place-items-center rounded-full text-[11px] font-black ${idx === 0 ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground"}`}>{idx + 1}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.company || `${c.count} venda(s)`}</p>
                  </div>
                  <Badge variant="outline" className="tabular-nums">{formatBRL(c.rev)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>

        <Card className="lg:col-span-3"><CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">Faturamento por vendedor</p>
            <Badge variant="outline" className="text-[10px]">{bySeller.length} vendedor(es)</Badge>
          </div>
          {bySeller.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bySeller}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, k: string) => k === "value" ? formatBRL(v * 100) : v} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Faturamento" dataKey="value" radius={[6, 6, 0, 0]}>
                  {bySeller.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">Registro de vendas</p>
            <Badge variant="outline">{filtered.length} no período</Badge>
          </div>
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Nenhuma venda registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Empresa</th>
                    <th className="py-2 pr-3">CPF/CNPJ</th>
                    <th className="py-2 pr-3">Telefone</th>
                    <th className="py-2 pr-3">Vendedor</th>
                    <th className="py-2 pr-3">Pagamento</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Nota</th>
                    <th className="py-2 pr-3">Produtos</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filtered.map((s) => {
                    const prods = items.filter((it) => it.sale_id === s.id);
                    const st = s.payment_status;
                    const stLabel = st === "paid" ? "Pago" : st === "partial" ? "Parcial" : st === "pending" ? "Pendente" : "—";
                    const stCls = st === "paid" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                      : st === "partial" ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                      : st === "pending" ? "bg-red-500/15 text-red-500 border-red-500/30"
                      : "";
                    return (
                      <tr key={s.id} className="hover:bg-muted/30">
                        <td className="py-2 pr-3 whitespace-nowrap text-[12px]">{new Date(s.created_at).toLocaleString("pt-BR")}</td>
                        <td className="py-2 pr-3 font-semibold">{s.contact_name}</td>
                        <td className="py-2 pr-3">{s.company || "—"}</td>
                        <td className="py-2 pr-3 tabular-nums">{s.document || "—"}</td>
                        <td className="py-2 pr-3">{s.phone || "—"}</td>
                        <td className="py-2 pr-3">{s.seller_name || "—"}</td>
                        <td className="py-2 pr-3">{s.payment_method || "—"}</td>
                        <td className="py-2 pr-3">
                          {st ? <Badge variant="outline" className={stCls}>{stLabel}</Badge> : "—"}
                          {st === "partial" && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Entrada: {formatBRL(s.down_payment_cents || 0)}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3">{s.invoice_number || "—"}</td>
                        <td className="py-2 pr-3 max-w-[240px] truncate" title={prods.map((p) => `${p.quantity}x ${p.product_name}`).join(", ")}>
                          {prods.map((p) => `${p.quantity}x ${p.product_name}`).join(", ") || "—"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums font-bold text-primary">{formatBRL(s.total_cents)}</td>
                        <td className="py-2 pr-3 text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteSale(s)} title="Excluir venda">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
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