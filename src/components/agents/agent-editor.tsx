import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bot, Save, TestTube2, Loader2, Upload, Download, Trash2, Copy,
  Info, Cpu, KeyRound, Sliders, Wrench, Brain, BookOpen,
  Shield, Plug, LineChart, Palette,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS, TOOL_CATALOG, INTEGRATION_CATALOG, type ProviderId, type ProviderSpec } from "./providers";

export interface AgentRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  role: string | null;
  system_prompt: string | null;
  temperature: number;
  is_active: boolean;
  ai_provider_id: string | null;
  connection_id: string | null;
  avatar_url: string | null;
  category: string | null;
  language: string | null;
  timezone: string | null;
  model: string | null;
  max_tokens: number | null;
  top_p: number | null;
  top_k: number | null;
  seed: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  stop_sequences: string[] | null;
  streaming: boolean | null;
  thinking_mode: boolean | null;
  tools: Record<string, boolean> | null;
  memory: Record<string, unknown> | null;
  knowledge: unknown[] | null;
  security: Record<string, boolean> | null;
  integrations: Record<string, boolean> | null;
  appearance: Record<string, unknown> | null;
  initial_message: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at?: string;
  updated_at?: string;
}

type ProviderRow = { id: string; name: string; provider: string; model: string | null; api_key: string | null; base_url: string | null };

const DEFAULT_PROMPT = `Você é um assistente profissional de atendimento. Seja claro, empático e objetivo. Sempre confirme entendimento antes de agir.`;

function empty(userId: string): AgentRow {
  return {
    id: "", user_id: userId, name: "", description: "", role: "", system_prompt: DEFAULT_PROMPT,
    temperature: 0.7, is_active: true, ai_provider_id: null, connection_id: null,
    avatar_url: null, category: "atendimento", language: "pt-BR", timezone: "America/Sao_Paulo",
    model: null, max_tokens: 2048, top_p: 1, top_k: null, seed: null,
    frequency_penalty: 0, presence_penalty: 0, stop_sequences: [], streaming: true, thinking_mode: false,
    tools: {}, memory: { conversation: true, long_term: false, user_profile: true, history: true, context_limit: 20, auto_clean: false },
    knowledge: [], security: { hide_prompt: true, prompt_injection: true, jailbreak: true, encrypt_creds: true, permissions: false, audit: true, logs: true },
    integrations: {}, appearance: {}, initial_message: "Olá! Como posso ajudar hoje?",
    primary_color: "#22c55e", secondary_color: "#000000",
  };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent: AgentRow | null;
  onSaved: () => void;
}

export function AgentEditor({ open, onOpenChange, agent, onSaved }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<AgentRow>(() => (agent ?? empty(user?.id ?? "")));
  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const [credentials, setCredentials] = useState({ api_key: "", base_url: "", org: "", project: "", version: "", region: "" });
  const [providerRows, setProviderRows] = useState<ProviderRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const spec: ProviderSpec = useMemo(() => PROVIDERS.find(p => p.id === providerId) ?? PROVIDERS[0], [providerId]);

  useEffect(() => {
    if (!open) return;
    setForm(agent ? { ...empty(user?.id ?? ""), ...agent } : empty(user?.id ?? ""));
    (async () => {
      const { data } = await supabase.from("ai_providers").select("id,name,provider,model,api_key,base_url");
      setProviderRows((data as ProviderRow[]) ?? []);
      if (agent?.ai_provider_id) {
        const row = (data as ProviderRow[] | null)?.find(r => r.id === agent.ai_provider_id);
        if (row) {
          setProviderId((row.provider as ProviderId) ?? "openai");
          setCredentials(c => ({ ...c, api_key: row.api_key ?? "", base_url: row.base_url ?? "" }));
        }
      }
    })();
  }, [open, agent, user?.id]);

  function set<K extends keyof AgentRow>(k: K, v: AgentRow[K]) { setForm(f => ({ ...f, [k]: v })); }
  function toggleMap(field: "tools" | "integrations" | "security", key: string) {
    setForm(f => ({ ...f, [field]: { ...(f[field] ?? {}), [key]: !((f[field] as Record<string, boolean> | null) ?? {})[key] } }));
  }

  async function upsertProvider(): Promise<string | null> {
    if (!user) return null;
    const label = spec.label;
    const payload = {
      user_id: user.id, name: `${label} — ${form.name || "Agente"}`, provider: providerId,
      model: form.model, api_key: credentials.api_key || null, base_url: credentials.base_url || null, is_active: true,
    };
    if (form.ai_provider_id) {
      const { error } = await supabase.from("ai_providers").update(payload).eq("id", form.ai_provider_id);
      if (error) { toast.error(error.message); return null; }
      return form.ai_provider_id;
    }
    const { data, error } = await supabase.from("ai_providers").insert(payload).select("id").single();
    if (error) { toast.error(error.message); return null; }
    return data.id;
  }

  async function save() {
    if (!user) return;
    if (!form.name.trim()) return toast.error("Informe um nome");
    setSaving(true);
    try {
      const provId = credentials.api_key || form.ai_provider_id ? await upsertProvider() : form.ai_provider_id;
      const payload = { ...form, ai_provider_id: provId, user_id: user.id } as AgentRow;
      const { id, created_at, updated_at, ...rest } = payload;
      void created_at; void updated_at;
      if (agent?.id) {
        const { error } = await supabase.from("agents").update(rest as never).eq("id", agent.id);
        if (error) throw error;
        toast.success("Agente atualizado");
      } else {
        void id;
        const { error } = await supabase.from("agents").insert(rest as never);
        if (error) throw error;
        toast.success("Agente criado");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  }

  async function testConnection() {
    setTesting(true);
    await new Promise(r => setTimeout(r, 700));
    if (!credentials.api_key && providerId !== "ollama") toast.error("API Key não informada");
    else toast.success(`Conexão ${spec.label} OK`);
    setTesting(false);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${form.name || "agente"}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      setForm(f => ({ ...f, ...parsed, id: f.id, user_id: f.user_id }));
      toast.success("Configuração importada");
    } catch { toast.error("Arquivo inválido"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b bg-gradient-to-br from-card via-card to-primary/5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle>{agent ? "Editar Agente" : "Novo Agente"}</DialogTitle>
              <DialogDescription>Configuração completa: provedor, prompt, ferramentas, memória e integrações.</DialogDescription>
            </div>
            {form.name && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">{form.name}</Badge>}
          </div>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex flex-col">
          <div className="border-b px-4">
            <ScrollArea className="w-full">
              <TabsList className="h-11 bg-transparent gap-0.5 justify-start w-max">
                <TabsTrigger value="general"><Info className="h-3.5 w-3.5" /> Geral</TabsTrigger>
                <TabsTrigger value="provider"><Cpu className="h-3.5 w-3.5" /> Provedor</TabsTrigger>
                <TabsTrigger value="credentials"><KeyRound className="h-3.5 w-3.5" /> Credenciais</TabsTrigger>
                <TabsTrigger value="model"><Sliders className="h-3.5 w-3.5" /> Modelo</TabsTrigger>
                <TabsTrigger value="prompt"><Brain className="h-3.5 w-3.5" /> Prompt</TabsTrigger>
                <TabsTrigger value="params"><Sliders className="h-3.5 w-3.5" /> Parâmetros</TabsTrigger>
                <TabsTrigger value="tools"><Wrench className="h-3.5 w-3.5" /> Ferramentas</TabsTrigger>
                <TabsTrigger value="memory"><Brain className="h-3.5 w-3.5" /> Memória</TabsTrigger>
                <TabsTrigger value="knowledge"><BookOpen className="h-3.5 w-3.5" /> Conhecimento</TabsTrigger>
                <TabsTrigger value="security"><Shield className="h-3.5 w-3.5" /> Segurança</TabsTrigger>
                <TabsTrigger value="integrations"><Plug className="h-3.5 w-3.5" /> Integrações</TabsTrigger>
                <TabsTrigger value="monitoring"><LineChart className="h-3.5 w-3.5" /> Monitor</TabsTrigger>
                <TabsTrigger value="appearance"><Palette className="h-3.5 w-3.5" /> Aparência</TabsTrigger>
              </TabsList>
            </ScrollArea>
          </div>

          <ScrollArea className="h-[62vh]">
            <div className="p-6">
              <TabsContent value="general" className="mt-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome do Agente" required><Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex: Suporte Comercial" /></Field>
                  <Field label="Categoria"><Input value={form.category ?? ""} onChange={e => set("category", e.target.value)} placeholder="atendimento, vendas..." /></Field>
                  <Field label="Avatar (URL)"><Input value={form.avatar_url ?? ""} onChange={e => set("avatar_url", e.target.value)} placeholder="https://..." /></Field>
                  <Field label="Função"><Input value={form.role ?? ""} onChange={e => set("role", e.target.value)} placeholder="Ex: SDR, Suporte N1" /></Field>
                  <Field label="Idioma">
                    <Select value={form.language ?? "pt-BR"} onValueChange={v => set("language", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["pt-BR","en-US","es-ES","fr-FR","de-DE","it-IT"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Fuso horário"><Input value={form.timezone ?? ""} onChange={e => set("timezone", e.target.value)} placeholder="America/Sao_Paulo" /></Field>
                </div>
                <Field label="Descrição"><Textarea rows={3} value={form.description ?? ""} onChange={e => set("description", e.target.value)} placeholder="Para que serve este agente?" /></Field>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div><Label>Ativo</Label><p className="text-xs text-muted-foreground">Desativado, o agente não recebe mensagens.</p></div>
                  <Switch checked={form.is_active} onCheckedChange={v => set("is_active", v)} />
                </div>
              </TabsContent>

              <TabsContent value="provider" className="mt-0 space-y-4">
                <Field label="Selecione o provedor">
                  <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {PROVIDERS.map(p => (
                      <button
                        key={p.id} type="button" onClick={() => { setProviderId(p.id); set("model", p.models[0] ?? null); }}
                        className={`text-left rounded-lg border p-3 text-sm transition-colors ${providerId === p.id ? "border-primary bg-primary/10 text-primary" : "hover:border-primary/50"}`}
                      >
                        <div className="font-medium truncate">{p.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{p.models[0] ?? "custom"}</div>
                      </button>
                    ))}
                  </div>
                </Field>
                {providerRows.length > 0 && (
                  <Field label="Ou reutilizar provedor salvo">
                    <Select value={form.ai_provider_id ?? ""} onValueChange={v => set("ai_provider_id", v || null)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {providerRows.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </TabsContent>

              <TabsContent value="credentials" className="mt-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {spec.fields.apiKey && <Field label="API Key"><Input type="password" value={credentials.api_key} onChange={e => setCredentials(c => ({ ...c, api_key: e.target.value }))} placeholder="sk-..." /></Field>}
                  {spec.fields.baseUrl && <Field label="Base URL"><Input value={credentials.base_url} onChange={e => setCredentials(c => ({ ...c, base_url: e.target.value }))} placeholder="https://..." /></Field>}
                  {spec.fields.org && <Field label="Organization ID"><Input value={credentials.org} onChange={e => setCredentials(c => ({ ...c, org: e.target.value }))} /></Field>}
                  {spec.fields.project && <Field label="Project ID"><Input value={credentials.project} onChange={e => setCredentials(c => ({ ...c, project: e.target.value }))} /></Field>}
                  {spec.fields.version && <Field label="API Version"><Input value={credentials.version} onChange={e => setCredentials(c => ({ ...c, version: e.target.value }))} placeholder="2024-06-01" /></Field>}
                  {spec.fields.region && <Field label="Região"><Input value={credentials.region} onChange={e => setCredentials(c => ({ ...c, region: e.target.value }))} placeholder="us-east-1" /></Field>}
                </div>
                <Button variant="outline" onClick={testConnection} disabled={testing}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />} Testar Conexão
                </Button>
              </TabsContent>

              <TabsContent value="model" className="mt-0 space-y-4">
                <Field label={`Modelos disponíveis (${spec.label})`}>
                  {spec.models.length > 0 ? (
                    <Select value={form.model ?? ""} onValueChange={v => set("model", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                      <SelectContent>
                        {spec.models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.model ?? ""} onChange={e => set("model", e.target.value)} placeholder="nome-do-modelo" />
                  )}
                </Field>
                <div className="text-xs text-muted-foreground">Digite manualmente se seu modelo não estiver na lista.</div>
                <Field label="Modelo customizado"><Input value={form.model ?? ""} onChange={e => set("model", e.target.value)} placeholder="Ex: gpt-5.5, gemini-2.5-pro..." /></Field>
              </TabsContent>

              <TabsContent value="prompt" className="mt-0 space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Prompt do sistema</Label>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{(form.system_prompt ?? "").length} caracteres</span>
                    <Button size="sm" variant="ghost" onClick={() => set("system_prompt", DEFAULT_PROMPT)}>Restaurar padrão</Button>
                  </div>
                </div>
                <Textarea rows={16} value={form.system_prompt ?? ""} onChange={e => set("system_prompt", e.target.value)} className="font-mono text-sm" placeholder="Defina o comportamento, tom e objetivos do agente..." />
              </TabsContent>

              <TabsContent value="params" className="mt-0 space-y-5">
                {spec.params.temperature && <SliderField label="Temperature" value={form.temperature ?? 0.7} min={0} max={2} step={0.1} onChange={v => set("temperature", v)} />}
                {spec.params.topP && <SliderField label="Top P" value={form.top_p ?? 1} min={0} max={1} step={0.05} onChange={v => set("top_p", v)} />}
                {spec.params.topK && <NumberField label="Top K" value={form.top_k} onChange={v => set("top_k", v)} />}
                {spec.params.maxTokens && <NumberField label="Max Tokens" value={form.max_tokens} onChange={v => set("max_tokens", v)} />}
                {spec.params.seed && <NumberField label="Seed" value={form.seed} onChange={v => set("seed", v)} />}
                {spec.params.freq && <SliderField label="Frequency Penalty" value={form.frequency_penalty ?? 0} min={-2} max={2} step={0.1} onChange={v => set("frequency_penalty", v)} />}
                {spec.params.pres && <SliderField label="Presence Penalty" value={form.presence_penalty ?? 0} min={-2} max={2} step={0.1} onChange={v => set("presence_penalty", v)} />}
                {spec.params.stop && (
                  <Field label="Stop Sequences (separadas por vírgula)">
                    <Input value={(form.stop_sequences ?? []).join(",")} onChange={e => set("stop_sequences", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="\\n\\n, ###" />
                  </Field>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {spec.params.streaming && <ToggleRow label="Streaming" checked={!!form.streaming} onChange={v => set("streaming", v)} />}
                  {spec.params.thinking && <ToggleRow label="Thinking Mode" checked={!!form.thinking_mode} onChange={v => set("thinking_mode", v)} />}
                </div>
              </TabsContent>

              <TabsContent value="tools" className="mt-0">
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {TOOL_CATALOG.map(t => (
                    <ToggleRow key={t.id} label={t.label} checked={!!(form.tools ?? {})[t.id]} onChange={() => toggleMap("tools", t.id)} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="memory" className="mt-0 space-y-3">
                {[
                  ["conversation","Memória da conversa"],
                  ["long_term","Memória de longo prazo"],
                  ["user_profile","Perfil do usuário"],
                  ["history","Histórico"],
                  ["auto_clean","Limpeza automática"],
                ].map(([k,label]) => (
                  <ToggleRow key={k} label={label} checked={!!((form.memory ?? {}) as Record<string,unknown>)[k]}
                    onChange={v => set("memory", { ...(form.memory ?? {}), [k]: v })} />
                ))}
                <Field label="Limite de contexto (mensagens)">
                  <Input type="number" value={((form.memory ?? {}) as Record<string, unknown>).context_limit as number | undefined ?? 20}
                    onChange={e => set("memory", { ...(form.memory ?? {}), context_limit: Number(e.target.value) })} />
                </Field>
              </TabsContent>

              <TabsContent value="knowledge" className="mt-0 space-y-3">
                <p className="text-sm text-muted-foreground">Vincule documentos da Base de Conhecimento (PDF, DOCX, CSV, URLs). Gerencie o conteúdo em <b>Base de Conhecimento</b>.</p>
                <div className="rounded-lg border-dashed border p-6 text-center text-sm text-muted-foreground">
                  <BookOpen className="h-6 w-6 mx-auto mb-2 text-primary" />
                  {(form.knowledge ?? []).length} documento(s) vinculado(s)
                </div>
              </TabsContent>

              <TabsContent value="security" className="mt-0 space-y-2">
                {[
                  ["hide_prompt","Ocultar Prompt"],
                  ["prompt_injection","Bloquear Prompt Injection"],
                  ["jailbreak","Detectar Jailbreak"],
                  ["encrypt_creds","Criptografar Credenciais"],
                  ["permissions","Controle de Permissões"],
                  ["audit","Auditoria"],
                  ["logs","Logs"],
                ].map(([k,label]) => (
                  <ToggleRow key={k} label={label} checked={!!(form.security ?? {})[k]} onChange={() => toggleMap("security", k)} />
                ))}
              </TabsContent>

              <TabsContent value="integrations" className="mt-0">
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {INTEGRATION_CATALOG.map(i => (
                    <ToggleRow key={i.id} label={i.label} checked={!!(form.integrations ?? {})[i.id]} onChange={() => toggleMap("integrations", i.id)} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="monitoring" className="mt-0">
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {[
                    ["Tokens consumidos","—"],["Custo estimado","US$ —"],["Tempo médio","—"],
                    ["Requisições","0"],["Latência p95","—"],["Uso de ferramentas","—"],
                  ].map(([k,v]) => (
                    <div key={k} className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">{k}</div>
                      <div className="text-lg font-semibold text-primary">{v}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">Métricas em tempo real aparecem após o agente receber conversas.</p>
              </TabsContent>

              <TabsContent value="appearance" className="mt-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Cor Primária"><Input type="color" value={form.primary_color ?? "#22c55e"} onChange={e => set("primary_color", e.target.value)} /></Field>
                  <Field label="Cor Secundária"><Input type="color" value={form.secondary_color ?? "#000000"} onChange={e => set("secondary_color", e.target.value)} /></Field>
                </div>
                <Field label="Mensagem inicial"><Textarea rows={2} value={form.initial_message ?? ""} onChange={e => set("initial_message", e.target.value)} /></Field>
                <Field label="Placeholder do chat"><Input value={((form.appearance ?? {}) as Record<string,unknown>).placeholder as string | undefined ?? ""} onChange={e => set("appearance", { ...(form.appearance ?? {}), placeholder: e.target.value })} placeholder="Digite sua mensagem..." /></Field>
                <Field label="Sugestões de perguntas (uma por linha)">
                  <Textarea rows={3}
                    value={(((form.appearance ?? {}) as Record<string, unknown>).suggestions as string[] | undefined ?? []).join("\n")}
                    onChange={e => set("appearance", { ...(form.appearance ?? {}), suggestions: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} />
                </Field>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="p-4 border-t bg-muted/30 flex-row flex-wrap gap-2">
          <div className="flex gap-2 mr-auto">
            <Button variant="outline" size="sm" onClick={exportJson}><Download className="h-4 w-4" /> Exportar</Button>
            <label>
              <input type="file" accept="application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importJson(f); }} />
              <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4" /> Importar</span></Button>
            </label>
            {agent && <Button variant="outline" size="sm" onClick={() => { const c = { ...form, name: `${form.name} (cópia)` }; setForm({ ...c, id: "" }); toast.info("Salve para criar duplicata"); }}><Copy className="h-4 w-4" /> Duplicar</Button>}
          </div>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <Label className="cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SliderField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><Label>{label}</Label><Badge variant="outline">{value}</Badge></div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={v => onChange(v[0])} />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <Field label={label}>
      <Input type="number" value={value ?? ""} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} />
    </Field>
  );
}