import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/page-shell";
import { TutorialVideo } from "@/components/tutorial-video";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Save, ShieldCheck, RefreshCw, Send, Plus, Trash2, Copy, Facebook, CheckCircle2, XCircle, Info, Sparkles, FileCheck2, Webhook } from "lucide-react";
import { toast } from "sonner";
import {
  verifyMetaConfig, syncMetaTemplates, createMetaTemplate, deleteMetaTemplate, sendMetaTemplate, sendMetaText,
} from "@/lib/meta-wa.functions";

export const Route = createFileRoute("/_authenticated/meta-api")({
  head: () => ({ meta: [{ title: "Meta API Oficial — WhatsApp Cloud" }] }),
  component: Page,
});

type Cfg = {
  id: string; name: string; phone_number_id: string | null; business_account_id: string | null;
  app_id: string | null; app_secret: string | null; access_token: string | null;
  webhook_verify_token: string | null; graph_version: string;
  display_phone: string | null; is_default: boolean; is_active: boolean;
  last_verified_at: string | null; last_status: string | null;
};
type Tpl = {
  id: string; meta_template_id: string | null; name: string; language: string;
  category: string; status: string; rejection_reason: string | null; components: unknown;
  last_synced_at: string | null;
};

function Page() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const verifyFn = useServerFn(verifyMetaConfig);
  const syncFn = useServerFn(syncMetaTemplates);
  const createTplFn = useServerFn(createMetaTemplate);
  const deleteTplFn = useServerFn(deleteMetaTemplate);
  const sendTplFn = useServerFn(sendMetaTemplate);
  const sendTextFn = useServerFn(sendMetaText);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: cfgs } = await supabase
      .from("meta_wa_configs").select("*").eq("user_id", user.id).order("created_at").limit(1);
    let current = (cfgs?.[0] as Cfg | undefined) ?? null;
    if (!current) {
      const verifyToken = crypto.randomUUID().replace(/-/g, "");
      const { data: created } = await supabase.from("meta_wa_configs").insert({
        user_id: user.id, name: "Meta Oficial",
        webhook_verify_token: verifyToken, is_default: true, is_active: true,
      } as never).select().single();
      current = created as Cfg;
    }
    setCfg(current);
    if (current) {
      const { data: tpls } = await supabase.from("meta_wa_templates")
        .select("*").eq("user_id", user.id).eq("config_id", current.id).order("created_at", { ascending: false });
      setTemplates((tpls as Tpl[]) ?? []);
    }
    setLoading(false);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const webhookUrl = useMemo(() => {
    if (!cfg) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/public/meta-webhook/${cfg.id}`;
  }, [cfg]);

  async function saveCfg() {
    if (!cfg || !user) return;
    setSaving(true);
    const { error } = await supabase.from("meta_wa_configs").update({
      name: cfg.name, phone_number_id: cfg.phone_number_id, business_account_id: cfg.business_account_id,
      app_id: cfg.app_id, app_secret: cfg.app_secret, access_token: cfg.access_token,
      webhook_verify_token: cfg.webhook_verify_token, graph_version: cfg.graph_version,
      is_default: cfg.is_default, is_active: cfg.is_active,
    } as never).eq("id", cfg.id).eq("user_id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuração salva");
  }

  async function verify() {
    if (!cfg) return;
    setBusy("verify");
    const r = await verifyFn({ data: { configId: cfg.id } });
    setBusy(null);
    if (r.ok) toast.success(`Conectado: ${r.phone ?? ""} ${r.name ?? ""}`);
    else toast.error(r.error ?? "falhou");
    load();
  }
  async function sync() {
    if (!cfg) return;
    setBusy("sync");
    const r = await syncFn({ data: { configId: cfg.id } });
    setBusy(null);
    if (r.ok) { toast.success(`${r.count} templates sincronizados`); load(); }
    else toast.error(r.error ?? "falhou");
  }

  if (loading || !cfg) {
    return (
      <PageShell title="Meta API Oficial" description="WhatsApp Cloud API" icon={<Facebook className="h-6 w-6" />}>
        <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </PageShell>
    );
  }

  const statusOk = cfg.last_status === "ok";

  return (
    <PageShell>
      {/* Hero premium */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1120] via-[#0f172a] to-[#1e1b4b] p-6 md:p-8 shadow-premium">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/40">
              <Facebook className="h-7 w-7 text-white" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-blue-100 to-indigo-200 bg-clip-text text-transparent">
                  Meta API Oficial
                </h1>
                {statusOk ? (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 gap-1">
                    <Sparkles className="h-3 w-3" /> Ativo
                  </Badge>
                ) : (
                  <Badge className="bg-slate-500/15 text-slate-300 border border-slate-400/30 gap-1">
                    <XCircle className="h-3 w-3" /> Inativo
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-300/80 max-w-2xl">
                Configure a WhatsApp Cloud API oficial da Meta — templates aprovados, janela de 24h e disparo em massa com alta entregabilidade.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`h-9 px-3 ${statusOk ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/40" : "bg-white/5 text-slate-300 border-white/10"}`}>
              {statusOk ? <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> : <XCircle className="h-3.5 w-3.5 mr-1.5" />}
              {cfg.last_status ?? "não verificado"}
            </Badge>
            <Button onClick={verify} disabled={busy === "verify"} className="h-9 bg-white/10 hover:bg-white/15 text-white border border-white/15 backdrop-blur">
              {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verificar
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="credentials" className="space-y-4 mt-4">
        <TabsList className="bg-card/40 border border-border/60 p-1 rounded-xl">
          <TabsTrigger value="credentials" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Credenciais
          </TabsTrigger>
          <TabsTrigger value="webhook" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg gap-1.5">
            <Webhook className="h-3.5 w-3.5" /> Webhook
          </TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg gap-1.5">
            <FileCheck2 className="h-3.5 w-3.5" /> Templates
          </TabsTrigger>
          <TabsTrigger value="test" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg gap-1.5">
            <Send className="h-3.5 w-3.5" /> Teste de envio
          </TabsTrigger>
          <TabsTrigger value="guide" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg gap-1.5">
            <Info className="h-3.5 w-3.5" /> Como configurar
          </TabsTrigger>
        </TabsList>
        <TutorialVideo moduleKey="modulo_02" title="Tutorial — Meta API Oficial" />

        {/* Credentials */}
        <TabsContent value="credentials">
          <Card>
            <CardHeader>
              <CardTitle>Credenciais Meta Cloud API</CardTitle>
              <CardDescription>Cole os dados obtidos no Meta Business Manager → WhatsApp → Configuração da API.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Nome" value={cfg.name} onChange={v => setCfg({ ...cfg, name: v })} />
              <Field label="Phone Number ID" required value={cfg.phone_number_id ?? ""} onChange={v => setCfg({ ...cfg, phone_number_id: v })} placeholder="Ex.: 1234567890" />
              <Field label="WhatsApp Business Account ID (WABA)" required value={cfg.business_account_id ?? ""} onChange={v => setCfg({ ...cfg, business_account_id: v })} />
              <Field label="App ID" value={cfg.app_id ?? ""} onChange={v => setCfg({ ...cfg, app_id: v })} />
              <Field label="App Secret" type="password" value={cfg.app_secret ?? ""} onChange={v => setCfg({ ...cfg, app_secret: v })} />
              <Field label="Access Token (System User permanente)" required type="password" value={cfg.access_token ?? ""} onChange={v => setCfg({ ...cfg, access_token: v })} />
              <div className="space-y-2">
                <Label>Versão da Graph API</Label>
                <Select value={cfg.graph_version} onValueChange={v => setCfg({ ...cfg, graph_version: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["v21.0", "v20.0", "v19.0", "v18.0"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={cfg.is_default} onCheckedChange={v => setCfg({ ...cfg, is_default: v })} />
                <Label>Usar como provedor padrão (disparos e envios usam a API oficial)</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={cfg.is_active} onCheckedChange={v => setCfg({ ...cfg, is_active: v })} />
                <Label>Conexão ativa</Label>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button onClick={saveCfg} disabled={saving} style={{ background: "var(--gradient-primary)" }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar credenciais
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhook */}
        <TabsContent value="webhook">
          <Card>
            <CardHeader>
              <CardTitle>Webhook</CardTitle>
              <CardDescription>Cadastre este endpoint em WhatsApp → Configuração → Webhooks, campos <b>messages</b> e <b>message_template_status_update</b>.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Callback URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copiado"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Verify Token</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={cfg.webhook_verify_token ?? ""} onChange={e => setCfg({ ...cfg, webhook_verify_token: e.target.value })} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(cfg.webhook_verify_token ?? ""); toast.success("Copiado"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => setCfg({ ...cfg, webhook_verify_token: crypto.randomUUID().replace(/-/g, "") })}>
                    <RefreshCw className="h-4 w-4" /> Gerar
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveCfg} disabled={saving}><Save className="h-4 w-4" /> Salvar</Button>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
                <Info className="h-4 w-4 mt-0.5 text-primary" />
                <span>A Meta valida o webhook via GET com <code>hub.challenge</code>. Cole a URL e o Verify Token exatamente iguais no painel da Meta.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Templates HSM</CardTitle>
                <CardDescription>Templates aprovados pela Meta são obrigatórios para iniciar conversas fora da janela de 24h.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={sync} disabled={busy === "sync"}>
                  {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizar
                </Button>
                <NewTemplateDialog onCreate={async (payload) => {
                  const r = await createTplFn({ data: { configId: cfg.id, ...payload } });
                  if (r.ok) { toast.success(`Enviado para aprovação (${r.status})`); load(); return true; }
                  toast.error(r.error ?? "falhou"); return false;
                }} />
              </div>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum template cadastrado. Crie um novo ou sincronize da Meta.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {templates.map(t => (
                    <div key={t.id} className="flex items-center gap-3 py-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{t.name}</span>
                          <Badge variant="outline" className="text-xs">{t.language}</Badge>
                          <Badge variant="outline" className="text-xs">{t.category}</Badge>
                          <StatusBadge status={t.status} />
                        </div>
                        {t.rejection_reason && <div className="text-xs text-red-500 mt-1">{t.rejection_reason}</div>}
                      </div>
                      <Button size="icon" variant="ghost" onClick={async () => {
                        if (!confirm(`Excluir "${t.name}"?`)) return;
                        const r = await deleteTplFn({ data: { templateId: t.id } });
                        if (r.ok) { toast.success("Removido"); load(); } else toast.error(r.error ?? "falhou");
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test */}
        <TabsContent value="test">
          <TestSend
            templates={templates.filter(t => t.status === "APPROVED")}
            onSendTemplate={async (to, name, lang, params) => {
              const r = await sendTplFn({ data: { configId: cfg.id, to, templateName: name, language: lang, bodyParams: params } });
              if (r.ok) toast.success(`Enviado ${r.messageId ?? ""}`); else toast.error(r.error ?? "falhou");
            }}
            onSendText={async (to, text) => {
              const r = await sendTextFn({ data: { configId: cfg.id, to, text } });
              if (r.ok) toast.success(`Enviado ${r.messageId ?? ""}`);
              else toast.error(`${r.error ?? "falhou"}${"hint" in r && r.hint ? ` — ${r.hint}` : ""}`);
            }}
          />
        </TabsContent>

        {/* Guide */}
        <TabsContent value="guide" className="space-y-4">
          <div className="grid gap-4">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 p-5 backdrop-blur-md shadow-premium">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Passo a passo Meta Cloud API</h3>
                  <p className="text-sm text-slate-300/80">Siga cada etapa na ordem para conectar a API oficial da Meta.</p>
                </div>
              </div>
            </div>

            <div className="relative space-y-0">
              {/* Vertical timeline line */}
              <div className="absolute left-5 top-4 bottom-4 w-px bg-gradient-to-b from-blue-500/40 via-indigo-500/40 to-blue-500/10" />
              {[
                {
                  n: 1,
                  title: "Crie sua conta comercial",
                  desc: "Acesse o business.facebook.com e crie ou selecione a conta comercial que será usada para o WhatsApp."
                },
                {
                  n: 2,
                  title: "Adicione um número no WhatsApp Manager",
                  desc: "No WhatsApp Manager, adicione o número de telefone e faça a verificação por SMS ou chamada de voz."
                },
                {
                  n: 3,
                  title: "Crie o System User e o Access Token",
                  desc: "Em Configurações → Usuários do sistema, crie um System User e gere um Access Token permanente com as permissões whatsapp_business_messaging e whatsapp_business_management."
                },
                {
                  n: 4,
                  title: "Copie os IDs da API",
                  desc: "Copie o Phone Number ID e o WhatsApp Business Account ID na tela Configuração da API."
                },
                {
                  n: 5,
                  title: "Cole as credenciais e verifique",
                  desc: "Cole os dados aqui na aba Credenciais e clique em Verificar para ativar a conexão."
                },
                {
                  n: 6,
                  title: "Configure o webhook",
                  desc: "Na aba Webhook, copie a Callback URL e o Verify Token para o painel da Meta e assine os campos messages e message_template_status_update."
                },
                {
                  n: 7,
                  title: "Sincronize os templates",
                  desc: "Na aba Templates, crie ou sincronize seus templates. Somente templates APPROVED podem iniciar conversa fora da janela de 24h."
                }
              ].map((step) => (
                <div key={step.n} className="relative flex gap-4 py-4">
                  <div className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold shadow-lg shadow-blue-500/30">
                    {step.n}
                  </div>
                  <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm hover:bg-white/10 transition">
                    <h4 className="font-semibold text-white">{step.title}</h4>
                    <p className="text-sm text-slate-300/80 leading-relaxed mt-1.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-300">
                  <Info className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-amber-100">Janela de 24 horas</h4>
                  <p className="text-sm text-amber-200/80 leading-relaxed">
                    Após o cliente enviar uma mensagem, você tem 24h para responder livremente com texto ou mídia.
                    Passado esse tempo, é obrigatório usar um <span className="font-semibold text-amber-100">template aprovado</span> para reabrir a conversa.
                    O sistema usa templates automaticamente no Disparo em Massa quando necessário.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}{required && <span className="text-red-500 ml-1">*</span>}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPROVED: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40",
    PENDING: "bg-amber-500/15 text-amber-500 border-amber-500/40",
    REJECTED: "bg-red-500/15 text-red-500 border-red-500/40",
    LOCAL: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={`text-xs ${map[status] ?? map.LOCAL}`}>{status}</Badge>;
}

function NewTemplateDialog({ onCreate }: { onCreate: (p: { name: string; language: string; category: "MARKETING"|"UTILITY"|"AUTHENTICATION"; bodyText: string; headerText?: string; footerText?: string }) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", language: "pt_BR", category: "MARKETING" as const, bodyText: "", headerText: "", footerText: "" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo Template</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Criar template para aprovação</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label="Nome (a-z, 0-9, _)" required value={form.name} onChange={v => setForm({ ...form, name: v.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="promo_natal_2026" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Idioma</Label>
              <Select value={form.language} onValueChange={v => setForm({ ...form, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["pt_BR","en","es","pt_PT"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v as typeof form.category })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="UTILITY">Utilidade</SelectItem>
                  <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Field label="Cabeçalho (opcional)" value={form.headerText} onChange={v => setForm({ ...form, headerText: v })} />
          <div className="space-y-2">
            <Label>Corpo <span className="text-red-500">*</span></Label>
            <Textarea rows={4} value={form.bodyText} onChange={e => setForm({ ...form, bodyText: e.target.value })} placeholder="Use {{1}}, {{2}} para variáveis" />
          </div>
          <Field label="Rodapé (opcional)" value={form.footerText} onChange={v => setForm({ ...form, footerText: v })} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={saving || !form.name || !form.bodyText} onClick={async () => {
            setSaving(true);
            const ok = await onCreate({ ...form, headerText: form.headerText || undefined, footerText: form.footerText || undefined });
            setSaving(false);
            if (ok) { setOpen(false); setForm({ name: "", language: "pt_BR", category: "MARKETING", bodyText: "", headerText: "", footerText: "" }); }
          }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar p/ aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestSend({ templates, onSendTemplate, onSendText }: {
  templates: Tpl[];
  onSendTemplate: (to: string, name: string, lang: string, params: string[]) => Promise<void>;
  onSendText: (to: string, text: string) => Promise<void>;
}) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("Olá! Teste da API oficial ✅");
  const [tplId, setTplId] = useState<string>("");
  const [params, setParams] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const tpl = templates.find(t => t.id === tplId);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>Enviar template (fora da janela)</CardTitle>
        <CardDescription>Usa a HSM aprovada — ideal para disparos frios.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Número (E.164)" value={to} onChange={setTo} placeholder="5511999998888" />
          <div className="space-y-2"><Label>Template aprovado</Label>
            <Select value={tplId} onValueChange={setTplId}>
              <SelectTrigger><SelectValue placeholder={templates.length ? "Selecione" : "Nenhum aprovado"} /></SelectTrigger>
              <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.language})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Field label="Variáveis do corpo (separadas por |)" value={params} onChange={setParams} placeholder="João|10%|amanhã" />
          <Button className="w-full" disabled={!to || !tpl || busy} onClick={async () => {
            setBusy(true);
            await onSendTemplate(to, tpl!.name, tpl!.language, params.split("|").map(s => s.trim()).filter(Boolean));
            setBusy(false);
          }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar template</Button>
        </CardContent></Card>

      <Card><CardHeader><CardTitle>Enviar texto livre (janela 24h)</CardTitle>
        <CardDescription>Só funciona se o cliente enviou algo nas últimas 24h.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Número (E.164)" value={to} onChange={setTo} placeholder="5511999998888" />
          <div className="space-y-2"><Label>Mensagem</Label>
            <Textarea rows={4} value={text} onChange={e => setText(e.target.value)} />
          </div>
          <Button className="w-full" variant="outline" disabled={!to || !text || busy} onClick={async () => {
            setBusy(true); await onSendText(to, text); setBusy(false);
          }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar texto</Button>
        </CardContent></Card>
    </div>
  );
}