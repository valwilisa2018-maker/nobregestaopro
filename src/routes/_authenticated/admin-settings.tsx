import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Settings, Save, Loader2, Zap, ShieldAlert, Brain, Sparkles, MessageSquare, Package, Plus, Trash2, Star, Coins, TrendingUp, DollarSign } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin-settings")({
  head: () => ({ meta: [{ title: "Configurações Globais — Admin" }] }),
  component: Page,
});

type EvoCfg = { url_api: string; api_key: string; webhook_base_url: string };

type PackageRow = {
  id: string;
  name: string;
  tokens: number;
  price_cents: number;
  badge: string | null;
  sort_order: number;
  is_active: boolean;
};

type PricingCfg = {
  currency: string;
  usd_rate: number;
  margin_pct: number;
  multipliers: Record<string, number>;
};

const DEFAULT_PRICING: PricingCfg = {
  currency: "BRL",
  usd_rate: 5.2,
  margin_pct: 40,
  multipliers: {
    "openai/gpt-5-nano": 1,
    "openai/gpt-5-mini": 2,
    "openai/gpt-5": 8,
    "google/gemini-2.5-flash": 1,
    "google/gemini-2.5-pro": 5,
    "anthropic/claude-3-5-sonnet": 6,
    "anthropic/claude-3-opus": 15,
    "deepseek/deepseek-chat": 1,
  },
};

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  price_annual_cents: number | null;
  currency: string;
  tokens_included: number;
  daily_limit: number;
  monthly_limit: number;
  highlight: boolean;
  sort_order: number;
  is_active: boolean;
  features: string[] | null;
};

type ProviderKey = "lovable" | "openai" | "gemini" | "anthropic";
type ProviderCfg = { id?: string; api_key: string; model: string; is_active: boolean };

type ModelOpt = { id: string; label: string; group: "econômico" | "balanceado" | "avançado" };

const MODELS: Record<ProviderKey, ModelOpt[]> = {
  lovable: [
    { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (padrão)", group: "balanceado" },
    { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", group: "econômico" },
    { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", group: "econômico" },
    { id: "openai/gpt-5-nano", label: "GPT-5 Nano", group: "econômico" },
    { id: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano", group: "econômico" },
    { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", group: "balanceado" },
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", group: "balanceado" },
    { id: "openai/gpt-5-mini", label: "GPT-5 Mini", group: "balanceado" },
    { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", group: "balanceado" },
    { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", group: "avançado" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", group: "avançado" },
    { id: "openai/gpt-5", label: "GPT-5", group: "avançado" },
    { id: "openai/gpt-5.2", label: "GPT-5.2", group: "avançado" },
    { id: "openai/gpt-5.4", label: "GPT-5.4", group: "avançado" },
    { id: "openai/gpt-5.5", label: "GPT-5.5", group: "avançado" },
  ],
  openai: [
    { id: "gpt-5-nano", label: "GPT-5 Nano", group: "econômico" },
    { id: "gpt-5-mini", label: "GPT-5 Mini", group: "balanceado" },
    { id: "gpt-5", label: "GPT-5", group: "avançado" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", group: "econômico" },
    { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", group: "econômico" },
    { id: "o1-mini", label: "o1 Mini", group: "econômico" },
    { id: "gpt-4o", label: "GPT-4o", group: "balanceado" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", group: "balanceado" },
    { id: "gpt-4", label: "GPT-4", group: "avançado" },
    { id: "o1", label: "o1", group: "avançado" },
    { id: "o1-preview", label: "o1 Preview", group: "avançado" },
  ],
  gemini: [
    { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B", group: "econômico" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", group: "econômico" },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", group: "econômico" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", group: "balanceado" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", group: "avançado" },
  ],
  anthropic: [
    { id: "claude-3-haiku-20240307", label: "Claude 3 Haiku", group: "econômico" },
    { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", group: "econômico" },
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", group: "balanceado" },
    { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet", group: "balanceado" },
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", group: "avançado" },
    { id: "claude-3-opus-latest", label: "Claude 3 Opus", group: "avançado" },
    { id: "claude-opus-4-20250514", label: "Claude Opus 4", group: "avançado" },
  ],
};

const PROVIDERS: { key: ProviderKey; name: string; icon: typeof Brain; desc: string; placeholder: string; defaultModel: string }[] = [
  { key: "lovable", name: "Lovable AI", icon: Sparkles, desc: "Gateway nativo — sem chave necessária. Desative para usar outros provedores.", placeholder: "Gerenciado pela Lovable", defaultModel: "google/gemini-3-flash-preview" },
  { key: "openai", name: "OpenAI", icon: Brain, desc: "GPT-4o, o1 e modelos da OpenAI.", placeholder: "sk-...", defaultModel: "gpt-4o-mini" },
  { key: "gemini", name: "Google Gemini", icon: Sparkles, desc: "Modelos Gemini do Google.", placeholder: "AIza...", defaultModel: "gemini-2.0-flash" },
  { key: "anthropic", name: "Anthropic Claude", icon: Brain, desc: "Modelos Claude da Anthropic.", placeholder: "sk-ant-...", defaultModel: "claude-3-5-sonnet-latest" },
];

function Page() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<EvoCfg>({ url_api: "", api_key: "", webhook_base_url: "" });
  const [providers, setProviders] = useState<Record<ProviderKey, ProviderCfg>>({
    lovable: { api_key: "", model: "google/gemini-3-flash-preview", is_active: true },
    openai: { api_key: "", model: "gpt-4o-mini", is_active: false },
    gemini: { api_key: "", model: "gemini-2.0-flash", is_active: false },
    anthropic: { api_key: "", model: "claude-3-5-sonnet-latest", is_active: false },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingProv, setSavingProv] = useState<ProviderKey | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [savingPlan, setSavingPlan] = useState<string | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [savingPkg, setSavingPkg] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PricingCfg>(DEFAULT_PRICING);
  const [savingPricing, setSavingPricing] = useState(false);
  const [stats, setStats] = useState<{ salesCents: number; salesCount: number; tokensSold: number; tokensUsed: number; costCents: number }>({ salesCents: 0, salesCount: 0, tokensSold: 0, tokensUsed: 0, costCents: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: adminData } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      setIsAdmin(!!adminData);
      if (!adminData) { setLoading(false); return; }
      const { data } = await supabase.from("settings").select("value").eq("key", "evolution_api").maybeSingle();
      if (data?.value) {
        try {
          const v = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
          setCfg({ url_api: v.url_api ?? "", api_key: v.api_key ?? "", webhook_base_url: v.webhook_base_url ?? "" });
        } catch { /* ignore */ }
      }
      if (typeof window !== "undefined") {
        setCfg((c) => ({ ...c, webhook_base_url: c.webhook_base_url || window.location.origin }));
      }
      const { data: provs } = await supabase.from("ai_providers").select("*").eq("user_id", user.id);
      if (provs) {
        setProviders((prev) => {
          const next = { ...prev };
          for (const p of provs) {
            const k = p.provider as ProviderKey;
            if (next[k]) next[k] = {
              id: p.id,
              api_key: p.api_key ?? "",
              model: p.model ?? next[k].model,
              is_active: p.is_active,
            };
          }
          return next;
        });
      }
      await reloadPlans();
      await reloadCredits();
      setLoading(false);
    })();
  }, [user]);

  async function reloadPlans() {
    const { data } = await supabase.from("plans").select("*").order("sort_order", { ascending: true });
    setPlans(((data ?? []) as unknown as PlanRow[]).map((p) => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : (p.features ? (p.features as unknown as string[]) : []),
    })));
  }

  async function reloadCredits() {
    const { data: pkgs } = await supabase.from("credit_packages").select("*").order("sort_order", { ascending: true });
    setPackages((pkgs ?? []) as unknown as PackageRow[]);
    const { data: cfgRow } = await supabase.from("internal_config").select("value").eq("key", "credits_pricing").maybeSingle();
    if (cfgRow?.value) {
      try { setPricing({ ...DEFAULT_PRICING, ...JSON.parse(cfgRow.value as string) }); } catch { /* ignore */ }
    }
    const { data: orders } = await supabase.from("credit_orders").select("tokens, price_cents").eq("status", "paid");
    const salesCents = (orders ?? []).reduce((s, o) => s + (o.price_cents ?? 0), 0);
    const tokensSold = (orders ?? []).reduce((s, o) => s + Number(o.tokens ?? 0), 0);
    const { data: txs } = await supabase.from("credit_transactions").select("total_tokens, cost_cents").eq("kind", "usage").eq("status", "ok");
    const tokensUsed = (txs ?? []).reduce((s, t) => s + Number(t.total_tokens ?? 0), 0);
    const costCents = (txs ?? []).reduce((s, t) => s + (t.cost_cents ?? 0), 0);
    setStats({ salesCents, salesCount: orders?.length ?? 0, tokensSold, tokensUsed, costCents });
  }

  const updatePkg = (id: string, patch: Partial<PackageRow>) =>
    setPackages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const savePkg = async (p: PackageRow) => {
    setSavingPkg(p.id);
    const payload = { name: p.name, tokens: p.tokens, price_cents: p.price_cents, badge: p.badge, sort_order: p.sort_order, is_active: p.is_active };
    const { error } = p.id.startsWith("new-")
      ? await supabase.from("credit_packages").insert(payload as never)
      : await supabase.from("credit_packages").update(payload as never).eq("id", p.id);
    setSavingPkg(null);
    if (error) return toast.error(error.message);
    toast.success("Pacote salvo");
    await reloadCredits();
  };

  const deletePkg = async (id: string) => {
    if (id.startsWith("new-")) { setPackages((prev) => prev.filter((p) => p.id !== id)); return; }
    if (!confirm("Excluir pacote?")) return;
    const { error } = await supabase.from("credit_packages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pacote excluído");
    await reloadCredits();
  };

  const addPkg = () => {
    const id = `new-${Date.now()}`;
    setPackages((prev) => [...prev, { id, name: "Novo pacote", tokens: 100000, price_cents: 2990, badge: null, sort_order: (prev.at(-1)?.sort_order ?? 0) + 1, is_active: false }]);
  };

  const savePricing = async () => {
    setSavingPricing(true);
    const value = JSON.stringify(pricing);
    const { data: existing } = await supabase.from("internal_config").select("key").eq("key", "credits_pricing").maybeSingle();
    const { error } = existing
      ? await supabase.from("internal_config").update({ value }).eq("key", "credits_pricing")
      : await supabase.from("internal_config").insert({ key: "credits_pricing", value });
    setSavingPricing(false);
    if (error) return toast.error(error.message);
    toast.success("Precificação salva");
  };

  const updatePlan = (id: string, patch: Partial<PlanRow>) =>
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const savePlan = async (p: PlanRow) => {
    setSavingPlan(p.id);
    const payload = {
      name: p.name, description: p.description, price_cents: p.price_cents,
      price_annual_cents: p.price_annual_cents, currency: p.currency,
      tokens_included: p.tokens_included, daily_limit: p.daily_limit, monthly_limit: p.monthly_limit,
      highlight: p.highlight, sort_order: p.sort_order, is_active: p.is_active,
      features: p.features ?? [],
    };
    const { error } = p.id.startsWith("new-")
      ? await supabase.from("plans").insert({ ...payload } as never)
      : await supabase.from("plans").update(payload as never).eq("id", p.id);
    setSavingPlan(null);
    if (error) return toast.error(error.message);
    toast.success("Plano salvo");
    await reloadPlans();
  };

  const deletePlan = async (id: string) => {
    if (id.startsWith("new-")) { setPlans((prev) => prev.filter((p) => p.id !== id)); return; }
    if (!confirm("Excluir este plano?")) return;
    const { error } = await supabase.from("plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Plano excluído");
    await reloadPlans();
  };

  const addPlan = () => {
    const id = `new-${Date.now()}`;
    setPlans((prev) => [...prev, {
      id, name: "Novo Plano", description: "", price_cents: 0, price_annual_cents: 0,
      currency: "BRL", tokens_included: 0, daily_limit: 0, monthly_limit: 0,
      highlight: false, sort_order: (prev.at(-1)?.sort_order ?? 0) + 1, is_active: false, features: [],
    }]);
  };

  const save = async () => {
    if (!user) return;
    if (!cfg.url_api || !cfg.api_key) return toast.error("URL e API Key são obrigatórias");
    setSaving(true);
    const payload = { user_id: user.id, key: "evolution_api", value: JSON.stringify(cfg) };
    const { data: existing } = await supabase.from("settings").select("id").eq("key", "evolution_api").maybeSingle();
    const q = existing
      ? supabase.from("settings").update(payload).eq("id", existing.id)
      : supabase.from("settings").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações globais salvas");
  };

  const saveProvider = async (k: ProviderKey) => {
    if (!user) return;
    const p = providers[k];
    const meta = PROVIDERS.find((x) => x.key === k)!;
    if (k !== "lovable" && p.is_active && !p.api_key) return toast.error("API Key obrigatória para ativar");
    setSavingProv(k);
    const payload = {
      user_id: user.id,
      provider: k,
      name: meta.name,
      api_key: p.api_key || null,
      model: p.model || null,
      base_url: null,
      is_active: p.is_active,
    };
    const q = p.id
      ? supabase.from("ai_providers").update(payload).eq("id", p.id)
      : supabase.from("ai_providers").insert(payload).select("id").single();
    const { data, error } = await q;
    setSavingProv(null);
    if (error) return toast.error(error.message);
    if (!p.id && data && "id" in data) setProviders((prev) => ({ ...prev, [k]: { ...prev[k], id: (data as { id: string }).id } }));
    toast.success(`${meta.name} salvo`);
  };

  const updateProv = (k: ProviderKey, patch: Partial<ProviderCfg>) =>
    setProviders((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));

  if (isAdmin === false) {
    return (
      <PageShell title="Acesso restrito" description="Área exclusiva de administradores." icon={<ShieldAlert className="h-6 w-6" />}>
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Você não tem permissão para acessar esta página.
          <div className="mt-4"><Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>Voltar ao Dashboard</Button></div>
        </CardContent></Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Configurações Globais"
      description="Credenciais globais da plataforma. Estas configurações são compartilhadas por todos os usuários."
      icon={<Settings className="h-6 w-6" />}
      status="ativo"
    >
      <Tabs defaultValue="whatsapp" className="space-y-4">
        <TabsList className="grid w-full sm:w-auto grid-cols-4">
          <TabsTrigger value="whatsapp" className="gap-2"><MessageSquare className="h-4 w-4" />WhatsApp API</TabsTrigger>
          <TabsTrigger value="ai" className="gap-2"><Brain className="h-4 w-4" />Chaves de IA</TabsTrigger>
          <TabsTrigger value="plans" className="gap-2"><Package className="h-4 w-4" />Planos</TabsTrigger>
          <TabsTrigger value="credits" className="gap-2"><Coins className="h-4 w-4" />Créditos</TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp" className="mt-0">
          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>WhatsApp / Evolution API</CardTitle>
                  <CardDescription>Configuração única — usada por todas as instâncias.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>URL da API</Label>
                    <Input placeholder="https://evo.exemplo.com" value={cfg.url_api}
                      onChange={(e) => setCfg({ ...cfg, url_api: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>API Key global</Label>
                    <Input type="password" placeholder="••••••••" value={cfg.api_key}
                      onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>URL base para webhooks</Label>
                    <Input placeholder="https://seuapp.com" value={cfg.webhook_base_url}
                      onChange={(e) => setCfg({ ...cfg, webhook_base_url: e.target.value })} />
                    <p className="text-xs text-muted-foreground">Cada instância recebe um webhook em <code>/api/public/evolution/&lt;instance&gt;</code>.</p>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={save} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-0">
          <div className="grid gap-4 md:grid-cols-2">
            {PROVIDERS.map((meta) => {
              const p = providers[meta.key];
              const Icon = meta.icon;
              const isLovable = meta.key === "lovable";
              return (
                <Card key={meta.key} className={`border-primary/20 transition ${p.is_active ? "ring-1 ring-primary/40" : "opacity-80"}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="truncate">{meta.name}</CardTitle>
                          <CardDescription className="text-xs">{meta.desc}</CardDescription>
                        </div>
                      </div>
                      <Switch checked={p.is_active} onCheckedChange={(v) => updateProv(meta.key, { is_active: v })} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!isLovable && (
                      <div className="space-y-1.5">
                        <Label>API Key</Label>
                        <Input type="password" placeholder={meta.placeholder} value={p.api_key}
                          onChange={(e) => updateProv(meta.key, { api_key: e.target.value })} />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Modelo padrão</Label>
                      <Select value={p.model} onValueChange={(v) => updateProv(meta.key, { model: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
                        <SelectContent className="max-h-80">
                          {(["econômico", "balanceado", "avançado"] as const).map((g) => {
                            const items = MODELS[meta.key].filter((m) => m.group === g);
                            if (!items.length) return null;
                            return (
                              <SelectGroup key={g}>
                                <SelectLabel className="capitalize flex items-center gap-2">
                                  {g}
                                  {g === "econômico" && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">$</Badge>}
                                </SelectLabel>
                                {items.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    <div className="flex items-center gap-2">
                                      <span>{m.label}</span>
                                      <span className="text-[10px] text-muted-foreground font-mono">{m.id}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button size="sm" onClick={() => saveProvider(meta.key)} disabled={savingProv === meta.key}>
                        {savingProv === meta.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="plans" className="mt-0 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={addPlan}><Plus className="h-4 w-4" /> Novo plano</Button>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : plans.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum plano cadastrado.</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {plans.map((p) => (
                <Card key={p.id} className={`border-primary/20 ${p.is_active ? "" : "opacity-70"}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                          <Package className="h-4 w-4" />
                        </div>
                        <Input value={p.name} onChange={(e) => updatePlan(p.id, { name: e.target.value })} className="font-semibold" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Ativo</span>
                        <Switch checked={p.is_active} onCheckedChange={(v) => updatePlan(p.id, { is_active: v })} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Descrição</Label>
                      <Input value={p.description ?? ""} onChange={(e) => updatePlan(p.id, { description: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Preço mensal (centavos)</Label>
                        <Input type="number" value={p.price_cents} onChange={(e) => updatePlan(p.id, { price_cents: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Preço anual (centavos)</Label>
                        <Input type="number" value={p.price_annual_cents ?? 0} onChange={(e) => updatePlan(p.id, { price_annual_cents: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Moeda</Label>
                        <Input value={p.currency} onChange={(e) => updatePlan(p.id, { currency: e.target.value.toUpperCase() })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Tokens IA / mês</Label>
                        <Input type="number" value={p.tokens_included} onChange={(e) => updatePlan(p.id, { tokens_included: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Envios/dia (0 = ilim.)</Label>
                        <Input type="number" value={p.daily_limit} onChange={(e) => updatePlan(p.id, { daily_limit: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Envios/mês (0 = ilim.)</Label>
                        <Input type="number" value={p.monthly_limit} onChange={(e) => updatePlan(p.id, { monthly_limit: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Ordem</Label>
                        <Input type="number" value={p.sort_order} onChange={(e) => updatePlan(p.id, { sort_order: Number(e.target.value) })} />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex items-center gap-2">
                          <Switch checked={p.highlight} onCheckedChange={(v) => updatePlan(p.id, { highlight: v })} />
                          <Label className="text-xs flex items-center gap-1"><Star className="h-3 w-3" />Destaque</Label>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Recursos (um por linha)</Label>
                      <textarea
                        className="w-full min-h-24 rounded-md border border-border bg-background p-2 text-xs"
                        value={(p.features ?? []).join("\n")}
                        onChange={(e) => updatePlan(p.id, { features: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                      />
                    </div>
                    <div className="flex justify-between pt-1">
                      <Button size="sm" variant="ghost" onClick={() => deletePlan(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      <Button size="sm" onClick={() => savePlan(p)} disabled={savingPlan === p.id}>
                        {savingPlan === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="credits" className="mt-0 space-y-4">
          {/* Stats */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Vendas (pagas)", value: `${pricing.currency} ${(stats.salesCents / 100).toFixed(2)}`, sub: `${stats.salesCount} pedidos`, icon: DollarSign },
              { label: "Tokens vendidos", value: stats.tokensSold.toLocaleString(), sub: "acumulado", icon: Coins },
              { label: "Tokens consumidos", value: stats.tokensUsed.toLocaleString(), sub: "global", icon: TrendingUp },
              { label: "Lucro estimado", value: `${pricing.currency} ${((stats.salesCents - stats.costCents * pricing.usd_rate) / 100).toFixed(2)}`, sub: `custo ~US$ ${(stats.costCents / 100).toFixed(2)}`, icon: Sparkles },
            ].map((s, i) => (
              <Card key={i} className="border-primary/20 backdrop-blur-xl bg-card/50">
                <CardContent className="py-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{s.label}</span><s.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-lg font-semibold">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground">{s.sub}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pricing config */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" />Precificação global</CardTitle>
              <CardDescription>Cotação, margem e multiplicadores por modelo. Aplicado ao converter custo de provedor em créditos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Moeda</Label>
                  <Input value={pricing.currency} onChange={(e) => setPricing({ ...pricing, currency: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cotação do dólar</Label>
                  <Input type="number" step="0.01" value={pricing.usd_rate} onChange={(e) => setPricing({ ...pricing, usd_rate: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Margem de lucro (%)</Label>
                  <Input type="number" value={pricing.margin_pct} onChange={(e) => setPricing({ ...pricing, margin_pct: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Multiplicador por modelo</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(pricing.multipliers).map(([model, mult]) => (
                    <div key={model} className="flex items-center gap-2">
                      <Input value={model} onChange={(e) => {
                        const next = { ...pricing.multipliers };
                        delete next[model]; next[e.target.value] = mult;
                        setPricing({ ...pricing, multipliers: next });
                      }} className="font-mono text-xs" />
                      <Input type="number" step="0.1" value={mult} onChange={(e) => setPricing({ ...pricing, multipliers: { ...pricing.multipliers, [model]: Number(e.target.value) } })} className="w-24" />
                      <Button size="icon" variant="ghost" onClick={() => {
                        const next = { ...pricing.multipliers }; delete next[model];
                        setPricing({ ...pricing, multipliers: next });
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" onClick={() => setPricing({ ...pricing, multipliers: { ...pricing.multipliers, "novo/modelo": 1 } })}>
                  <Plus className="h-4 w-4" /> Adicionar modelo
                </Button>
              </div>
              <div className="flex justify-end">
                <Button onClick={savePricing} disabled={savingPricing}>
                  {savingPricing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar precificação
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Packages CRUD */}
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-muted-foreground">Pacotes de créditos</h3>
            <Button size="sm" onClick={addPkg}><Plus className="h-4 w-4" /> Novo pacote</Button>
          </div>
          {packages.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum pacote cadastrado.</CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => (
                <Card key={p.id} className={`border-primary/20 ${p.is_active ? "" : "opacity-70"}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <Input value={p.name} onChange={(e) => updatePkg(p.id, { name: e.target.value })} className="font-semibold" />
                      <Switch checked={p.is_active} onCheckedChange={(v) => updatePkg(p.id, { is_active: v })} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1"><Label className="text-xs">Tokens</Label>
                        <Input type="number" value={p.tokens} onChange={(e) => updatePkg(p.id, { tokens: Number(e.target.value) })} /></div>
                      <div className="space-y-1"><Label className="text-xs">Preço (centavos)</Label>
                        <Input type="number" value={p.price_cents} onChange={(e) => updatePkg(p.id, { price_cents: Number(e.target.value) })} /></div>
                      <div className="space-y-1"><Label className="text-xs">Selo</Label>
                        <Input value={p.badge ?? ""} onChange={(e) => updatePkg(p.id, { badge: e.target.value || null })} /></div>
                      <div className="space-y-1"><Label className="text-xs">Ordem</Label>
                        <Input type="number" value={p.sort_order} onChange={(e) => updatePkg(p.id, { sort_order: Number(e.target.value) })} /></div>
                    </div>
                    <div className="flex justify-between pt-1">
                      <Button size="sm" variant="ghost" onClick={() => deletePkg(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      <Button size="sm" onClick={() => savePkg(p)} disabled={savingPkg === p.id}>
                        {savingPkg === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}