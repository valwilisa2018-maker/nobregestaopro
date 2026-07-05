import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Settings, Save, Loader2, Zap, ShieldAlert, Brain, Sparkles, MessageSquare } from "lucide-react";
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
      setLoading(false);
    })();
  }, [user]);

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
        <TabsList className="grid w-full sm:w-auto grid-cols-2">
          <TabsTrigger value="whatsapp" className="gap-2"><MessageSquare className="h-4 w-4" />WhatsApp API</TabsTrigger>
          <TabsTrigger value="ai" className="gap-2"><Brain className="h-4 w-4" />Chaves de IA</TabsTrigger>
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
      </Tabs>
    </PageShell>
  );
}