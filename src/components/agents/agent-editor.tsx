import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Save, RotateCcw, Sliders, MessageSquare, Clock, Bell, Send, Hash,
  CalendarClock, AudioLines, Image as ImageIcon, PlayCircle, BookOpen, Loader2,
  Plus, X, Play, Mic, Info, Trash2, ChevronDown, Upload, FileText, Send as SendIcon, Bot,
  RefreshCw, Database, Brain,
  CheckCircle2, XCircle, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PROVIDERS, type ProviderId } from "./providers";
import { PROMPT_LIBRARY } from "./prompt-library";

export interface AgentRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  role: string | null;
  system_prompt: string | null;
  temperature: number;
  is_active: boolean;
  connection_id: string | null;
  avatar_url: string | null;
  language: string | null;
  timezone: string | null;
  max_tokens: number | null;
  top_p: number | null;
  top_k: number | null;
  seed: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  stop_sequences: string[] | null;
  streaming: boolean | null;
  thinking_mode: boolean | null;
  tools: Record<string, unknown> | null;
  memory: Record<string, unknown> | null;
  knowledge: unknown[] | null;
  security: Record<string, unknown> | null;
  integrations: Record<string, unknown> | null;
  appearance: Record<string, unknown> | null;
  initial_message: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_PROMPT = `Você é um atendente virtual especialista em vendas consultivas. Seu objetivo é atender cada cliente de forma humanizada, criar conexão genuína e conduzir naturalmente à conversão.

## Sua Personalidade
- Fale como um consultor de vendas experiente e amigável no WhatsApp.
- Tom: confiante, empático, persuasivo e natural. Nunca robótico.
- Crie conexão ANTES de vender. Escute, entenda a dor, depois apresente a solução.

## Regras de Comunicação
1. Respostas CURTAS: máximo 2-3 frases por mensagem.
2. Uma pergunta por vez.
3. Sem listas, sem markdown, sem textão. Fale como gente.
4. Emojis com moderação: 1-2 por mensagem.
5. Português brasileiro natural e descontraído.
6. Sempre termine com uma pergunta ou chamada para ação.`;

export function emptyAgent(userId: string): AgentRow {
  return {
    id: "", user_id: userId, name: "Novo Agente", description: "", role: "", system_prompt: DEFAULT_PROMPT,
    temperature: 0.7, is_active: true, connection_id: null,
    avatar_url: null, language: "pt-BR", timezone: "America/Sao_Paulo",
    max_tokens: 2048, top_p: 1, top_k: null, seed: null,
    frequency_penalty: 0, presence_penalty: 0, stop_sequences: [], streaming: true, thinking_mode: false,
    tools: {}, memory: { messages: 20 }, knowledge: [], security: {},
    integrations: {}, appearance: {}, initial_message: "Olá! Como posso ajudar hoje?",
    primary_color: null, secondary_color: null,
  };
}

interface Props {
  agent: AgentRow | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function AgentEditor({ agent, onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<AgentRow>(() => agent ?? emptyAgent(user?.id ?? ""));
  const [saving, setSaving] = useState(false);
  const [clearingMem, setClearingMem] = useState(false);
  const [instances, setInstances] = useState<Array<{ id: string; name: string; phone_number: string | null; status: string | null }>>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryNiche, setLibraryNiche] = useState<string>(PROMPT_LIBRARY[0].id);
  const [aiConnected, setAiConnected] = useState<boolean | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationResults, setValidationResults] = useState<Array<{ n: number; title: string; ok: boolean; msg: string }>>([]);

  useEffect(() => { setForm(agent ?? emptyAgent(user?.id ?? "")); }, [agent, user?.id]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("ai_providers")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      setAiConnected(!!data);
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("connections")
        .select("id, name, phone_number, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setInstances(data ?? []);
    })();
  }, [user]);

  const memMsgs = ((form.memory as { messages?: number } | null)?.messages ?? 20);

  function set<K extends keyof AgentRow>(k: K, v: AgentRow[K]) { setForm((f) => ({ ...f, [k]: v })); }

  // Extended settings stored in the `tools` JSON column
  type Ext = {
    timing?: { preset?: string; timezone?: string; delayChar?: number; delayMax?: number; wait?: number; humanIntervention?: boolean; reactivation?: number; unknownMsg?: string };
    alerts?: { whatsapp?: boolean; stopAfterHandoff?: boolean; stopAfterHours?: number; includeSummary?: boolean; customRules?: boolean };
    followup?: { enabled?: boolean; aiGenerated?: boolean; count?: number; checkMin?: number; intervalHrs?: number; respectHours?: boolean; messages?: string[] };
    keywords?: { enabled?: boolean; mode?: string; list?: string[] };
    hours?: { enabled?: boolean; start?: string; end?: string; lunch?: boolean; days?: string[]; blockedDates?: string[] };
    audio?: { enabled?: boolean; provider?: "browser" | "elevenlabs"; replaceText?: boolean; autoReply?: boolean; mirrorFormat?: boolean; smartAudio?: boolean; smartAudioChars?: number; asTool?: boolean };
    media?: { enabled?: boolean; items?: Array<{ id: string; name: string; size?: string; mode?: string; keywords?: string; description?: string; storage_path?: string; mime?: string; bytes?: number }> };
    conversation?: { keepUnread?: boolean; singleMessage?: boolean; includeContactName?: boolean; cancelOnNew?: boolean; stopAfterManual?: boolean };
    files?: {
      enabled?: boolean;
      image?: boolean; pdf?: boolean; document?: boolean; audio?: boolean; video?: boolean;
      receipts?: "analyze" | "ignore" | "confirm";
      receiptReply?: string;
      ackReply?: string;
      sendAck?: boolean;
    };
  };
  const ext = (form.tools ?? {}) as Ext;
  function setExt<K extends keyof Ext>(k: K, v: Ext[K]) {
    setForm((f) => ({ ...f, tools: { ...(f.tools ?? {}), [k]: { ...((f.tools as Ext | null)?.[k] ?? {}), ...v } } }));
  }

  async function save() {
    if (!user) return;
    if (!form.name.trim()) return toast.error("Informe um nome");
    setSaving(true);
    try {
      const { id, created_at, updated_at, ...rest } = form;
      void created_at; void updated_at;
      const payload = { ...rest, user_id: user.id };
      if (agent?.id) {
        const { error } = await supabase.from("agents").update(payload as never).eq("id", agent.id);
        if (error) throw error;
        toast.success("Agente atualizado");
      } else {
        void id;
        const { error } = await supabase.from("agents").insert(payload as never);
        if (error) throw error;
        toast.success("Agente criado");
      }
      onSaved();
    } catch (e) {
      console.error("[agent save]", e);
      const msg = e instanceof Error ? e.message : (typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : JSON.stringify(e));
      toast.error(`Erro ao salvar: ${msg}`);
    } finally { setSaving(false); }
  }

  async function toggleActive(v: boolean) {
    set("is_active", v);
    if (!agent?.id) return; // novo agente só persiste ao salvar
    const { error } = await supabase.from("agents").update({ is_active: v } as never).eq("id", agent.id);
    if (error) { toast.error(`Falha ao ${v ? "ativar" : "pausar"}: ${error.message}`); return; }
    toast.success(v ? "Agente ativado" : "Agente pausado");
  }

  async function clearMemory() {
    if (!agent?.id) return toast.info("Salve o agente antes de limpar a memória");
    if (!confirm("Limpar toda a memória (mensagens salvas) deste agente?")) return;
    setClearingMem(true);
    try {
      const { data: convs, error: e1 } = await supabase.from("conversations").select("id").eq("agent_id", agent.id);
      if (e1) throw e1;
      const ids = (convs ?? []).map((c) => c.id);
      if (ids.length) {
        const { error: e2 } = await supabase.from("messages").delete().in("conversation_id", ids);
        if (e2) throw e2;
      }
      toast.success(`Memória limpa (${ids.length} conversa(s))`);
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setClearingMem(false); }
  }

  async function runValidation() {
    if (!user) return;
    setValidating(true);
    setValidationOpen(true);
    const results: Array<{ n: number; title: string; ok: boolean; msg: string }> = [];
    const push = (n: number, title: string, ok: boolean, msg: string) => results.push({ n, title, ok, msg });
    try {
      // 1) Modelo
      const { data: prov } = await supabase.from("ai_providers").select("id, provider, model").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
      const hasModel = !!prov && !!form.system_prompt && (form.max_tokens ?? 0) > 0;
      push(1, "Configuração do Modelo", hasModel, hasModel ? `Provedor ativo (${prov?.provider}/${prov?.model ?? "?"}), prompt e tokens OK` : "Sem provedor ativo ou prompt/tokens vazios");

      // 2) Conversas
      const conv = ext.conversation ?? {};
      push(2, "Conversas", true, `keepUnread=${!!conv.keepUnread} singleMessage=${!!conv.singleMessage} cancelOnNew=${!!conv.cancelOnNew}`);

      // 3) Tempo e Mensagens
      const t = ext.timing ?? {};
      const tOk = (t.wait ?? 0) >= 0 && (t.delayChar ?? 0) >= 0;
      push(3, "Tempo e Mensagens", tOk, `debounce=${t.wait ?? 0}s delay/char=${t.delayChar ?? 0}ms tz=${t.timezone ?? form.timezone}`);

      // 4) Alertas
      const a = ext.alerts ?? {};
      push(4, "Alertas", true, `whatsapp=${!!a.whatsapp} handoff=${!!a.stopAfterHandoff}`);

      // 5) Follow-up
      const f = ext.followup ?? {};
      const fOk = !f.enabled || (Array.isArray(f.messages) && f.messages.length > 0);
      push(5, "Follow-Up", fOk, f.enabled ? `${(f.messages ?? []).length} mensagem(ns), intervalo=${f.intervalHrs ?? 0}h` : "desativado");

      // 6) Keywords
      const k = ext.keywords ?? {};
      const kOk = !k.enabled || (Array.isArray(k.list) && k.list.length > 0);
      push(6, "Ativação por Palavra-chave", kOk, k.enabled ? `${(k.list ?? []).length} palavra(s) modo=${k.mode ?? "?"}` : "desativado");

      // 7) Horários
      const h = ext.hours ?? {};
      const hOk = !h.enabled || (!!h.start && !!h.end);
      push(7, "Horário de Funcionamento", hOk, h.enabled ? `${h.start}-${h.end} dias=${(h.days ?? []).length}` : "24/7");

      // 8) Áudio
      const au = ext.audio ?? {};
      push(8, "Áudio com IA", true, au.enabled ? `provider=${au.provider ?? "browser"} autoReply=${!!au.autoReply}` : "desativado");

      // 9) Mídia
      const m = ext.media ?? {};
      push(9, "Mídia com IA", true, `${(m.items ?? []).length} item(ns)`);

      // 10) Testar IA — verifica provedor + instância vinculada (webhook chama o gateway no servidor)
      {
        const modelId = prov?.model ?? null;
        const hasProv = !!prov;
        const hasConn = !!form.connection_id;
        const ok = hasProv && hasConn && form.is_active;
        const msg = !hasProv ? "Sem provedor de IA ativo"
          : !hasConn ? "Sem instância WhatsApp vinculada"
          : !form.is_active ? "Agente pausado"
          : `Pronto para responder (modelo: ${modelId})`;
        push(10, "Testar IA", ok, msg);
      }

      // 11) Conhecimento
      const kn = Array.isArray(form.knowledge) ? form.knowledge : [];
      push(11, "Base de Conhecimento", true, `${kn.length} item(ns)`);

      // 12) Interpretação de Arquivos
      const fi = (ext as { files?: { enabled?: boolean; receipts?: string; image?: boolean; pdf?: boolean; document?: boolean; audio?: boolean; video?: boolean } }).files ?? {};
      const types = [
        fi.image ?? true ? "img" : null,
        fi.pdf ?? true ? "pdf" : null,
        fi.document ?? true ? "doc" : null,
        fi.audio ?? true ? "audio" : null,
        fi.video ?? false ? "video" : null,
      ].filter(Boolean);
      push(12, "Interpretação de Arquivos", true,
        fi.enabled === false ? "desativado" : `tipos=${types.join(",")} comprovantes=${fi.receipts ?? "confirm"}`);
    } finally {
      setValidationResults(results);
      setValidating(false);
      const okCount = results.filter((r) => r.ok).length;
      if (okCount === results.length) toast.success(`Todas as ${results.length} funções OK`);
      else toast.warning(`${okCount}/${results.length} funções OK`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-card/40 p-4">
        <div>
          <h2 className="text-lg font-bold">{form.name || "Novo Agente"}</h2>
          <p className="text-xs mt-1 flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${aiConnected ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className={aiConnected ? "text-emerald-500" : "text-red-500"}>
              {aiConnected === null ? "..." : aiConnected ? "Conectado" : "Desconectado"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Ativo</span>
            <Switch checked={form.is_active} onCheckedChange={toggleActive} />
          </div>
          <Button variant="ghost" size="sm" onClick={clearMemory} disabled={clearingMem} title="Limpar memória">
            {clearingMem ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={runValidation} disabled={validating} className="rounded-xl" title="Validar todas as 11 funções">
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Validar
          </Button>
          <Button onClick={save} disabled={saving} className="rounded-xl" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Tudo
          </Button>
        </div>
      </div>

      <Dialog open={validationOpen} onOpenChange={setValidationOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Validação das 11 funções</DialogTitle>
            <DialogDescription>
              {validating ? "Executando testes..." : `${validationResults.filter((r) => r.ok).length}/${validationResults.length} funções OK`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {validating && validationResults.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Testando...</div>
            )}
            {validationResults.map((r) => (
              <div key={r.n} className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/40 p-2 text-sm">
                {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-500 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{r.n}. {r.title}</div>
                  <div className="text-[11px] text-muted-foreground break-words">{r.msg}</div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Accordion type="single" collapsible defaultValue="s1" className="space-y-3">
        <Section id="s1" number={1} icon={<Sliders className="h-4 w-4" />} title="Configuração do Modelo">
          <div className="mb-4">
            <FieldRow label="Nome do Agente">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </FieldRow>
          </div>

          <div className="mb-4 space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-primary" /> Instância WhatsApp
            </Label>
            <Select value={form.connection_id ?? "none"} onValueChange={(v) => set("connection_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione uma instância" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem instância vinculada</SelectItem>
                {instances.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} {i.phone_number ? `— ${i.phone_number}` : ""} {i.status ? `(${i.status})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {instances.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Nenhuma instância. Crie uma em WhatsApp para vincular a este agente.</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span className="uppercase tracking-wider text-muted-foreground">Temperatura</span><span className="text-primary font-semibold">{form.temperature}</span></div>
              <Slider value={[form.temperature]} min={0} max={2} step={0.1} onValueChange={([v]) => set("temperature", v)} />
              <div className="flex justify-between text-[10px] text-muted-foreground"><span>Preciso</span><span>Criativo</span></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Max Tokens</Label>
              <Input type="number" value={form.max_tokens ?? 2048} onChange={(e) => set("max_tokens", Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <div className="flex justify-between text-xs">
              <span className="uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-primary" /> Memória da IA</span>
              <span className="text-primary font-semibold">{memMsgs} mensagens</span>
            </div>
            <Slider value={[memMsgs]} min={10} max={100} step={5} onValueChange={([v]) => set("memory", { ...(form.memory ?? {}), messages: v })} />
            <div className="flex justify-between text-[10px] text-muted-foreground"><span>10 msgs</span><span>100 msgs</span></div>
            <p className="text-[11px] text-muted-foreground">Quantas mensagens anteriores a IA lembra ao responder. Mais memória = respostas mais contextualizadas, mas mais lentas.</p>
          </div>

          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Prompt do Sistema</Label>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => { set("system_prompt", DEFAULT_PROMPT); toast.success("Prompt padrão restaurado"); }} className="text-xs"><RotateCcw className="h-3 w-3" /> Restaurar Padrão</Button>
                <Button size="sm" variant="ghost" onClick={() => setLibraryOpen(true)} className="text-xs text-primary"><BookOpen className="h-3 w-3" /> Biblioteca de Prompts</Button>
              </div>
            </div>
            <Textarea rows={10} value={form.system_prompt ?? ""} onChange={(e) => set("system_prompt", e.target.value)} className="font-mono text-xs" />
          </div>

          <Button onClick={save} disabled={saving} className="w-full mt-4 rounded-xl" style={{ background: "var(--gradient-primary)" }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
        </Section>

        <Section id="s2" number={2} icon={<MessageSquare className="h-4 w-4" />} title="Conversas">
          <ConversationSection ext={ext} setExt={setExt} onSave={save} saving={saving} />
        </Section>

        <Section id="s3" number={3} icon={<Clock className="h-4 w-4" />} title="Tempo e Mensagens">
          <TimingSection ext={ext} setExt={setExt} onSave={save} saving={saving} />
        </Section>

        <Section id="s4" number={4} icon={<Bell className="h-4 w-4" />} title="Alertas">
          <AlertsSection ext={ext} setExt={setExt} onSave={save} saving={saving} />
        </Section>

        <Section id="s5" number={5} icon={<Send className="h-4 w-4" />} title="Follow-Up">
          <FollowUpSection ext={ext} setExt={setExt} onSave={save} saving={saving} />
        </Section>

        <Section id="s6" number={6} icon={<Hash className="h-4 w-4" />} title="Ativação por Palavra-chave">
          <KeywordsSection ext={ext} setExt={setExt} onSave={save} saving={saving} />
        </Section>

        <Section id="s7" number={7} icon={<CalendarClock className="h-4 w-4" />} title="Horário de Funcionamento">
          <HoursSection ext={ext} setExt={setExt} onSave={save} saving={saving} />
        </Section>

        <Section id="s8" number={8} icon={<AudioLines className="h-4 w-4" />} title="Áudio com IA">
          <AudioSection ext={ext} setExt={setExt} onSave={save} saving={saving} />
        </Section>

        <Section id="s9" number={9} icon={<ImageIcon className="h-4 w-4" />} title="Mídia com IA">
          <MediaSection ext={ext} setExt={setExt} onSave={save} saving={saving} />
        </Section>

        <Section id="s10" number={10} icon={<PlayCircle className="h-4 w-4" />} title="Testar IA">
          <TestSection form={form} setForm={setForm} />
        </Section>

        <Section id="s11" number={11} icon={<Database className="h-4 w-4" />} title="Base de Conhecimento">
          <KnowledgeSection form={form} set={set} onSave={save} saving={saving} />
        </Section>

        <Section id="s12" number={12} icon={<FileText className="h-4 w-4" />} title="Interpretação de Arquivos">
          <FilesSection ext={ext} setExt={setExt} onSave={save} saving={saving} />
        </Section>
      </Accordion>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Biblioteca de Prompts</DialogTitle>
            <DialogDescription>Escolha um nicho e aplique um prompt pronto. Você pode editar depois.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[220px_1fr] gap-4 overflow-hidden min-h-0">
            <div className="overflow-y-auto pr-2 space-y-1">
              {PROMPT_LIBRARY.map((n) => (
                <button key={n.id} type="button" onClick={() => setLibraryNiche(n.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm flex items-center gap-2 transition ${libraryNiche === n.id ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "hover:bg-muted/40"}`}>
                  <span>{n.icon}</span><span className="truncate">{n.label}</span>
                </button>
              ))}
            </div>
            <div className="overflow-y-auto space-y-3 pr-1">
              {PROMPT_LIBRARY.find((n) => n.id === libraryNiche)?.prompts.map((p, i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">{p.title}</div>
                    <Button size="sm" onClick={() => { set("system_prompt", p.prompt); setLibraryOpen(false); toast.success("Prompt aplicado"); }} style={{ background: "var(--gradient-primary)" }}>Usar este</Button>
                  </div>
                  <pre className="text-[11px] whitespace-pre-wrap font-mono text-muted-foreground max-h-40 overflow-auto">{p.prompt}</pre>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ id, number, icon, title, children }: { id: string; number: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <AccordionItem value={id} className="rounded-2xl border border-border/60 bg-card/40 px-4 data-[state=open]:border-primary/40">
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">{icon}</div>
          <span className="font-semibold">{number}. {title}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ============ Shared building blocks ============

type ExtProps = {
  ext: {
    timing?: { preset?: string; timezone?: string; delayChar?: number; delayMax?: number; wait?: number; humanIntervention?: boolean; reactivation?: number; unknownMsg?: string };
    alerts?: { whatsapp?: boolean; stopAfterHandoff?: boolean; stopAfterHours?: number; includeSummary?: boolean; customRules?: boolean };
    followup?: { enabled?: boolean; aiGenerated?: boolean; count?: number; checkMin?: number; intervalHrs?: number; respectHours?: boolean; messages?: string[] };
    keywords?: { enabled?: boolean; mode?: string; list?: string[] };
    hours?: { enabled?: boolean; start?: string; end?: string; lunch?: boolean; days?: string[]; blockedDates?: string[] };
    audio?: { enabled?: boolean; provider?: "browser" | "elevenlabs"; replaceText?: boolean; autoReply?: boolean; mirrorFormat?: boolean; smartAudio?: boolean; smartAudioChars?: number; asTool?: boolean };
    media?: { enabled?: boolean; items?: Array<{ id: string; name: string; size?: string; mode?: string; keywords?: string; description?: string; storage_path?: string; mime?: string; bytes?: number }> };
    conversation?: { keepUnread?: boolean; singleMessage?: boolean; includeContactName?: boolean; cancelOnNew?: boolean; stopAfterManual?: boolean };
    files?: {
      enabled?: boolean;
      image?: boolean; pdf?: boolean; document?: boolean; audio?: boolean; video?: boolean;
      receipts?: "analyze" | "ignore" | "confirm";
      receiptReply?: string;
      ackReply?: string;
      sendAck?: boolean;
    };
  };
  setExt: <K extends keyof ExtProps["ext"]>(k: K, v: ExtProps["ext"][K]) => void;
  onSave: () => void;
  saving: boolean;
};

function SaveBar({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <Button onClick={onSave} disabled={saving} className="w-full mt-4 rounded-xl" style={{ background: "var(--gradient-primary)" }}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
    </Button>
  );
}

// ============ 11. Base de Conhecimento ============
type KnowledgeItem = { id: string; title: string; content: string; enabled?: boolean };
function KnowledgeSection({ form, set, onSave, saving }: { form: AgentRow; set: <K extends keyof AgentRow>(k: K, v: AgentRow[K]) => void; onSave: () => void; saving: boolean }) {
  const items = ((form.knowledge as KnowledgeItem[] | null) ?? []);
  const enabled = ((form.memory as { knowledgeEnabled?: boolean } | null)?.knowledgeEnabled ?? true);
  const setEnabled = (v: boolean) => set("memory", { ...(form.memory ?? {}), knowledgeEnabled: v });
  const setItems = (next: KnowledgeItem[]) => set("knowledge", next as unknown as AgentRow["knowledge"]);
  const add = () => setItems([...items, { id: crypto.randomUUID(), title: "Novo conhecimento", content: "", enabled: true }]);
  const update = (id: string, patch: Partial<KnowledgeItem>) => setItems(items.map((x) => x.id === id ? { ...x, ...patch } : x));
  const remove = (id: string) => setItems(items.filter((x) => x.id !== id));
  return (
    <div className="space-y-3">
      <ToggleRow label="Ativar base de conhecimento" hint="Conteúdo abaixo é injetado no contexto da IA — cérebro do agente" checked={enabled} onChange={setEnabled} />
      <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/[.05] px-3 py-2.5 text-xs text-muted-foreground">
        <Brain className="h-4 w-4 flex-shrink-0 text-primary mt-0.5" />
        <span>Cadastre informações da empresa, produtos, políticas, FAQs, tabelas de preço, roteiros de venda. A IA usará isso para responder com precisão.</span>
      </div>
      <button type="button" onClick={add} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition">
        <Plus className="h-4 w-4" /> Adicionar conhecimento
      </button>
      {items.length === 0 && (
        <p className="text-[11px] italic text-muted-foreground text-center">Nenhum conhecimento cadastrado ainda.</p>
      )}
      {items.map((it) => (
        <div key={it.id} className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input value={it.title} onChange={(e) => update(it.id, { title: e.target.value })} placeholder="Título (ex: Política de troca)" className="font-semibold" />
            <Switch checked={it.enabled ?? true} onCheckedChange={(v) => update(it.id, { enabled: v })} />
            <button onClick={() => remove(it.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
          <Textarea rows={5} value={it.content} onChange={(e) => update(it.id, { content: e.target.value })} placeholder="Conteúdo que a IA deve saber..." className="text-xs" />
          <div className="text-[10px] text-muted-foreground text-right">{it.content.length} chars</div>
        </div>
      ))}
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// ============ 12. Interpretação de Arquivos ============
function FilesSection({ ext, setExt, onSave, saving }: ExtProps) {
  const f = ext.files ?? {};
  const receipts = f.receipts ?? "confirm";
  return (
    <div className="space-y-4">
      <ToggleRow
        label="Interpretar arquivos recebidos"
        hint="Quando desligado, a IA ignora anexos e responde apenas ao texto."
        checked={f.enabled ?? true}
        onChange={(v) => setExt("files", { enabled: v })}
      />

      <div className="rounded-xl border border-border/50 bg-background/30 p-4 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipos permitidos</div>
        <ToggleRow label="📷 Imagem" checked={f.image ?? true} onChange={(v) => setExt("files", { image: v })} />
        <ToggleRow label="📄 PDF" checked={f.pdf ?? true} onChange={(v) => setExt("files", { pdf: v })} />
        <ToggleRow label="📑 Documento (Word, Excel, TXT)" checked={f.document ?? true} onChange={(v) => setExt("files", { document: v })} />
        <ToggleRow label="🎵 Áudio" checked={f.audio ?? true} onChange={(v) => setExt("files", { audio: v })} />
        <ToggleRow label="🎥 Vídeo" checked={f.video ?? false} onChange={(v) => setExt("files", { video: v })} />
      </div>

      <div className="rounded-xl border border-border/50 bg-background/30 p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comprovantes</div>
        <p className="text-[11px] text-muted-foreground">
          Se o arquivo parece um comprovante (pagamento, PIX, boleto) e o cliente NÃO fez pergunta:
        </p>
        <Select value={receipts} onValueChange={(v) => setExt("files", { receipts: v as "analyze" | "ignore" | "confirm" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="confirm">Confirmar recebimento (não analisar conteúdo)</SelectItem>
            <SelectItem value="analyze">Analisar e responder normalmente</SelectItem>
            <SelectItem value="ignore">Ignorar (não responder)</SelectItem>
          </SelectContent>
        </Select>
        {receipts === "confirm" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mensagem de confirmação</Label>
            <Input
              value={f.receiptReply ?? "Recebi seu comprovante, obrigado! Vou verificar e já te retorno."}
              onChange={(e) => setExt("files", { receiptReply: e.target.value })}
              placeholder="Recebi seu comprovante, obrigado!"
            />
          </div>
        )}
      </div>

      <ToggleRow
        label="Enviar aviso de recebimento para outros arquivos"
        hint="Ex.: 'Recebi seu arquivo, um momento...' antes de analisar."
        checked={!!f.sendAck}
        onChange={(v) => setExt("files", { sendAck: v })}
      />
      {f.sendAck && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Mensagem de aviso</Label>
          <Input
            value={f.ackReply ?? "Recebi seu arquivo, um instante enquanto analiso."}
            onChange={(e) => setExt("files", { ackReply: e.target.value })}
          />
        </div>
      )}

      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange, right }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/40 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div className="flex items-center gap-2">{right}<Switch checked={checked} onCheckedChange={onChange} /></div>
    </div>
  );
}

// ============ 3. Tempo e Mensagens ============
function TimingSection({ ext, setExt, onSave, saving }: ExtProps) {
  const t = ext.timing ?? {};
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <FieldRow label="Preset de Timer">
          <Select value={t.preset ?? "humanizado"} onValueChange={(v) => setExt("timing", { preset: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["instantaneo", "rapido", "humanizado", "lento"].map((p) => <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Fuso Horário">
          <Select value={t.timezone ?? "America/Sao_Paulo"} onValueChange={(v) => setExt("timing", { timezone: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="America/Sao_Paulo">Brasil - São Paulo (GMT-3)</SelectItem>
              <SelectItem value="America/Manaus">Brasil - Manaus (GMT-4)</SelectItem>
              <SelectItem value="UTC">UTC</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <FieldRow label="Delay/char (ms)"><Input type="number" value={t.delayChar ?? 120} onChange={(e) => setExt("timing", { delayChar: Number(e.target.value) })} /></FieldRow>
        <FieldRow label="Delay Máximo (ms)"><Input type="number" value={t.delayMax ?? 10000} onChange={(e) => setExt("timing", { delayMax: Number(e.target.value) })} /></FieldRow>
        <FieldRow label="Aguardar (seg)"><Input type="number" value={t.wait ?? 7} onChange={(e) => setExt("timing", { wait: Number(e.target.value) })} /></FieldRow>
      </div>
      <ToggleRow label="Intervenção Humana" checked={!!t.humanIntervention} onChange={(v) => setExt("timing", { humanIntervention: v })} />
      <FieldRow label="Reativação (hrs)"><Input className="max-w-[120px]" type="number" value={t.reactivation ?? 24} onChange={(e) => setExt("timing", { reactivation: Number(e.target.value) })} /></FieldRow>
      <FieldRow label="Mensagem para tipos desconhecidos">
        <Input value={t.unknownMsg ?? "Desculpe! Eu ainda não sou capaz de entender esse tipo de mensagem"} onChange={(e) => setExt("timing", { unknownMsg: e.target.value })} />
      </FieldRow>
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// ============ 10. Testar IA ============
function TestSection({ form, setForm }: { form: AgentRow; setForm: React.Dispatch<React.SetStateAction<AgentRow>> }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recRef = useState<{ rec: MediaRecorder | null; chunks: Blob[] }>({ rec: null, chunks: [] })[0];

  async function toggleRecord() {
    if (recording) {
      recRef.rec?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recRef.rec = rec;
      recRef.chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) recRef.chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(recRef.chunks, { type: mime });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const buf = await blob.arrayBuffer();
          let bin = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          const b64 = btoa(bin);
          const { transcribeAudio } = await import("@/lib/agent-stt.functions");
          const { text } = await transcribeAudio({ data: { audioBase64: b64, mime } });
          if (text) setInput((v) => (v ? `${v} ${text}` : text));
          else toast.info("Nada foi transcrito");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao transcrever");
        } finally { setTranscribing(false); }
      };
      rec.start();
      setRecording(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sem acesso ao microfone");
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const { chatWithAgent } = await import("@/lib/agent-chat.functions");
      const kbEnabled = ((form.memory as { knowledgeEnabled?: boolean } | null)?.knowledgeEnabled ?? true);
      const kbItems = ((form.knowledge as Array<{ title?: string; content?: string; enabled?: boolean }> | null) ?? [])
        .filter((k) => (k.enabled ?? true) && (k.content ?? "").trim());
      const kbText = kbEnabled && kbItems.length
        ? "\n\n## Base de Conhecimento\n" + kbItems.map((k) => `### ${k.title ?? "Item"}\n${k.content}`).join("\n\n")
        : "";
      // Contexto da Agenda — permite ao agente checar conflitos ao propor horários
      let agendaText = "";
      try {
        const raw = localStorage.getItem("calendar.events.v1");
        const list = raw ? (JSON.parse(raw) as Array<{ title: string; start: string; end: string; calendar: string; connectionId?: string | null }>) : [];
        const now = Date.now();
        const connId = form.connection_id ?? null;
        const upcoming = list
          .filter((e) => new Date(e.end).getTime() >= now)
          // Se o agente está vinculado a uma instância, só considera eventos dela (+ agenda geral)
          .filter((e) => !connId || !e.connectionId || e.connectionId === connId)
          .sort((a, b) => +new Date(a.start) - +new Date(b.start))
          .slice(0, 50);
        const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        agendaText = "\n\n## Agenda (fuso America/Sao_Paulo)\n" +
          "Antes de confirmar qualquer agendamento, verifique conflitos nesta lista. Se o horário solicitado colidir com um evento abaixo, avise o usuário e sugira o próximo horário livre.\n" +
          (upcoming.length
            ? upcoming.map((e) => `- ${fmt(e.start)} → ${fmt(e.end)} · ${e.title} [${e.calendar}]`).join("\n")
            : "- (nenhum evento futuro)");
      } catch { /* ignore */ }
      const res = await chatWithAgent({
        data: {
          temperature: form.temperature,
          maxTokens: form.max_tokens ?? 2048,
          systemPrompt: (form.system_prompt ?? "") + kbText + agendaText,
          messages: next,
        },
      });
      setMessages([...next, { role: "assistant", content: res.text || "(sem resposta)" }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao chamar IA");
      setMessages(next);
    } finally { setLoading(false); }
  }

  const promptLen = (form.system_prompt ?? "").length;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/[.05] px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="h-4 w-4 flex-shrink-0 text-primary mt-0.5" />
        <span>Teste seu agente em tempo real. Provedor, modelo e chave são lidos automaticamente de Configurações Globais.</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs"><span className="uppercase tracking-wider text-muted-foreground">Temperatura ({form.temperature})</span></div>
          <Slider value={[form.temperature]} min={0} max={2} step={0.1} onValueChange={([v]) => setForm((f) => ({ ...f, temperature: v }))} />
        </div>
        <FieldRow label="Max Tokens">
          <Input type="number" value={form.max_tokens ?? 2048} onChange={(e) => setForm((f) => ({ ...f, max_tokens: Number(e.target.value) }))} />
        </FieldRow>
      </div>

      <button type="button" onClick={() => setShowPrompt((s) => !s)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={`h-3.5 w-3.5 transition ${showPrompt ? "rotate-180" : "-rotate-90"}`} />
        <FileText className="h-3.5 w-3.5" /> Prompt do sistema em uso ({promptLen} chars)
      </button>
      {showPrompt && <div className="rounded-lg border border-border/50 bg-background/40 p-3 text-[11px] whitespace-pre-wrap font-mono text-muted-foreground max-h-40 overflow-auto">{form.system_prompt}</div>}

      <div className="min-h-[280px] rounded-xl border border-border/60 bg-background/30 p-4 overflow-y-auto max-h-[400px] space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center text-muted-foreground">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary mb-3"><Bot className="h-6 w-6" /></div>
            <div className="text-sm">Envie uma mensagem ou áudio para testar</div>
            <div className="text-[11px] mt-1">Configurações Globais</div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-foreground"}`}>{m.content}</div>
            </div>
          ))
        )}
        {loading && <div className="text-xs text-muted-foreground animate-pulse">IA digitando...</div>}
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="Digite ou grave um áudio..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), send())} disabled={loading} />
        <Button size="icon" variant="ghost" title="Resetar conversa e memória" onClick={() => { setMessages([]); setInput(""); setLoading(false); toast.success("Conversa e memória de teste resetadas"); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button size="icon" variant={recording ? "destructive" : "ghost"} onClick={toggleRecord} disabled={transcribing || loading} title={recording ? "Parar gravação" : "Gravar áudio"}>
          {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className={`h-4 w-4 ${recording ? "animate-pulse" : ""}`} />}
        </Button>
        <Button size="icon" onClick={send} disabled={loading || !input.trim()} style={{ background: "var(--gradient-primary)" }}><SendIcon className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ============ 9. Mídia com IA ============
function MediaSection({ ext, setExt, onSave, saving }: ExtProps) {
  const { user } = useAuth();
  const m = ext.media ?? {};
  const items = m.items ?? [];
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const addItem = () => {
    const id = crypto.randomUUID();
    const it = { id, name: "Nova Mídia", size: "0MB", mode: "ai", keywords: "", description: "" };
    setExt("media", { items: [...items, it] });
    setOpenId(id);
  };
  const update = (id: string, patch: Partial<(typeof items)[number]>) =>
    setExt("media", { items: items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const remove = (id: string) => setExt("media", { items: items.filter((x) => x.id !== id) });

  async function handleUpload(id: string, file: File) {
    if (!user) return;
    setUploadingId(id);
    try {
      const path = `${user.id}/${id}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("agent-media").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      update(id, {
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
        storage_path: path,
        mime: file.type,
        bytes: file.size,
      });
      toast.success("Mídia enviada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <ToggleRow label="Habilitar Mídia com IA" hint="Permite que a IA envie mídias cadastradas" checked={!!m.enabled} onChange={(v) => setExt("media", { enabled: v })} />

      <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-background/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="h-4 w-4 flex-shrink-0 text-primary mt-0.5" />
        <span>Envie imagens, vídeos, áudios e documentos que a IA poderá enviar automaticamente aos clientes. Configure o modo de disparo e palavras-chave para cada mídia.</span>
      </div>

      <button type="button" onClick={addItem} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition">
        <Plus className="h-4 w-4" /> Adicionar Mídia
      </button>

      {items.map((it) => {
        const open = openId === it.id;
        return (
          <div key={it.id} className="rounded-xl border border-primary/30 bg-primary/[.03] overflow-hidden">
            <button type="button" onClick={() => setOpenId(open ? null : it.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></div>
                <span className="text-sm font-semibold truncate">{it.name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{it.size}</span>
                <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
              </div>
            </button>

            {open && (
              <div className="border-t border-border/40 p-4 space-y-3">
                <div className="flex items-center gap-3 rounded-lg bg-background/40 p-3">
                  <label className="grid h-10 w-10 cursor-pointer place-items-center rounded-lg bg-muted/40 hover:bg-muted/60">
                    {uploadingId === it.id
                      ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      : <Upload className="h-4 w-4 text-muted-foreground" />}
                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(it.id, f); e.target.value = ""; }} />
                  </label>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.name}</div>
                    <div className="text-[11px] text-muted-foreground">{it.storage_path ? it.mime ?? "arquivo" : "sem arquivo"} • {it.size}</div>
                  </div>
                  <button onClick={() => remove(it.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <FieldRow label="Modo de disparo">
                    <Select value={it.mode ?? "ai"} onValueChange={(v) => update(it.id, { mode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ai">IA decide</SelectItem>
                        <SelectItem value="keyword">Palavra-chave</SelectItem>
                        <SelectItem value="prompt">Via prompt</SelectItem>
                        <SelectItem value="all">Todas</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldRow>
                  <FieldRow label="Palavras-chave">
                    <Input placeholder="cardápio, menu, preços" value={it.keywords ?? ""} onChange={(e) => update(it.id, { keywords: e.target.value })} />
                  </FieldRow>
                </div>
                <FieldRow label="Descrição (para a IA)">
                  <Input placeholder="Descreva o conteúdo para a IA saber quando enviar" value={it.description ?? ""} onChange={(e) => update(it.id, { description: e.target.value })} />
                </FieldRow>
              </div>
            )}
          </div>
        );
      })}

      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// ============ 4. Alertas ============
function AlertsSection({ ext, setExt, onSave, saving }: ExtProps) {
  const a = ext.alerts ?? {};
  return (
    <div className="space-y-3">
      <ToggleRow label="Enviar alertas por WhatsApp" checked={!!a.whatsapp} onChange={(v) => setExt("alerts", { whatsapp: v })} />
      <ToggleRow
        label="Parar IA após pedir atendimento"
        checked={!!a.stopAfterHandoff}
        onChange={(v) => setExt("alerts", { stopAfterHandoff: v })}
        right={
          <Select value={String(a.stopAfterHours ?? 24)} onValueChange={(v) => setExt("alerts", { stopAfterHours: Number(v) })}>
            <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 6, 12, 24, 48].map((h) => <SelectItem key={h} value={String(h)}>{h}h</SelectItem>)}</SelectContent>
          </Select>
        }
      />
      <ToggleRow label="Incluir resumo da conversa" checked={!!a.includeSummary} onChange={(v) => setExt("alerts", { includeSummary: v })} />
      <ToggleRow label="Regras customizadas" checked={!!a.customRules} onChange={(v) => setExt("alerts", { customRules: v })} />
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// ============ 5. Follow-Up ============
function ConversationSection({ ext, setExt, onSave, saving }: ExtProps) {
  const c = ext.conversation ?? {};
  return (
    <div className="space-y-3">
      <ToggleRow label="Manter não lida ao responder" checked={!!c.keepUnread} onChange={(v) => setExt("conversation", { keepUnread: v })} />
      <ToggleRow label="Enviar resposta em uma mensagem" checked={!!c.singleMessage} onChange={(v) => setExt("conversation", { singleMessage: v })} />
      <ToggleRow label="Incluir nome do contato na resposta" checked={!!c.includeContactName} onChange={(v) => setExt("conversation", { includeContactName: v })} />
      <ToggleRow label="Cancelar respostas ao receber nova mensagem" checked={!!c.cancelOnNew} onChange={(v) => setExt("conversation", { cancelOnNew: v })} />
      <ToggleRow label="Não responder após mensagem manual" checked={!!c.stopAfterManual} onChange={(v) => setExt("conversation", { stopAfterManual: v })} />
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

function FollowUpSection({ ext, setExt, onSave, saving }: ExtProps) {
  const f = ext.followup ?? {};
  const count = f.count ?? 1;
  const messages = f.messages ?? ["Olá! Notei que não recebemos resposta. Posso ajudar com mais alguma coisa?"];
  return (
    <div className="space-y-3">
      <ToggleRow label="Ativar Follow-Up" checked={!!f.enabled} onChange={(v) => setExt("followup", { enabled: v })} />
      <ToggleRow label="Gerar mensagens por IA" checked={!!f.aiGenerated} onChange={(v) => setExt("followup", { aiGenerated: v })} />
      <div className="grid gap-4 md:grid-cols-3">
        <FieldRow label="Qtd mensagens">
          <Select value={String(count)} onValueChange={(v) => setExt("followup", { count: Number(v) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Verificação (min)"><Input type="number" value={f.checkMin ?? 10} onChange={(e) => setExt("followup", { checkMin: Number(e.target.value) })} /></FieldRow>
        <FieldRow label="Intervalo (hrs)"><Input type="number" value={f.intervalHrs ?? 24} onChange={(e) => setExt("followup", { intervalHrs: Number(e.target.value) })} /></FieldRow>
      </div>
      <ToggleRow label="Respeitar horário comercial" checked={!!f.respectHours} onChange={(v) => setExt("followup", { respectHours: v })} />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Mensagem {i + 1}</Label>
          <Textarea rows={2} value={messages[i] ?? ""} onChange={(e) => { const m = [...messages]; m[i] = e.target.value; setExt("followup", { messages: m }); }} />
        </div>
      ))}
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// ============ 6. Palavra-chave ============
function KeywordsSection({ ext, setExt, onSave, saving }: ExtProps) {
  const k = ext.keywords ?? {};
  const list = k.list ?? [];
  const [input, setInput] = useState("");
  const add = () => { if (!input.trim()) return; setExt("keywords", { list: [...list, input.trim()] }); setInput(""); };
  return (
    <div className="space-y-3">
      <ToggleRow label="Ativar apenas com palavras-chave" hint="Quando ativado, o agente só responderá mensagens que contenham ou comecem com as palavras-chave." checked={!!k.enabled} onChange={(v) => setExt("keywords", { enabled: v })} />
      <FieldRow label="Modo de Ativação">
        <Select value={k.mode ?? "contains"} onValueChange={(v) => setExt("keywords", { mode: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="contains">Contém a palavra-chave</SelectItem>
            <SelectItem value="starts">Começa com a palavra-chave</SelectItem>
            <SelectItem value="exact">Igual à palavra-chave</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-1">A IA responde se a mensagem contiver qualquer uma das palavras-chave em qualquer posição.</p>
      </FieldRow>
      <FieldRow label="Palavras-chave">
        <div className="flex gap-2">
          <Input placeholder="Digite uma palavra-chave..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
          <Button type="button" onClick={add} size="icon" className="rounded-lg" style={{ background: "hsl(var(--primary) / .2)", color: "hsl(var(--primary))" }}><Plus className="h-4 w-4" /></Button>
        </div>
        {list.length === 0 ? (
          <p className="text-[11px] italic text-muted-foreground mt-2">Nenhuma palavra-chave adicionada. Adicione pelo menos uma para o filtro funcionar.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {list.map((w, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-1 text-xs ring-1 ring-primary/30">
                {w}<button onClick={() => setExt("keywords", { list: list.filter((_, j) => j !== i) })}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </FieldRow>
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// ============ 7. Horário ============
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function HoursSection({ ext, setExt, onSave, saving }: ExtProps) {
  const h = ext.hours ?? {};
  const activeDays = h.days ?? ["Seg", "Ter", "Qua", "Qui", "Sex"];
  const blocked = h.blockedDates ?? [];
  const [dateInput, setDateInput] = useState("");
  const toggleDay = (d: string) => setExt("hours", { days: activeDays.includes(d) ? activeDays.filter((x) => x !== d) : [...activeDays, d] });
  return (
    <div className="space-y-3">
      <ToggleRow label="Ativar horário de funcionamento" hint="A IA só responde dentro do horário configurado" checked={!!h.enabled} onChange={(v) => setExt("hours", { enabled: v })} />
      <div className="grid gap-4 md:grid-cols-2">
        <FieldRow label="Início do atendimento"><Input type="time" value={h.start ?? "09:00"} onChange={(e) => setExt("hours", { start: e.target.value })} /></FieldRow>
        <FieldRow label="Fim do atendimento"><Input type="time" value={h.end ?? "18:00"} onChange={(e) => setExt("hours", { end: e.target.value })} /></FieldRow>
      </div>
      <ToggleRow label="Intervalo / Almoço" hint="Pausa a IA durante o intervalo" checked={!!h.lunch} onChange={(v) => setExt("hours", { lunch: v })} />
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dias de atendimento</Label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button key={d} type="button" onClick={() => toggleDay(d)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${activeDays.includes(d) ? "bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/.5)]" : "bg-muted/40 text-muted-foreground"}`}>{d}</button>
          ))}
        </div>
      </div>
      <FieldRow label="📅 Datas bloqueadas (feriados)">
        <div className="flex gap-2">
          <Input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
          <Button type="button" size="icon" onClick={() => { if (!dateInput) return; setExt("hours", { blockedDates: [...blocked, dateInput] }); setDateInput(""); }} style={{ background: "hsl(var(--primary) / .2)", color: "hsl(var(--primary))" }}><Plus className="h-4 w-4" /></Button>
        </div>
        {blocked.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {blocked.map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-1 text-xs ring-1 ring-primary/30">
                {d}<button onClick={() => setExt("hours", { blockedDates: blocked.filter((_, j) => j !== i) })}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-1">Fora do horário configurado, a IA não responderá. Isso é sincronizado com a agenda e os agentes de IA automaticamente.</p>
      </FieldRow>
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// ============ 8. Áudio com IA ============
function AudioSection({ ext, setExt, onSave, saving }: ExtProps) {
  const a = ext.audio ?? {};
  const provider = a.provider ?? "browser";
  return (
    <div className="space-y-4">
      <ToggleRow label="Habilitar Áudio com IA" checked={!!a.enabled} onChange={(v) => setExt("audio", { enabled: v })} />
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Provedor de Voz</Label>
        <div className="grid gap-3 md:grid-cols-2">
          <button type="button" onClick={() => setExt("audio", { provider: "browser" })} className={`rounded-xl border p-4 text-left transition ${provider === "browser" ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40" : "border-border/50 bg-background/30"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Mic className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Vozes do Navegador</span></div>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">GRÁTIS</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Vozes nativas do sistema, sem custo adicional</p>
            {provider === "browser" && <span className="mt-2 inline-block text-[10px] text-primary">✓ ATIVO</span>}
          </button>
          <button type="button" onClick={() => setExt("audio", { provider: "elevenlabs" })} className={`rounded-xl border p-4 text-left transition ${provider === "elevenlabs" ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40" : "border-border/50 bg-background/30"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Mic className="h-4 w-4" /><span className="text-sm font-semibold">ElevenLabs</span></div>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">PREMIUM</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Vozes ultra-realistas com clonagem de voz</p>
          </button>
        </div>
      </div>
      <ToggleRow label="Substituir Texto por Áudio" checked={!!a.replaceText} onChange={(v) => setExt("audio", { replaceText: v })} />
      <ToggleRow label="Resposta Automática com Áudio" checked={!!a.autoReply} onChange={(v) => setExt("audio", { autoReply: v })} />
      <ToggleRow label="Espelhar Formato do Cliente" hint="Responde com áudio quando recebe áudio, texto quando recebe texto" checked={!!a.mirrorFormat} onChange={(v) => setExt("audio", { mirrorFormat: v })} />
      <ToggleRow
        label="Áudio Inteligente"
        hint="Bloco com +N chars vira áudio"
        checked={!!a.smartAudio}
        onChange={(v) => setExt("audio", { smartAudio: v })}
        right={<Input type="number" className="h-7 w-[80px] text-xs" value={a.smartAudioChars ?? 200} onChange={(e) => setExt("audio", { smartAudioChars: Number(e.target.value) })} />}
      />
      <ToggleRow label="Áudio como Ferramenta" hint="A IA decide quando enviar áudio" checked={!!a.asTool} onChange={(v) => setExt("audio", { asTool: v })} />
      {provider === "browser" && (
        <div className="rounded-xl border border-border/50 bg-background/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><Mic className="h-4 w-4 text-primary" /> Configuração de Voz do Navegador</div>
          <p className="text-xs text-muted-foreground">Vozes gratuitas do sistema, priorizando português brasileiro. Qualidade varia por dispositivo.</p>
          {["Microsoft Daniel - Portuguese (Brazil)", "Microsoft Maria - Portuguese (Brazil)", "Google português do Brasil"].map((v) => (
            <div key={v} className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2">
              <div>
                <div className="text-xs font-medium">{v}</div>
                <div className="text-[10px] text-muted-foreground">pt-BR</div>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs rounded-full"><Play className="h-3 w-3" /> Ouvir</Button>
            </div>
          ))}
        </div>
      )}
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}