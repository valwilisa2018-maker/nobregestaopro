import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Loader2, Check, Search, Coins, ShieldOff, Sparkles, Clock, DollarSign, Users as UsersIcon, X, Trash2, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/master/activations")({
  head: () => ({ meta: [{ title: "Ativações — Admin Master" }] }),
  component: Page,
});

type Order = { id: string; user_id: string; tokens: number; price_cents: number; status: string; created_at: string; paid_at: string | null };
type Plan = { id: string; name: string; tokens_included: number | null; price_cents: number };
type Profile = {
  id: string; full_name: string | null; phone: string | null; status: string | null;
  plan_id: string | null; plan_expires_at: string | null; plan_activated_at: string | null;
  suspended_reason: string | null;
};
type Wallet = { user_id: string; plan_tokens_remaining: number; extra_tokens_remaining: number };
type PlanRequest = { id: string; user_id: string; plan_id: string; status: string; created_at: string; note: string | null };

const sbRpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nf = (n: number) => n.toLocaleString("pt-BR");

function Kpi({ icon, label, value, sub, tone = "primary" }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "primary" | "amber" | "emerald" | "rose" | "sky" }) {
  const tones: Record<string, string> = {
    primary: "from-primary/20 to-primary/5 text-primary ring-primary/30",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-500 ring-amber-500/30",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500 ring-emerald-500/30",
    rose: "from-rose-500/20 to-rose-500/5 text-rose-500 ring-rose-500/30",
    sky: "from-sky-500/20 to-sky-500/5 text-sky-500 ring-sky-500/30",
  };
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${tones[tone]} opacity-40 pointer-events-none`} />
      <CardContent className="relative p-4 flex items-start gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl bg-background/60 ring-1 ${tones[tone].split(" ").slice(-1)}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-black tracking-tight">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function statusBadge(s: string | null) {
  if (s === "active") return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Ativo</Badge>;
  if (s === "suspended") return <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30">Suspenso</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}

function Page() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [requests, setRequests] = useState<PlanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [activateFor, setActivateFor] = useState<Profile | null>(null);
  const [actPlan, setActPlan] = useState<string>("");
  const [actDays, setActDays] = useState<number>(30);

  const [grantFor, setGrantFor] = useState<Profile | null>(null);
  const [grantTokens, setGrantTokens] = useState<number>(100000);
  const [grantReason, setGrantReason] = useState<string>("");

  const [suspendFor, setSuspendFor] = useState<Profile | null>(null);
  const [suspendReason, setSuspendReason] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const [o, p, pl, w, r] = await Promise.all([
      supabase.from("credit_orders").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("profiles").select("id,full_name,phone,status,plan_id,plan_expires_at,plan_activated_at,suspended_reason").order("created_at", { ascending: false }).limit(1000),
      supabase.from("plans").select("id,name,tokens_included,price_cents").eq("is_active", true).order("sort_order"),
      supabase.from("credit_wallets").select("user_id,plan_tokens_remaining,extra_tokens_remaining"),
      supabase.from("plan_activation_requests").select("id,user_id,plan_id,status,created_at,note").order("created_at", { ascending: false }).limit(500),
    ]);
    setOrders((o.data as Order[]) ?? []);
    setProfiles((p.data as Profile[]) ?? []);
    setPlans((pl.data as Plan[]) ?? []);
    const wm: Record<string, Wallet> = {};
    ((w.data as Wallet[]) ?? []).forEach(x => { wm[x.user_id] = x; });
    setWallets(wm);
    setRequests((r.data as PlanRequest[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => orders.filter(o => o.status === "pending"), [orders]);
  const pendingRequests = useMemo(() => requests.filter(r => r.status === "pending"), [requests]);
  const paid = useMemo(() => orders.filter(o => o.status === "paid"), [orders]);
  const pendingValue = pending.reduce((a, b) => a + b.price_cents, 0);
  const paidValue = paid.reduce((a, b) => a + b.price_cents, 0);
  const activeUsers = profiles.filter(p => p.status === "active").length;
  const suspendedUsers = profiles.filter(p => p.status === "suspended").length;
  const soon = profiles.filter(p => p.plan_expires_at && new Date(p.plan_expires_at).getTime() - Date.now() < 3 * 86400000 && new Date(p.plan_expires_at).getTime() > Date.now()).length;
  const expired = profiles.filter(p => p.plan_expires_at && new Date(p.plan_expires_at).getTime() < Date.now()).length;

  const filteredProfiles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return profiles;
    return profiles.filter(p => (p.full_name ?? "").toLowerCase().includes(t) || (p.phone ?? "").includes(t) || p.id.includes(t));
  }, [profiles, q]);

  const planName = (id: string | null) => plans.find(p => p.id === id)?.name ?? "—";

  const approveOrder = async (id: string) => {
    setBusy(id);
    const { error } = await sbRpc("master_mark_order_paid", { _order_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Pedido aprovado e tokens creditados");
    load();
  };

  const approveRequest = async (r: PlanRequest, days = 30) => {
    setBusy(r.id);
    const { error } = await sbRpc("master_approve_plan_request", { _request_id: r.id, _days: days });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Plano ativado para o cliente");
    load();
  };

  const rejectRequest = async (r: PlanRequest) => {
    if (!confirm("Recusar esta solicitação?")) return;
    setBusy(r.id);
    const { error } = await sbRpc("master_reject_plan_request", { _request_id: r.id, _note: null });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Solicitação recusada");
    load();
  };

  const deleteRequest = async (r: PlanRequest) => {
    if (!confirm("Excluir esta solicitação permanentemente?")) return;
    setBusy(r.id);
    const { error } = await sbRpc("master_delete_plan_request", { _request_id: r.id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Solicitação excluída");
    load();
  };

  const cancelOrder = async (id: string) => {
    if (!confirm("Cancelar este pedido?")) return;
    setBusy(id);
    const { error } = await sbRpc("master_cancel_order", { _order_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Pedido cancelado");
    load();
  };

  const deleteOrder = async (id: string) => {
    if (!confirm("Excluir este pedido permanentemente?")) return;
    setBusy(id);
    const { error } = await sbRpc("master_delete_order", { _order_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Pedido excluído");
    load();
  };

  const cancelPlan = async (p: Profile) => {
    if (!confirm(`Cancelar o plano de ${p.full_name ?? "usuário"}?`)) return;
    setBusy(p.id);
    const { error } = await sbRpc("master_cancel_plan", { _user_id: p.id, _reason: "cancelado pelo admin" });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Plano cancelado");
    load();
  };

  const reactivate = async (p: Profile) => {
    setBusy(p.id);
    const { error } = await sbRpc("master_reactivate_account", { _user_id: p.id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Conta reativada");
    load();
  };

  const doActivate = async () => {
    if (!activateFor || !actPlan) return;
    setBusy("activate");
    const expires = new Date(Date.now() + actDays * 86400000).toISOString();
    const { error } = await sbRpc("master_activate_account", { _user_id: activateFor.id, _plan_id: actPlan, _expires_at: expires });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Conta ativada");
    setActivateFor(null);
    load();
  };

  const doGrant = async () => {
    if (!grantFor || !grantTokens) return;
    setBusy("grant");
    const { error } = await sbRpc("master_grant_credits", { _user_id: grantFor.id, _tokens: grantTokens, _reason: grantReason || "concessão manual" });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${nf(grantTokens)} tokens concedidos`);
    setGrantFor(null); setGrantReason("");
    load();
  };

  const doSuspend = async () => {
    if (!suspendFor) return;
    setBusy("suspend");
    const { error } = await sbRpc("master_suspend_account", { _user_id: suspendFor.id, _reason: suspendReason || "sem motivo" });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Conta suspensa");
    setSuspendFor(null); setSuspendReason("");
    load();
  };

  return (
    <PageShell
      title="Ativações"
      description="Aprove pedidos, ative planos e conceda tokens em um só lugar."
      icon={<Zap className="h-6 w-6" />}
      status="ativo"
      actions={<Button variant="outline" size="sm" onClick={load} disabled={loading}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Atualizar"}</Button>}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={<Clock className="h-5 w-5" />} label="Pedidos pendentes" value={nf(pending.length)} sub={brl(pendingValue)} tone="amber" />
        <Kpi icon={<DollarSign className="h-5 w-5" />} label="Receita aprovada" value={brl(paidValue)} sub={`${nf(paid.length)} pedidos`} tone="emerald" />
        <Kpi icon={<UsersIcon className="h-5 w-5" />} label="Contas ativas" value={nf(activeUsers)} tone="primary" />
        <Kpi icon={<Sparkles className="h-5 w-5" />} label="Vencendo (3d)" value={nf(soon)} tone="sky" />
        <Kpi icon={<Clock className="h-5 w-5" />} label="Vencidas" value={nf(expired)} tone="rose" />
        <Kpi icon={<ShieldOff className="h-5 w-5" />} label="Suspensas" value={nf(suspendedUsers)} tone="rose" />
      </div>

      <Tabs defaultValue="pending" className="mt-6">
        <TabsList>
          <TabsTrigger value="pending">Pedidos pendentes {pending.length > 0 && <Badge className="ml-2 bg-amber-500/20 text-amber-500 border-amber-500/30">{pending.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="requests">Solicitações de plano {pendingRequests.length > 0 && <Badge className="ml-2 bg-sky-500/20 text-sky-500 border-sky-500/30">{pendingRequests.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="users">Ativação de contas</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr><th className="text-left p-3">Data</th><th className="text-left p-3">Cliente</th><th className="text-left p-3">Tokens</th><th className="text-left p-3">Valor</th><th className="text-right p-3">Ação</th></tr>
              </thead>
              <tbody>
                {pending.map(o => {
                  const u = profiles.find(p => p.id === o.user_id);
                  return (
                    <tr key={o.id} className="border-t">
                      <td className="p-3">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                      <td className="p-3"><div className="font-medium">{u?.full_name ?? "—"}</div><div className="text-xs text-muted-foreground font-mono">{o.user_id.slice(0, 8)}</div></td>
                      <td className="p-3"><Coins className="inline h-3.5 w-3.5 mr-1 text-amber-500" />{nf(o.tokens)}</td>
                      <td className="p-3 font-semibold">{brl(o.price_cents)}</td>
                      <td className="p-3 text-right">
                        <div className="inline-flex gap-1">
                        <Button size="sm" onClick={() => approveOrder(o.id)} disabled={busy === o.id} className="bg-emerald-500 hover:bg-emerald-600">
                          {busy === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                          Aprovar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => cancelOrder(o.id)} disabled={busy === o.id} title="Cancelar">
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => deleteOrder(o.id)} disabled={busy === o.id} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pending.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Nenhum pedido pendente. 🎉</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr><th className="text-left p-3">Data</th><th className="text-left p-3">Cliente</th><th className="text-left p-3">Plano solicitado</th><th className="text-left p-3">Valor</th><th className="text-right p-3">Ação</th></tr>
              </thead>
              <tbody>
                {pendingRequests.map(r => {
                  const u = profiles.find(p => p.id === r.user_id);
                  const pl = plans.find(p => p.id === r.plan_id);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                      <td className="p-3"><div className="font-medium">{u?.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{u?.phone ?? r.user_id.slice(0, 8)}</div></td>
                      <td className="p-3"><div className="font-medium">{pl?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{nf(pl?.tokens_included ?? 0)} tokens</div></td>
                      <td className="p-3 font-semibold">{brl(pl?.price_cents ?? 0)}</td>
                      <td className="p-3 text-right space-x-1">
                        <Button size="sm" onClick={() => approveRequest(r, 30)} disabled={busy === r.id} className="bg-emerald-500 hover:bg-emerald-600">
                          {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                          Ativar (30d)
                        </Button>
                        <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => rejectRequest(r)} disabled={busy === r.id}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => deleteRequest(r)} disabled={busy === r.id} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {pendingRequests.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Nenhuma solicitação pendente.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, telefone ou ID…" className="pl-9" />
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr><th className="text-left p-3">Cliente</th><th className="text-left p-3">Status</th><th className="text-left p-3">Plano</th><th className="text-left p-3">Vence</th><th className="text-left p-3">Tokens</th><th className="text-right p-3">Ações</th></tr>
              </thead>
              <tbody>
                {filteredProfiles.slice(0, 200).map(p => {
                  const w = wallets[p.id];
                  const total = (w?.plan_tokens_remaining ?? 0) + (w?.extra_tokens_remaining ?? 0);
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="p-3"><div className="font-medium">{p.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{p.phone ?? p.id.slice(0, 8)}</div></td>
                      <td className="p-3">{statusBadge(p.status)}</td>
                      <td className="p-3">{planName(p.plan_id)}</td>
                      <td className="p-3 text-xs">{p.plan_expires_at ? new Date(p.plan_expires_at).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="p-3 font-mono text-xs">{nf(total)}</td>
                      <td className="p-3 text-right space-x-1">
                        <Button size="sm" variant="default" onClick={() => { setActivateFor(p); setActPlan(p.plan_id ?? plans[0]?.id ?? ""); setActDays(30); }}>
                          <Sparkles className="h-3.5 w-3.5 mr-1" />Ativar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setGrantFor(p); setGrantTokens(100000); }}>
                          <Coins className="h-3.5 w-3.5 mr-1" />Tokens
                        </Button>
                        {p.plan_id && (
                          <Button size="sm" variant="outline" className="text-amber-500" onClick={() => cancelPlan(p)} disabled={busy === p.id} title="Cancelar plano">
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {p.status === "suspended" ? (
                          <Button size="sm" variant="outline" className="text-emerald-500" onClick={() => reactivate(p)} disabled={busy === p.id} title="Reativar">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-rose-500 hover:text-rose-500" onClick={() => setSuspendFor(p)}>
                            <ShieldOff className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredProfiles.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Nenhum cliente.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr><th className="text-left p-3">Data</th><th className="text-left p-3">Cliente</th><th className="text-left p-3">Tokens</th><th className="text-left p-3">Valor</th><th className="text-left p-3">Status</th></tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const u = profiles.find(p => p.id === o.user_id);
                  return (
                    <tr key={o.id} className="border-t">
                      <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                      <td className="p-3">{u?.full_name ?? o.user_id.slice(0, 8)}</td>
                      <td className="p-3">{nf(o.tokens)}</td>
                      <td className="p-3">{brl(o.price_cents)}</td>
                      <td className="p-3">{o.status === "paid" ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Pago</Badge> : <Badge variant="outline">{o.status}</Badge>}</td>
                    </tr>
                  );
                })}
                {orders.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Sem histórico.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Activate dialog */}
      <Dialog open={!!activateFor} onOpenChange={(v) => !v && setActivateFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ativar conta — {activateFor?.full_name ?? ""}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Plano</label>
              <Select value={actPlan} onValueChange={setActPlan}>
                <SelectTrigger><SelectValue placeholder="Escolha um plano" /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {brl(p.price_cents)} · {nf(p.tokens_included ?? 0)} tokens</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Duração (dias)</label>
              <Input type="number" min={1} value={actDays} onChange={e => setActDays(Number(e.target.value))} />
              <p className="text-[11px] text-muted-foreground mt-1">Vence em {new Date(Date.now() + actDays * 86400000).toLocaleDateString("pt-BR")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActivateFor(null)}>Cancelar</Button>
            <Button onClick={doActivate} disabled={busy === "activate" || !actPlan}>{busy === "activate" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant tokens dialog */}
      <Dialog open={!!grantFor} onOpenChange={(v) => !v && setGrantFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conceder tokens — {grantFor?.full_name ?? ""}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Quantidade</label>
              <Input type="number" min={1} value={grantTokens} onChange={e => setGrantTokens(Number(e.target.value))} />
              <div className="flex gap-2 mt-2 flex-wrap">
                {[10000, 50000, 100000, 500000, 1000000].map(v => (
                  <Button key={v} size="sm" variant="outline" onClick={() => setGrantTokens(v)}>{nf(v)}</Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Motivo</label>
              <Input value={grantReason} onChange={e => setGrantReason(e.target.value)} placeholder="Ex: bônus de campanha" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGrantFor(null)}>Cancelar</Button>
            <Button onClick={doGrant} disabled={busy === "grant" || !grantTokens}>{busy === "grant" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conceder"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend dialog */}
      <Dialog open={!!suspendFor} onOpenChange={(v) => !v && setSuspendFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Suspender conta — {suspendFor?.full_name ?? ""}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-xs uppercase text-muted-foreground">Motivo</label>
            <Input value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Descreva o motivo" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendFor(null)}><X className="h-4 w-4 mr-1" />Cancelar</Button>
            <Button variant="destructive" onClick={doSuspend} disabled={busy === "suspend"}>{busy === "suspend" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Suspender"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}