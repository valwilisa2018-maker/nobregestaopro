import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck, Building2, Plus, Pencil, Trash2, Loader2, DollarSign,
  Ban, PlayCircle, PauseCircle, TrendingUp, AlertTriangle, CheckCircle2, Receipt, Lock,
} from "lucide-react";

import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isSuperAdmin, formatCurrency } from "@/lib/auth";
import {
  upsertMasterAccount, deleteMasterAccount, changeAccountStatus,
  upsertAccountInvoice, markInvoicePaid, deleteAccountInvoice, generateMonthlyInvoices,
} from "@/lib/master.functions";
import { isMasterUnlocked, lockMaster } from "@/lib/master-gate.functions";

export const Route = createFileRoute("/_authenticated/master")({
  beforeLoad: async ({ location }) => {
    const res = await isMasterUnlocked();
    if (!res.unlocked) {
      throw redirect({
        to: "/master-login",
        search: { redirect: location.pathname },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Admin Master — Gestão Nobre MKT" },
      { name: "description", content: "Painel do dono da plataforma: contas de clientes, planos ativos e financeiro consolidado." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MasterPage,
});

type MasterAccount = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  document: string | null;
  plan_id: string | null;
  custom_price_cents: number | null;
  status: "trial" | "active" | "past_due" | "suspended" | "canceled";
  billing_day: number;
  activated_at: string | null;
  next_billing_at: string | null;
  notes: string | null;
  created_at: string;
  plans?: { name: string; price_cents: number } | null;
};

type Invoice = {
  id: string;
  account_id: string;
  amount_cents: number;
  reference_month: string;
  due_date: string;
  paid_at: string | null;
  payment_method: string | null;
  status: "pending" | "paid" | "overdue" | "canceled" | "refunded";
  notes: string | null;
  master_accounts?: { name: string } | null;
};

type Plan = { id: string; name: string; price_cents: number };

const STATUS_LABEL: Record<MasterAccount["status"], string> = {
  trial: "Avaliação", active: "Ativa", past_due: "Em atraso",
  suspended: "Suspensa", canceled: "Cancelada",
};
const STATUS_VARIANT: Record<MasterAccount["status"], "default" | "secondary" | "destructive" | "outline"> = {
  trial: "secondary", active: "default", past_due: "destructive",
  suspended: "destructive", canceled: "outline",
};

const INV_STATUS_LABEL: Record<Invoice["status"], string> = {
  pending: "Pendente", paid: "Paga", overdue: "Vencida",
  canceled: "Cancelada", refunded: "Estornada",
};
const INV_STATUS_VARIANT: Record<Invoice["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary", paid: "default", overdue: "destructive",
  canceled: "outline", refunded: "outline",
};

function MasterPage() {
  const { roles } = useAuth();
  const qc = useQueryClient();

  const accountsQ = useQuery({
    queryKey: ["master_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("master_accounts" as any)
        .select("*, plans(name, price_cents)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MasterAccount[];
    },
  });

  const invoicesQ = useQuery({
    queryKey: ["master_invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("master_account_invoices" as any)
        .select("*, master_accounts(name)")
        .order("due_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Invoice[];
    },
  });

  const plansQ = useQuery({
    queryKey: ["plans_min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans" as any).select("id, name, price_cents").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });

  const [editing, setEditing] = useState<MasterAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MasterAccount | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<MasterAccount | null>(null);

  const statusFn = useServerFn(changeAccountStatus);
  const deleteAccFn = useServerFn(deleteMasterAccount);
  const markPaidFn = useServerFn(markInvoicePaid);
  const deleteInvFn = useServerFn(deleteAccountInvoice);
  const generateFn = useServerFn(generateMonthlyInvoices);

  const stats = useMemo(() => {
    const accs = accountsQ.data ?? [];
    const invs = invoicesQ.data ?? [];
    const priceOf = (a: MasterAccount) =>
      (a.custom_price_cents ?? a.plans?.price_cents ?? 0) / 100;

    const activeAccs = accs.filter((a) => a.status === "active");
    const mrr = activeAccs.reduce((sum, a) => sum + priceOf(a), 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const receivedThisMonth = invs
      .filter((i) => i.status === "paid" && i.paid_at && new Date(i.paid_at) >= monthStart)
      .reduce((s, i) => s + i.amount_cents / 100, 0);

    const overdue = invs.filter((i) =>
      (i.status === "pending" || i.status === "overdue") &&
      new Date(i.due_date) < now
    );
    const overdueAmount = overdue.reduce((s, i) => s + i.amount_cents / 100, 0);

    return {
      mrr,
      receivedThisMonth,
      overdueAmount,
      overdueCount: overdue.length,
      totalAccounts: accs.length,
      activeCount: activeAccs.length,
      pastDueCount: accs.filter((a) => a.status === "past_due").length,
      suspendedCount: accs.filter((a) => a.status === "suspended").length,
    };
  }, [accountsQ.data, invoicesQ.data]);

  if (!isSuperAdmin(roles)) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Acesso restrito
          </CardTitle>
          <CardDescription>
            Esta área é exclusiva do dono da plataforma (super-admin).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleStatus = async (a: MasterAccount, status: MasterAccount["status"]) => {
    try {
      await statusFn({ data: { id: a.id, status } });
      toast.success(`Conta ${a.name} → ${STATUS_LABEL[status]}`);
      qc.invalidateQueries({ queryKey: ["master_accounts"] });
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  const handleGenerateMonth = async () => {
    const now = new Date();
    const ref = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    try {
      const res: any = await generateFn({ data: { reference_month: ref } });
      toast.success(`${res.created} fatura(s) gerada(s) para o mês`);
      qc.invalidateQueries({ queryKey: ["master_invoices"] });
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Plataforma"
        icon={ShieldCheck}
        title="Admin Master"
        description="Controle das contas de clientes, planos ativos e financeiro consolidado da plataforma."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerateMonth}>
              <Receipt className="mr-2 h-4 w-4" /> Gerar faturas do mês
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova conta
            </Button>
            <LockMasterButton />
          </div>
        }
      />

      {/* KPIs financeiros */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="MRR (receita mensal)"
          value={formatCurrency(stats.mrr)}
          hint={`${stats.activeCount} conta(s) ativa(s)`}
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Recebido este mês"
          value={formatCurrency(stats.receivedThisMonth)}
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          label="Inadimplência"
          value={formatCurrency(stats.overdueAmount)}
          hint={`${stats.overdueCount} fatura(s) vencida(s)`}
          highlight={stats.overdueCount > 0}
        />
        <KpiCard
          icon={<Building2 className="h-4 w-4" />}
          label="Total de contas"
          value={String(stats.totalAccounts)}
          hint={`${stats.pastDueCount} em atraso · ${stats.suspendedCount} suspensa(s)`}
        />
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Contas</TabsTrigger>
          <TabsTrigger value="invoices">Faturas</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Contas gerenciadas</CardTitle>
              <CardDescription>
                Todas as agências/clientes que usam a plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {accountsQ.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (accountsQ.data ?? []).length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Nenhuma conta cadastrada ainda. Clique em <b>Nova conta</b>.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Valor/mês</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Próx. cobrança</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(accountsQ.data ?? []).map((a) => {
                      const price = (a.custom_price_cents ?? a.plans?.price_cents ?? 0) / 100;
                      return (
                        <TableRow key={a.id}>
                          <TableCell>
                            <div className="font-medium">{a.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {a.contact_email ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {a.plans?.name ?? <span className="text-muted-foreground">Sem plano</span>}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(price)}
                            {a.custom_price_cents != null && (
                              <Badge variant="outline" className="ml-2 text-[10px]">custom</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {a.next_billing_at
                              ? new Date(a.next_billing_at).toLocaleDateString("pt-BR")
                              : `dia ${a.billing_day}`}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">Ações</Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditing(a)}>
                                  <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setInvoiceFor(a)}>
                                  <Receipt className="mr-2 h-3.5 w-3.5" /> Nova fatura
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {a.status !== "active" && (
                                  <DropdownMenuItem onClick={() => handleStatus(a, "active")}>
                                    <PlayCircle className="mr-2 h-3.5 w-3.5 text-primary" /> Ativar
                                  </DropdownMenuItem>
                                )}
                                {a.status !== "suspended" && a.status !== "canceled" && (
                                  <DropdownMenuItem onClick={() => handleStatus(a, "suspended")}>
                                    <PauseCircle className="mr-2 h-3.5 w-3.5" /> Suspender
                                  </DropdownMenuItem>
                                )}
                                {a.status !== "canceled" && (
                                  <DropdownMenuItem onClick={() => handleStatus(a, "canceled")}>
                                    <Ban className="mr-2 h-3.5 w-3.5" /> Cancelar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setConfirmDelete(a)}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Faturas das contas</CardTitle>
              <CardDescription>
                Todas as cobranças geradas para as contas de clientes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoicesQ.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (invoicesQ.data ?? []).length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Nenhuma fatura ainda. Use <b>Gerar faturas do mês</b> ou crie uma manual pela conta.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>Referência</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoicesQ.data ?? []).map((i) => {
                      const isOverdue =
                        (i.status === "pending" || i.status === "overdue") &&
                        new Date(i.due_date) < new Date();
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">
                            {i.master_accounts?.name ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(i.reference_month).toLocaleDateString("pt-BR", {
                              month: "long", year: "numeric",
                            })}
                          </TableCell>
                          <TableCell className={`text-sm ${isOverdue ? "text-destructive font-medium" : ""}`}>
                            {new Date(i.due_date).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(i.amount_cents / 100)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={isOverdue ? "destructive" : INV_STATUS_VARIANT[i.status]}>
                              {isOverdue ? "Vencida" : INV_STATUS_LABEL[i.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {i.status !== "paid" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    try {
                                      await markPaidFn({ data: { id: i.id } });
                                      toast.success("Fatura marcada como paga");
                                      qc.invalidateQueries({ queryKey: ["master_invoices"] });
                                    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
                                  }}
                                >
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Pagar
                                </Button>
                              )}
                              <Button
                                size="sm" variant="ghost"
                                className="text-destructive"
                                onClick={async () => {
                                  try {
                                    await deleteInvFn({ data: { id: i.id } });
                                    toast.success("Removida");
                                    qc.invalidateQueries({ queryKey: ["master_invoices"] });
                                  } catch (e: any) { toast.error(e?.message ?? "Erro"); }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AccountFormDialog
        open={creating || !!editing}
        account={editing}
        plans={plansQ.data ?? []}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["master_accounts"] })}
      />

      <InvoiceFormDialog
        open={!!invoiceFor}
        account={invoiceFor}
        onClose={() => setInvoiceFor(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["master_invoices"] })}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta <b>{confirmDelete?.name}</b> e todas as suas faturas serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await deleteAccFn({ data: { id: confirmDelete.id } });
                  toast.success("Conta removida");
                  qc.invalidateQueries({ queryKey: ["master_accounts"] });
                  qc.invalidateQueries({ queryKey: ["master_invoices"] });
                  setConfirmDelete(null);
                } catch (e: any) { toast.error(e?.message ?? "Erro"); }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({
  icon, label, value, hint, highlight,
}: { icon: React.ReactNode; label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-destructive/50" : ""}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          {icon} {label}
        </div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function AccountFormDialog({
  open, account, plans, onClose, onSaved,
}: {
  open: boolean;
  account: MasterAccount | null;
  plans: Plan[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(upsertMasterAccount);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => initAccountForm(account));

  useMemo(() => {
    if (open) setForm(initAccountForm(account));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id]);

  const submit = async () => {
    setSaving(true);
    try {
      const custom = form.custom_price_reais.trim();
      await save({
        data: {
          id: account?.id,
          name: form.name.trim(),
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          document: form.document || null,
          plan_id: form.plan_id || null,
          custom_price_cents: custom
            ? Math.round(Number(custom.replace(",", ".")) * 100)
            : null,
          status: form.status,
          billing_day: Math.max(1, Math.min(28, Number(form.billing_day) || 1)),
          next_billing_at: form.next_billing_at || null,
          notes: form.notes || null,
        },
      });
      toast.success(account ? "Conta atualizada" : "Conta criada");
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao salvar"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{account ? `Editar ${account.name}` : "Nova conta"}</DialogTitle>
          <DialogDescription>
            Cadastro do cliente/agência gerenciado pela plataforma.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <F label="Nome da agência">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </F>
          <F label="CNPJ/CPF">
            <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          </F>
          <F label="E-mail de contato">
            <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </F>
          <F label="Telefone">
            <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
          </F>
          <F label="Plano">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.plan_id}
              onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
            >
              <option value="">— Sem plano —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatCurrency(p.price_cents / 100)})
                </option>
              ))}
            </select>
          </F>
          <F label="Preço customizado R$ (opcional)">
            <Input
              inputMode="decimal"
              placeholder="deixe vazio p/ usar o do plano"
              value={form.custom_price_reais}
              onChange={(e) => setForm({ ...form, custom_price_reais: e.target.value })}
            />
          </F>
          <F label="Status">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as any })}
            >
              <option value="trial">Avaliação</option>
              <option value="active">Ativa</option>
              <option value="past_due">Em atraso</option>
              <option value="suspended">Suspensa</option>
              <option value="canceled">Cancelada</option>
            </select>
          </F>
          <F label="Dia de cobrança (1-28)">
            <Input
              inputMode="numeric"
              value={form.billing_day}
              onChange={(e) => setForm({ ...form, billing_day: e.target.value })}
            />
          </F>
          <F label="Próxima cobrança (opcional)">
            <Input
              type="date"
              value={form.next_billing_at}
              onChange={(e) => setForm({ ...form, next_billing_at: e.target.value })}
            />
          </F>
          <div className="sm:col-span-2">
            <F label="Observações">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </F>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceFormDialog({
  open, account, onClose, onSaved,
}: {
  open: boolean;
  account: MasterAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(upsertAccountInvoice);
  const [saving, setSaving] = useState(false);
  const suggestedAmount = account
    ? ((account.custom_price_cents ?? account.plans?.price_cents ?? 0) / 100).toFixed(2)
    : "0.00";

  const now = new Date();
  const refDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const dueDefault = account
    ? new Date(Date.UTC(now.getFullYear(), now.getMonth(), account.billing_day))
        .toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    amount_reais: suggestedAmount,
    reference_month: refDefault,
    due_date: dueDefault,
    notes: "",
  });

  useMemo(() => {
    if (open && account) {
      setForm({
        amount_reais: ((account.custom_price_cents ?? account.plans?.price_cents ?? 0) / 100).toFixed(2),
        reference_month: refDefault,
        due_date: new Date(Date.UTC(now.getFullYear(), now.getMonth(), account.billing_day))
          .toISOString().slice(0, 10),
        notes: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id]);

  const submit = async () => {
    if (!account) return;
    setSaving(true);
    try {
      await save({
        data: {
          account_id: account.id,
          amount_cents: Math.round(Number(form.amount_reais.replace(",", ".")) * 100) || 0,
          reference_month: form.reference_month,
          due_date: form.due_date,
          status: "pending",
          notes: form.notes || null,
        },
      });
      toast.success("Fatura criada");
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova fatura — {account?.name}</DialogTitle>
          <DialogDescription>Gere uma cobrança avulsa para esta conta.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <F label="Valor (R$)">
            <Input
              inputMode="decimal"
              value={form.amount_reais}
              onChange={(e) => setForm({ ...form, amount_reais: e.target.value })}
            />
          </F>
          <F label="Mês de referência">
            <Input
              type="month"
              value={form.reference_month.slice(0, 7)}
              onChange={(e) => setForm({ ...form, reference_month: `${e.target.value}-01` })}
            />
          </F>
          <F label="Vencimento">
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </F>
          <div className="sm:col-span-2">
            <F label="Observações">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </F>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar fatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function initAccountForm(a: MasterAccount | null) {
  return {
    name: a?.name ?? "",
    contact_email: a?.contact_email ?? "",
    contact_phone: a?.contact_phone ?? "",
    document: a?.document ?? "",
    plan_id: a?.plan_id ?? "",
    custom_price_reais: a?.custom_price_cents != null
      ? (a.custom_price_cents / 100).toFixed(2) : "",
    status: (a?.status ?? "trial") as MasterAccount["status"],
    billing_day: String(a?.billing_day ?? 1),
    next_billing_at: a?.next_billing_at ?? "",
    notes: a?.notes ?? "",
  };
}