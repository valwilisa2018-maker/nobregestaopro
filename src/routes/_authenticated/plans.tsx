import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Crown, Check, Pencil, Plus, Trash2, Loader2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [{ title: "Planos — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  tokens_included: number;
  features: string[];
  highlight: boolean;
  sort_order: number;
  is_active: boolean;
};

const empty: Omit<Plan, "id"> = {
  name: "",
  description: "",
  price_cents: 0,
  currency: "BRL",
  tokens_included: 0,
  features: [],
  highlight: false,
  sort_order: 0,
  is_active: true,
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatTokens(n: number) {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi de tokens`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR")} mil tokens`;
  return `${n} tokens`;
}

function Page() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<Omit<Plan, "id">>(empty);
  const [featuresText, setFeaturesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{ id: string; plan_id: string } | null>(
    null,
  );
  const [requesting, setRequesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) return toast.error(error.message);
    setPlans(
      (data ?? []).map((p) => ({
        ...(p as Plan),
        features: Array.isArray((p as { features: unknown }).features) ? (p as Plan).features : [],
      })),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    supabase
      .rpc("has_role", { _user_id: user.id, _role: "admin" })
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const loadPending = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("plan_activation_requests")
      .select("id,plan_id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    setPendingRequest(data ? { id: data.id, plan_id: data.plan_id } : null);
  }, [user]);
  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const requestActivation = async (p: Plan) => {
    if (!user) return toast.error("Faça login para continuar");
    setRequesting(p.id);
    const { error } = await supabase
      .from("plan_activation_requests")
      .insert({ user_id: user.id, plan_id: p.id });
    setRequesting(null);
    if (error) {
      if (error.code === "23505")
        return toast.info("Você já tem uma solicitação pendente. Aguarde a ativação.");
      return toast.error(error.message);
    }
    toast.success("Solicitação enviada! Aguarde a liberação do administrador.");
    loadPending();
  };

  const cancelRequest = async () => {
    if (!pendingRequest) return;
    const { error } = await supabase
      .from("plan_activation_requests")
      .update({ status: "cancelled" })
      .eq("id", pendingRequest.id);
    if (error) return toast.error(error.message);
    toast.success("Solicitação cancelada");
    loadPending();
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...empty, sort_order: (plans.at(-1)?.sort_order ?? 0) + 1 });
    setFeaturesText("");
    setOpen(true);
  };
  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({ ...p });
    setFeaturesText(p.features.join("\n"));
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Nome é obrigatório");
    setSaving(true);
    const payload = {
      ...form,
      price_cents: Number(form.price_cents) || 0,
      tokens_included: Number(form.tokens_included) || 0,
      sort_order: Number(form.sort_order) || 0,
      features: featuresText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const q = editing
      ? supabase.from("plans").update(payload).eq("id", editing.id)
      : supabase.from("plans").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Plano atualizado" : "Plano criado");
    setOpen(false);
    load();
  };

  const remove = async (p: Plan) => {
    if (!confirm(`Excluir plano "${p.name}"?`)) return;
    const { error } = await supabase.from("plans").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Plano excluído");
    load();
  };

  const visible = plans.filter((p) => isAdmin || p.is_active);

  return (
    <PageShell
      title="Planos"
      description="Escolha o plano ideal para sua operação."
      icon={<Crown className="h-6 w-6" />}
      status="ativo"
      actions={
        isAdmin ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo plano
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="p-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Nenhum plano disponível.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {visible.map((p) => (
            <Card
              key={p.id}
              className={`relative flex flex-col ${p.highlight ? "border-primary ring-2 ring-primary/30" : ""}`}
            >
              {p.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1">
                  <Star className="h-3 w-3" /> Mais vendido
                </Badge>
              )}
              <CardContent className="p-6 flex-1 flex flex-col gap-4">
                <div>
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  {p.description && (
                    <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                  )}
                </div>
                <div>
                  <div className="text-3xl font-black">
                    {formatBRL(p.price_cents)}
                    <span className="text-sm text-muted-foreground font-normal">/mês</span>
                  </div>
                  <div className="text-xs text-primary font-medium mt-1">
                    {formatTokens(p.tokens_included)} inclusos
                  </div>
                </div>
                <ul className="space-y-1.5 text-sm flex-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {pendingRequest?.plan_id === p.id ? (
                  <div className="space-y-2">
                    <div className="w-full rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium px-3 py-2 text-center">
                      ⏳ Aguardando ativação pelo administrador
                    </div>
                    <Button className="w-full" variant="ghost" size="sm" onClick={cancelRequest}>
                      Cancelar solicitação
                    </Button>
                  </div>
                ) : pendingRequest ? (
                  <Button className="w-full" variant="outline" disabled>
                    Você já tem uma solicitação pendente
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={p.highlight ? "default" : "outline"}
                    disabled={requesting === p.id}
                    onClick={() => requestActivation(p)}
                  >
                    {requesting === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assinar"}
                  </Button>
                )}
                {isAdmin && (
                  <div className="flex gap-1 pt-2 border-t">
                    {!p.is_active && <Badge variant="outline">Inativo</Badge>}
                    <div className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar plano" : "Novo plano"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Preço (centavos)</Label>
                <Input
                  type="number"
                  value={form.price_cents}
                  onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  {formatBRL(Number(form.price_cents) || 0)}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Tokens inclusos</Label>
                <Input
                  type="number"
                  value={form.tokens_included}
                  onChange={(e) => setForm({ ...form, tokens_included: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  {formatTokens(Number(form.tokens_included) || 0)}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Recursos (um por linha)</Label>
              <Textarea
                rows={8}
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                placeholder="1 WhatsApp&#10;1 Agente IA&#10;500 atendimentos IA"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.highlight}
                    onCheckedChange={(v) => setForm({ ...form, highlight: v })}
                  />
                  <span className="text-sm">Destaque</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                  <span className="text-sm">Ativo</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
