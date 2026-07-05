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
} from "lucide-react";
import { toast } from "sonner";
import { BuyCreditsModal } from "@/components/buy-credits-modal";

export const Route = createFileRoute("/_authenticated/credits")({
  head: () => ({ meta: [{ title: "Créditos IA — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type Wallet = {
  user_id: string;
  plan_tokens_remaining: number;
  extra_tokens_remaining: number;
  plan_tokens_reset_at: string;
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

const fmtTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return n.toLocaleString("pt-BR");
};
const fmtBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR");

function Page() {
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [plan, setPlan] = useState<PlanInfo>({ name: null, tokens_included: 0 });
  const [txs, setTxs] = useState<Tx[]>([]);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setLoading(false); return; }

    // ensure wallet exists / cycle refresh
    await supabase.rpc("ensure_credit_wallet", { _user_id: uid });

    const [walletRes, profileRes, txsRes, agentsRes] = await Promise.all([
      supabase.from("credit_wallets").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("profiles").select("plan_id, plans(name, tokens_included)").eq("id", uid).maybeSingle(),
      supabase.from("credit_transactions").select("*").eq("user_id", uid).order("occurred_at", { ascending: false }).limit(200),
      supabase.from("agents").select("id, name"),
    ]);
    setLoading(false);
    if (walletRes.data) setWallet(walletRes.data as unknown as Wallet);
    const p = (profileRes.data as { plans: { name: string; tokens_included: number } | null } | null)?.plans;
    setPlan({ name: p?.name ?? null, tokens_included: p?.tokens_included ?? 0 });
    setTxs((txsRes.data ?? []) as unknown as Tx[]);
    const map: Record<string, string> = {};
    (agentsRes.data ?? []).forEach((a: { id: string; name: string }) => { map[a.id] = a.name; });
    setAgents(map);
  };

  useEffect(() => { load(); }, []);

  const totalAvailable = (wallet?.plan_tokens_remaining ?? 0) + (wallet?.extra_tokens_remaining ?? 0);
  const planIncluded = plan.tokens_included || 1;
  const planPct = Math.max(0, Math.min(100, Math.round(((wallet?.plan_tokens_remaining ?? 0) / planIncluded) * 100)));

  const daysToReset = useMemo(() => {
    if (!wallet) return 0;
    return Math.max(0, Math.ceil((new Date(wallet.plan_tokens_reset_at).getTime() - Date.now()) / 86400000));
  }, [wallet]);

  const today = new Date().toDateString();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

  const consumoHoje = txs
    .filter((t) => t.kind === "usage" && t.status === "ok" && new Date(t.occurred_at).toDateString() === today)
    .reduce((s, t) => s + t.total_tokens, 0);
  const consumoMes = txs
    .filter((t) => t.kind === "usage" && t.status === "ok" && new Date(t.occurred_at) >= monthStart)
    .reduce((s, t) => s + t.total_tokens, 0);

  const avgDaily = consumoMes / Math.max(1, new Date().getDate());
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
                  Plano: <span className="text-foreground font-semibold">{fmtTokens(wallet?.plan_tokens_remaining ?? 0)}</span>
                  {" · "}Extras: <span className="text-foreground font-semibold">{fmtTokens(wallet?.extra_tokens_remaining ?? 0)}</span>
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

          {/* Histórico */}
          <Card className="mt-6">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Histórico de Consumo</h2>
                  <p className="text-xs text-muted-foreground">Últimos 200 registros</p>
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
            </CardContent>
          </Card>
        </>
      )}
      <BuyCreditsModal open={buyOpen} onOpenChange={setBuyOpen} onPurchased={load} />
    </PageShell>
  );
}