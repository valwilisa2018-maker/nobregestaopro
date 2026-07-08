import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Loader2, Search, Ban, CheckCircle2, Coins, Download } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { toCSV, downloadCSV } from "@/lib/csv";

// RPCs criadas na migração recente; tipos serão regenerados após approval
const sbRpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string, args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

export const Route = createFileRoute("/master/clients")({
  head: () => ({ meta: [{ title: "Clientes — Admin Master" }] }),
  component: Page,
});

type Client = {
  id: string;
  full_name: string | null;
  phone: string | null;
  status: "active" | "suspended" | "pending";
  plan_id: string | null;
  plan_activated_at: string | null;
  plan_expires_at: string | null;
  suspended_reason: string | null;
  created_at: string;
};
type Plan = { id: string; name: string };

function statusBadge(s: string) {
  if (s === "active") return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Ativo</Badge>;
  if (s === "suspended") return <Badge variant="destructive">Suspenso</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}

function Page() {
  const [items, setItems] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "pending">("all");
  const [selected, setSelected] = useState<Client | null>(null);
  const [action, setAction] = useState<"activate" | "suspend" | "credits" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("plans").select("id,name").order("sort_order"),
    ]);
    setLoading(false);
    if (c.error) toast.error(c.error.message);
    setItems((c.data as Client[]) ?? []);
    setPlans((p.data as Plan[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.full_name ?? "").toLowerCase().includes(q)
      || (c.phone ?? "").includes(search) || c.id.includes(search);
  });

  const exportCSV = () => {
    const rows = filtered.map((c) => ({
      id: c.id,
      nome: c.full_name ?? "",
      telefone: c.phone ?? "",
      status: c.status,
      plano: plans.find((p) => p.id === c.plan_id)?.name ?? "",
      ativado_em: c.plan_activated_at ?? "",
      expira_em: c.plan_expires_at ?? "",
      criado_em: c.created_at,
    }));
    downloadCSV(`clientes-${new Date().toISOString().slice(0, 10)}`, toCSV(rows));
  };

  return (
    <PageShell
      title="Clientes da plataforma"
      description="Gerencie contas, ative planos e credite tokens manualmente."
      icon={<Users className="h-6 w-6" />}
      status="ativo"
      actions={
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="suspended">Suspensos</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-64" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Cliente</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Plano</th>
                  <th className="text-left p-3">Expira em</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/20">
                    <td className="p-3">
                      <div className="font-medium">{c.full_name || "Sem nome"}</div>
                      <div className="text-xs text-muted-foreground">{c.phone || c.id.slice(0, 8)}</div>
                    </td>
                    <td className="p-3">{statusBadge(c.status)}</td>
                    <td className="p-3">{plans.find((p) => p.id === c.plan_id)?.name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3">{c.plan_expires_at ? new Date(c.plan_expires_at).toLocaleDateString("pt-BR") : <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setSelected(c); setAction("activate"); }}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Ativar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setSelected(c); setAction("credits"); }}>
                          <Coins className="h-3.5 w-3.5" /> Créditos
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setSelected(c); setAction("suspend"); }}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {selected && action && (
        <ActionDialog
          client={selected}
          plans={plans}
          action={action}
          onClose={() => { setSelected(null); setAction(null); }}
          onDone={() => { setSelected(null); setAction(null); load(); }}
        />
      )}
    </PageShell>
  );
}

function ActionDialog({ client, plans, action, onClose, onDone }: {
  client: Client; plans: Plan[]; action: "activate" | "suspend" | "credits";
  onClose: () => void; onDone: () => void;
}) {
  const [planId, setPlanId] = useState<string>(client.plan_id ?? "");
  const [expiresDays, setExpiresDays] = useState("30");
  const [reason, setReason] = useState("");
  const [tokens, setTokens] = useState("100000");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (action === "activate") {
        const expires = new Date(Date.now() + Number(expiresDays) * 86400000).toISOString();
        const { error } = await sbRpc("master_activate_account", {
          _user_id: client.id, _plan_id: planId || null, _expires_at: expires,
        });
        if (error) throw error;
        toast.success("Conta ativada");
      } else if (action === "suspend") {
        const { error } = await sbRpc("master_suspend_account", { _user_id: client.id, _reason: reason });
        if (error) throw error;
        toast.success("Conta suspensa");
      } else if (action === "credits") {
        const { error } = await sbRpc("master_grant_credits", {
          _user_id: client.id, _tokens: Number(tokens), _reason: reason || "manual grant",
        });
        if (error) throw error;
        toast.success("Créditos adicionados");
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setBusy(false); }
  };

  const titles = { activate: "Ativar conta", suspend: "Suspender conta", credits: "Adicionar créditos" };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[action]}</DialogTitle>
          <DialogDescription>{client.full_name || client.id.slice(0, 8)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {action === "activate" && (<>
            <div className="space-y-2"><Label>Plano</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-2"><Label>Válido por (dias)</Label>
              <Input type="number" value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} /></div>
          </>)}
          {action === "suspend" && (
            <div className="space-y-2"><Label>Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: pagamento em atraso" /></div>
          )}
          {action === "credits" && (<>
            <div className="space-y-2"><Label>Tokens</Label>
              <Input type="number" value={tokens} onChange={(e) => setTokens(e.target.value)} /></div>
            <div className="space-y-2"><Label>Observação</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do crédito" /></div>
          </>)}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={run} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}