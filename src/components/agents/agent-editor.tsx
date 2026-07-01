import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Save, RotateCcw, Sliders, MessageSquare, Clock, Bell, Send, Hash,
  CalendarClock, AudioLines, Image as ImageIcon, PlayCircle, BookOpen, Loader2,
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
import { PROVIDERS, type ProviderId } from "./providers";

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
    temperature: 0.7, is_active: true, ai_provider_id: null, connection_id: null,
    avatar_url: null, category: "Gemini", language: "pt-BR", timezone: "America/Sao_Paulo",
    model: "gemini-2.5-flash", max_tokens: 2048, top_p: 1, top_k: null, seed: null,
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

  useEffect(() => { setForm(agent ?? emptyAgent(user?.id ?? "")); }, [agent, user?.id]);

  const spec = PROVIDERS.find((p) => p.id === (form.category?.toLowerCase() as ProviderId)) ?? PROVIDERS[1];
  const memMsgs = ((form.memory as { messages?: number } | null)?.messages ?? 20);

  function set<K extends keyof AgentRow>(k: K, v: AgentRow[K]) { setForm((f) => ({ ...f, [k]: v })); }

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
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-card/40 p-4">
        <div>
          <h2 className="text-lg font-bold">{form.name || "Novo Agente"}</h2>
          <p className="text-xs text-muted-foreground">{form.category} — {form.model}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Ativo</span>
            <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel}><RotateCcw className="h-4 w-4" /></Button>
          <Button onClick={save} disabled={saving} className="rounded-xl" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Tudo
          </Button>
        </div>
      </div>

      <Accordion type="single" collapsible defaultValue="s1" className="space-y-3">
        <Section id="s1" number={1} icon={<Sliders className="h-4 w-4" />} title="Configuração do Modelo">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Provedor</Label>
              <Select value={(form.category ?? "gemini").toLowerCase()} onValueChange={(v) => { set("category", v); const p = PROVIDERS.find((x) => x.id === v); if (p) set("model", p.models[0] ?? null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Modelo</Label>
              {spec.models.length > 0 ? (
                <Select value={form.model ?? ""} onValueChange={(v) => set("model", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{spec.models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input value={form.model ?? ""} onChange={(e) => set("model", e.target.value)} />
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mt-4">
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
                <Button size="sm" variant="ghost" onClick={() => set("system_prompt", DEFAULT_PROMPT)} className="text-xs"><RotateCcw className="h-3 w-3" /> Restaurar Padrão</Button>
                <Button size="sm" variant="ghost" className="text-xs text-primary"><BookOpen className="h-3 w-3" /> Biblioteca de Prompts</Button>
              </div>
            </div>
            <Textarea rows={10} value={form.system_prompt ?? ""} onChange={(e) => set("system_prompt", e.target.value)} className="font-mono text-xs" />
          </div>

          <Button onClick={save} disabled={saving} className="w-full mt-4 rounded-xl" style={{ background: "var(--gradient-primary)" }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
        </Section>

        <Section id="s2" number={2} icon={<MessageSquare className="h-4 w-4" />} title="Conversas">
          <div className="space-y-3">
            <FieldRow label="Mensagem inicial"><Input value={form.initial_message ?? ""} onChange={(e) => set("initial_message", e.target.value)} /></FieldRow>
            <FieldRow label="Idioma">
              <Select value={form.language ?? "pt-BR"} onValueChange={(v) => set("language", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["pt-BR", "en-US", "es-ES"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </FieldRow>
          </div>
        </Section>

        <Section id="s3" number={3} icon={<Clock className="h-4 w-4" />} title="Tempo e Mensagens">
          <p className="text-sm text-muted-foreground">Delays entre mensagens, digitação humanizada e timers.</p>
        </Section>

        <Section id="s4" number={4} icon={<Bell className="h-4 w-4" />} title="Alertas">
          <p className="text-sm text-muted-foreground">Notificações para eventos e transferências.</p>
        </Section>

        <Section id="s5" number={5} icon={<Send className="h-4 w-4" />} title="Follow-Up">
          <p className="text-sm text-muted-foreground">Sequências automáticas de retomada.</p>
        </Section>

        <Section id="s6" number={6} icon={<Hash className="h-4 w-4" />} title="Ativação por Palavra-chave">
          <p className="text-sm text-muted-foreground">Palavras-chave que acionam o agente.</p>
        </Section>

        <Section id="s7" number={7} icon={<CalendarClock className="h-4 w-4" />} title="Horário de Funcionamento">
          <p className="text-sm text-muted-foreground">Defina janelas de atendimento por dia.</p>
        </Section>

        <Section id="s8" number={8} icon={<AudioLines className="h-4 w-4" />} title="Áudio com IA">
          <p className="text-sm text-muted-foreground">Transcrição e resposta em áudio.</p>
        </Section>

        <Section id="s9" number={9} icon={<ImageIcon className="h-4 w-4" />} title="Mídia com IA">
          <p className="text-sm text-muted-foreground">Análise de imagens, documentos e vídeos.</p>
        </Section>

        <Section id="s10" number={10} icon={<PlayCircle className="h-4 w-4" />} title="Testar IA">
          <p className="text-sm text-muted-foreground">Playground para conversar com o agente.</p>
        </Section>
      </Accordion>
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