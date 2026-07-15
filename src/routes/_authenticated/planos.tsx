import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Check, Star, Plus, Pencil, Trash2, Loader2, Sparkles, Ban } from "lucide-react";

import { PageHero } from "@/components/page-hero";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin, formatCurrency } from "@/lib/auth";
import { upsertPlan, deletePlan, activatePlan, cancelSubscription } from "@/lib/plans.functions";

export const Route = createFileRoute("/_authenticated/planos")({
  head: () => ({
    meta: [
      { title: "Planos & Assinatura — Gestão Nobre MKT" },
      { name: "description", content: "Gerencie os planos do sistema e a assinatura atual da sua agência." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlanosPage,
});

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_period: "monthly" | "yearly";
  features: string[];
  limits: Record<string, number>;
  is_active: boolean;
  is_highlight: boolean;
  sort_order: number;
};

type Subscription = {
  plan_id: string | null;
  status: "trial" | "active" | "past_due" | "canceled" | "suspended";
  started_at: string | null;
  current_period_end: string | null;
};

const STATUS_LABEL: Record<Subscription["status"], string> = {
  trial: "Em avaliação",
  active: "Ativa",
  past_due: "Em atraso",
  canceled: "Cancelada",
  suspended: "Suspensa",
};

const STATUS_VARIANT: Record<Subscription["status"], "default" | "secondary" | "destructive" | "outline"> = {
  trial: "secondary",
  active: "default",
  past_due: "destructive",
  canceled: "outline",
  suspended: "destructive",
};

function formatLimit(v: number) {
  return v === -1 || v === null || v === undefined ? "Ilimitado" : v.toString();
}

const LIMIT_LABELS: Record<string, string> = {
  max_users: "Usuários",
  max_producers: "Produtores",
  max_sales_per_month: "Vendas/mês",
  storage_gb: "Armazenamento (GB)",
};

function PlanosPage() {
  const { roles } = useAuth();
  const admin = isAdmin(roles);
  const qc = useQueryClient();

  const plansQ = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans" as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });

  const subQ = useQuery({
    queryKey: ["subscription"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription" as any)
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Subscription | null;
    },
  });

  const activateFn = useServerFn(activatePlan);
  const cancelFn = useServerFn(cancelSubscription);
  const deleteFn = useServerFn(deletePlan);

  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Plan | null>(null);

  const currentPlan = useMemo(
    () => plansQ.data?.find((p) => p.id === subQ.data?.plan_id) ?? null,
    [plansQ.data, subQ.data],
  );

  const handleActivate = async (plan: Plan) => {
    try {
      await activateFn({ data: { plan_id: plan.id } });
      toast.success(`Plano ${plan.name} ativado`);
      qc.invalidateQueries({ queryKey: ["subscription"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao ativar plano");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelFn({});
      toast.success("Assinatura cancelada");
      qc.invalidateQueries({ queryKey: ["subscription"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao cancelar");
    }
  };

  const handleDelete = async (plan: Plan) => {
    try {
      await deleteFn({ data: { id: plan.id } });
      toast.success("Plano removido");
      qc.invalidateQueries({ queryKey: ["plans"] });
      setConfirmDelete(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao remover");
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Assinatura"
        icon={CreditCard}
        title="Planos & Assinatura"
        description="Gerencie o plano ativo da sua agência e visualize os recursos incluídos em cada nível."
        actions={
          admin ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Novo plano
            </Button>
          ) : null
        }
      />

      {/* Assinatura atual */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Assinatura atual
            </CardTitle>
            <CardDescription>
              {currentPlan
                ? `Plano ${currentPlan.name} — ${formatCurrency(currentPlan.price_cents / 100)}/${currentPlan.billing_period === "monthly" ? "mês" : "ano"}`
                : "Nenhum plano ativado. Escolha um dos planos abaixo."}
            </CardDescription>
          </div>
          {subQ.data && (
            <Badge variant={STATUS_VARIANT[subQ.data.status]}>{STATUS_LABEL[subQ.data.status]}</Badge>
          )}
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide">Início</div>
            <div className="font-medium text-foreground">
              {subQ.data?.started_at
                ? new Date(subQ.data.started_at).toLocaleDateString("pt-BR")
                : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide">Próxima renovação</div>
            <div className="font-medium text-foreground">
              {subQ.data?.current_period_end
                ? new Date(subQ.data.current_period_end).toLocaleDateString("pt-BR")
                : "—"}
            </div>
          </div>
          <div className="flex items-end justify-end">
            {admin && subQ.data?.status === "active" && (
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <Ban className="mr-2 h-4 w-4" /> Cancelar assinatura
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grade de planos */}
      {plansQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {(plansQ.data ?? []).map((plan) => {
            const isCurrent = plan.id === subQ.data?.plan_id;
            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden transition ${
                  plan.is_highlight
                    ? "border-primary/60 shadow-lg shadow-primary/10"
                    : "border-border/60"
                } ${isCurrent ? "ring-2 ring-primary" : ""} ${!plan.is_active ? "opacity-60" : ""}`}
              >
                {plan.is_highlight && (
                  <div className="absolute right-3 top-3">
                    <Badge className="gap-1"><Star className="h-3 w-3" /> Recomendado</Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">
                      {formatCurrency(plan.price_cents / 100)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      /{plan.billing_period === "monthly" ? "mês" : "ano"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Limites
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(plan.limits).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-muted-foreground">{LIMIT_LABELS[k] ?? k}</span>
                          <span className="font-medium text-foreground">{formatLimit(v as number)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    {isCurrent ? (
                      <Button disabled variant="secondary" className="w-full">
                        <Check className="mr-2 h-4 w-4" /> Plano atual
                      </Button>
                    ) : admin ? (
                      <Button
                        className="w-full"
                        variant={plan.is_highlight ? "default" : "outline"}
                        onClick={() => handleActivate(plan)}
                        disabled={!plan.is_active}
                      >
                        Ativar este plano
                      </Button>
                    ) : (
                      <Button disabled variant="outline" className="w-full">
                        Fale com o admin
                      </Button>
                    )}

                    {admin && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1"
                          onClick={() => setEditing(plan)}
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDelete(plan)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PlanFormDialog
        open={creating || !!editing}
        plan={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["plans"] });
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
            <AlertDialogDescription>
              O plano <b>{confirmDelete?.name}</b> será removido. Assinaturas usando este plano ficarão sem plano associado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && handleDelete(confirmDelete)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlanFormDialog({
  open, plan, onClose, onSaved,
}: {
  open: boolean;
  plan: Plan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(upsertPlan);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => initForm(plan));

  // Re-hydrate whenever dialog opens
  useMemo(() => {
    if (open) setForm(initForm(plan));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan?.id]);

  const submit = async () => {
    setSaving(true);
    try {
      await save({
        data: {
          id: plan?.id,
          slug: form.slug.trim(),
          name: form.name.trim(),
          description: form.description || null,
          price_cents: Math.round(Number(form.price_reais.replace(",", ".")) * 100) || 0,
          billing_period: form.billing_period,
          features: form.features
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          limits: {
            max_users: parseLimit(form.max_users),
            max_producers: parseLimit(form.max_producers),
            max_sales_per_month: parseLimit(form.max_sales_per_month),
            storage_gb: parseLimit(form.storage_gb),
          },
          is_active: form.is_active,
          is_highlight: form.is_highlight,
          sort_order: Number(form.sort_order) || 0,
        },
      });
      toast.success(plan ? "Plano atualizado" : "Plano criado");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan ? `Editar ${plan.name}` : "Novo plano"}</DialogTitle>
          <DialogDescription>
            Configure preço, recursos incluídos e limites de uso.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Nome">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Slug (identificador)">
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </Field>
          <Field label="Preço (R$)">
            <Input
              type="text"
              inputMode="decimal"
              value={form.price_reais}
              onChange={(e) => setForm({ ...form, price_reais: e.target.value })}
            />
          </Field>
          <Field label="Cobrança">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.billing_period}
              onChange={(e) => setForm({ ...form, billing_period: e.target.value as any })}
            >
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrição curta">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Recursos (um por linha)">
              <Textarea
                rows={6}
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Limite de usuários (-1 ilimitado)">
            <Input value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
          </Field>
          <Field label="Limite de produtores">
            <Input value={form.max_producers} onChange={(e) => setForm({ ...form, max_producers: e.target.value })} />
          </Field>
          <Field label="Vendas/mês">
            <Input value={form.max_sales_per_month} onChange={(e) => setForm({ ...form, max_sales_per_month: e.target.value })} />
          </Field>
          <Field label="Armazenamento (GB)">
            <Input value={form.storage_gb} onChange={(e) => setForm({ ...form, storage_gb: e.target.value })} />
          </Field>

          <Field label="Ordem">
            <Input value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          </Field>
          <div className="flex items-end gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              Ativo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_highlight} onCheckedChange={(v) => setForm({ ...form, is_highlight: v })} />
              Destaque
            </label>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function parseLimit(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function initForm(plan: Plan | null) {
  return {
    slug: plan?.slug ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    price_reais: plan ? (plan.price_cents / 100).toFixed(2) : "0.00",
    billing_period: (plan?.billing_period ?? "monthly") as "monthly" | "yearly",
    features: (plan?.features ?? []).join("\n"),
    max_users: String(plan?.limits?.max_users ?? -1),
    max_producers: String(plan?.limits?.max_producers ?? -1),
    max_sales_per_month: String(plan?.limits?.max_sales_per_month ?? -1),
    storage_gb: String(plan?.limits?.storage_gb ?? -1),
    sort_order: String(plan?.sort_order ?? 0),
    is_active: plan?.is_active ?? true,
    is_highlight: plan?.is_highlight ?? false,
  };
}