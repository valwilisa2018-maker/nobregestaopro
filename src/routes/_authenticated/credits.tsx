import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Coins, Loader2, TrendingDown, CalendarDays, Timer, Sparkles, Download, ShoppingCart, Search,
  AlertCircle, Inbox, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { BuyCreditsModal } from "@/components/buy-credits-modal";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/credits")({
  head: () => ({ meta: [{ title: "Créditos IA — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type Wallet = {
  plan_remaining: number;
  extra_remaining: number;
  total: number;
  resets_at: string | null;
};

type Tx = {
  id: string;
  occurred_at: string;
  agent_id: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_cents: number;
  kind: string;
  status: string;
};

type PlanInfo = { name: string | null; tokens_included: number };
type UsageResp = {
  days: number;
  total_tokens: number;
  total_cost_cents: number;
  by_model: Record<string, number>;
  series: { date: string; tokens: number; cost_cents: number }[];
};

const PAGE_SIZE = 25;

async function authedFetch(path: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("no_session");
  const res = await fetch(path, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body;
}

const fmtTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return n.toLocaleString("pt-BR");
};
const fmtBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR");

function ErrorState({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <AlertCircle className="h-6 w-6 text-rose-400" />
      <p className="text-sm text-rose-400">Falha ao carregar: {msg}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-3 w-3 mr-2" /> Tentar novamente
      </Button>
    </div>
  );
}

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    </div>
  );
}

function Page() {
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [plan, setPlan] = useState<PlanInfo>({ name: null, tokens_included: 0 });
  const [txs, setTxs] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [usage, setUsage] = useState<UsageResp | null>(null);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);
  const [walletLoading, setWalletLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadWallet = async () => {
    setWalletLoading(true); setWalletError(null);
    try {
      const w = (await authedFetch("/api/v1/credits")) as Wallet;
      setWallet(w);
    } catch (e) { setWalletError((e as Error).message); }
    finally { setWalletLoading(false); }
  };

  const loadUsage = async () => {
    setUsageLoading(true); setUsageError(null);
    try {
      const u = (await authedFetch("/api/v1/usage?days=90")) as UsageResp;
      setUsage(u);
    } catch (e) { setUsageError((e as Error).message); }
    finally { setUsageLoading(false); }
  };

  const loadHistory = async (pageIndex: number) => {
    setHistoryLoading(true); setHistoryError(null);
    try {
      const offset = pageIndex * PAGE_SIZE;
      const h = (await authedFetch(`/api/v1/history?limit=${PAGE_SIZE}&offset=${offset}`)) as {
        items: Tx[]; total: number; limit: number; offset: number;
      };
      setTxs(h.items ?? []);
      setTotal(h.total ?? 0);
      setPage(pageIndex);
    } catch (e) { setHistoryError((e as Error).message); }
    finally { setHistoryLoading(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      await Promise.all([loadWallet(), loadUsage(), loadHistory(0)]);
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const [profileRes, agentsRes] = await Promise.all([
          supabase.from("profiles").select("plan_id, plans(name, tokens_included)").eq("id", uid).maybeSingle(),
          supabase.from("agents").select("id, name"),
        ]);
        const p = (profileRes.data as { plans: { name: string; tokens_included: number } | null } | null)?.plans;
        setPlan({ name: p?.name ?? null, tokens_included: p?.tokens_included ?? 0 });
        const map: Record<string, string> = {};
        (agentsRes.data ?? []).forEach((a: { id: string; name: string }) => { map[a.id] = a.name; });
        setAgents(map);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Live refresh: wallet + usage every 30s
  useEffect(() => {
    const id = setInterval(async () => {
      await Promise.all([loadWallet(), loadUsage()]);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const daily = usage?.series ?? [];
  const weekly = useMemo(() => {
    const map: Record<string, { week: string; tokens: number; cost_cents: number }> = {};
    for (const p of daily) {
      const d = new Date(p.date + "T00:00:00Z");
      const day = d.getUTCDay();
      const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      if (!map[key]) map[key] = { week: key, tokens: 0, cost_cents: 0 };
      map[key].tokens += p.tokens; map[key].cost_cents += p.cost_cents;
    }
    return Object.values(map).sort((a, b) => a.week.localeCompare(b.week));
  }, [daily]);
  const monthly = useMemo(() => {
    const map: Record<string, { month: string; tokens: number; cost_cents: number }> = {};
    for (const p of daily) {
      const key = p.date.slice(0, 7);
      if (!map[key]) map[key] = { month: key, tokens: 0, cost_cents: 0 };
      map[key].tokens += p.tokens; map[key].cost_cents += p.cost_cents;
    }
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [daily]);

  const totalAvailable = wallet?.total ?? 0;
  const planIncluded = plan.tokens_included || 1;
  const planPct = Math.max(0, Math.min(100, Math.round(((wallet?.plan_remaining ?? 0) / planIncluded) * 100)));

  const daysToReset = useMemo(() => {
    if (!wallet?.resets_at) return 0;
    return Math.max(0, Math.ceil((new Date(wallet.resets_at).getTime() - Date.now()) / 86400000));
  }, [wallet]);

  const today = new Date().toDateString();
  const consumoHoje = txs
    .filter((t) => t.kind === "usage" && t.status === "ok" && new Date(t.occurred_at).toDateString() === today)
    .reduce((s, t) => s + t.total_tokens, 0);
  const consumoMes = usage?.total_tokens ?? 0;
  const avgDaily = consumoMes / Math.max(1, usage?.days ?? 30);
  const daysLeft = avgDaily > 0 ? Math.floor(totalAvailable / avgDaily) : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return txs;
    return txs.filter((t) => {
      const agent = t.agent_id ? (agents[t.agent_id] ?? "") : "";
      return (
        agent.toLowerCase().includes(q) ||
        (t.model ?? "").toLowerCase().includes(q) ||
        t.kind.toLowerCase().includes(q)
      );
    });
  }, [txs, search, agents]);

  const exportCSV = () => {
    const rows = [
      ["Data", "Agente", "Modelo", "Entrada", "Saida", "Total", "Custo", "Tipo", "Status"],
      ...filtered.map((t) => [
        fmtDate(t.occurred_at),
        t.agent_id ? (agents[t.agent_id] ?? t.agent_id) : "-",
        t.model ?? "-",
        String(t.input_tokens),
        String(t.output_tokens),
        String(t.total_tokens),
        fmtBRL(t.cost_cents),
        t.kind,
        t.status,
      ]),
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `creditos-ia-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Histórico exportado.");
  };

  return (
    <PageShell
      title="Créditos IA"
      description="Controle seu consumo de IA e adquira novos pacotes quando precisar."
      icon={<Coins className="h-6 w-6" />}
      status="ativo"
      actions={
        <Button
          onClick={() => setBuyOpen(true)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30"
        >
          <ShoppingCart className="h-4 w-4 mr-2" /> Comprar Créditos
        </Button>
      }
    >
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Cards topo */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="relative overflow-hidden border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-card to-card xl:col-span-2">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/20 blur-3xl" />
              <CardContent className="relative p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <Sparkles className="h-4 w-4" /> Créditos Disponíveis
                </div>
                <div className="text-4xl font-black tracking-tight text-foreground">{fmtTokens(totalAvailable)}</div>
                <div className="text-xs text-muted-foreground">
                  Plano: <span className="text-foreground font-semibold">{fmtTokens(wallet?.plan_remaining ?? 0)}</span>
                  {" · "}Extras: <span className="text-foreground font-semibold">{fmtTokens(wallet?.extra_remaining ?? 0)}</span>
                </div>
                <Progress value={planPct} className="h-2" />
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {planPct}% do plano ({fmtTokens(plan.tokens_included)}) disponível
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <CalendarDays className="h-4 w-4" /> Plano Atual
                </div>
                <div className="text-lg font-bold text-foreground">{plan.name ?? "Sem plano"}</div>
                <div className="text-xs text-muted-foreground">{fmtTokens(plan.tokens_included)} inclusos</div>
                <Badge variant="outline" className="text-[10px]">Renova em {daysToReset} dias</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <TrendingDown className="h-4 w-4" /> Consumo Hoje
                </div>
                <div className="text-2xl font-black text-foreground">{fmtTokens(consumoHoje)}</div>
                <div className="text-xs text-muted-foreground">tokens</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Timer className="h-4 w-4" /> Consumo no Mês
                </div>
                <div className="text-2xl font-black text-foreground">{fmtTokens(consumoMes)}</div>
                <div className="text-xs text-muted-foreground">
                  Estimativa: {daysLeft === null ? "—" : `~${daysLeft} dias`}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos de consumo */}
          <Card className="mt-6">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Consumo ao longo do tempo</h2>
                  <p className="text-xs text-muted-foreground">Atualiza automaticamente a cada 30s</p>
                </div>
              </div>
              <Tabs defaultValue="daily">
                <TabsList>
                  <TabsTrigger value="daily">Diário</TabsTrigger>
                  <TabsTrigger value="weekly">Semanal</TabsTrigger>
                  <TabsTrigger value="monthly">Mensal</TabsTrigger>
                </TabsList>
                <TabsContent value="daily">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={daily.slice(-30)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" fontSize={10} tickFormatter={(v) => v.slice(5)} />
                        <YAxis fontSize={10} tickFormatter={(v) => fmtTokens(v as number)} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                          formatter={(v: number) => fmtTokens(v)}
                        />
                        <Bar dataKey="tokens" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
                <TabsContent value="weekly">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weekly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="week" fontSize={10} tickFormatter={(v) => v.slice(5)} />
                        <YAxis fontSize={10} tickFormatter={(v) => fmtTokens(v as number)} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                          formatter={(v: number) => fmtTokens(v)}
                        />
                        <Bar dataKey="tokens" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
                <TabsContent value="monthly">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" fontSize={10} />
                        <YAxis fontSize={10} tickFormatter={(v) => fmtTokens(v as number)} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                          formatter={(v: number) => fmtTokens(v)}
                        />
                        <Bar dataKey="tokens" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Histórico */}
          <Card className="mt-6">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Histórico de Consumo</h2>
                  <p className="text-xs text-muted-foreground">
                    {total.toLocaleString("pt-BR")} registros · página {page + 1} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar agente, modelo, tipo…"
                      className="pl-8 w-64"
                    />
                  </div>
                  <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
                    <Download className="h-4 w-4 mr-2" /> CSV
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left py-2 px-2">Data</th>
                      <th className="text-left py-2 px-2">Agente</th>
                      <th className="text-left py-2 px-2">Modelo</th>
                      <th className="text-right py-2 px-2">Entrada</th>
                      <th className="text-right py-2 px-2">Saída</th>
                      <th className="text-right py-2 px-2">Total</th>
                      <th className="text-right py-2 px-2">Custo</th>
                      <th className="text-left py-2 px-2">Tipo</th>
                      <th className="text-left py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum registro.</td></tr>
                    ) : filtered.map((t) => (
                      <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-2 px-2 text-muted-foreground">{fmtDate(t.occurred_at)}</td>
                        <td className="py-2 px-2">{t.agent_id ? (agents[t.agent_id] ?? "—") : "—"}</td>
                        <td className="py-2 px-2 text-muted-foreground">{t.model ?? "—"}</td>
                        <td className="py-2 px-2 text-right">{fmtTokens(t.input_tokens)}</td>
                        <td className="py-2 px-2 text-right">{fmtTokens(t.output_tokens)}</td>
                        <td className="py-2 px-2 text-right font-semibold">{fmtTokens(t.total_tokens)}</td>
                        <td className="py-2 px-2 text-right">{fmtBRL(t.cost_cents)}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className={
                            t.kind === "usage" ? "text-rose-400 border-rose-500/30" :
                            t.kind === "purchase" ? "text-emerald-400 border-emerald-500/30" :
                            "text-primary border-primary/30"
                          }>{t.kind}</Badge>
                        </td>
                        <td className="py-2 px-2">
                          <span className={t.status === "ok" ? "text-emerald-400" : "text-rose-400"}>{t.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => loadHistory(page - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="outline" size="sm"
                  disabled={loading || (page + 1) * PAGE_SIZE >= total}
                  onClick={() => loadHistory(page + 1)}
                >
                  Próxima
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      <BuyCreditsModal open={buyOpen} onOpenChange={setBuyOpen} onPurchased={load} />
    </PageShell>
  );
}