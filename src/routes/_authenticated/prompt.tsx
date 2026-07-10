import { createFileRoute } from "@tanstack/react-router";
import { Brain, Sparkles, Loader2, Send, Mic, Square, Copy, Save, Bot, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CrudResource } from "@/components/crud-resource";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { MASTER_PROMPT_CONTENT, MASTER_PROMPT_NAME } from "@/lib/master-prompt";
import { useServerFn } from "@tanstack/react-start";
import { promptChat } from "@/lib/prompt-chat.functions";
import { transcribeAudio } from "@/lib/agent-stt.functions";

export const Route = createFileRoute("/_authenticated/prompt")({
  head: () => ({ meta: [{ title: "Prompts — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type ChatMsg = { role: "user" | "assistant"; content: string };

function Page() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function insertMaster() {
    if (!user) return;
    setBusy(true);
    const { data: existing } = await supabase
      .from("prompts")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", MASTER_PROMPT_NAME)
      .maybeSingle();
    if (existing?.id) {
      setBusy(false);
      toast.info("Prompt Mestre já existe na sua biblioteca.");
      return;
    }
    const { error } = await supabase.from("prompts").insert({
      user_id: user.id,
      name: MASTER_PROMPT_NAME,
      content: MASTER_PROMPT_CONTENT,
      is_default: false,
    } as never);
    setBusy(false);
    if (error) { toast.error("Falha ao adicionar Prompt Mestre"); return; }
    toast.success("Prompt Mestre adicionado — recarregue a lista.");
    window.location.reload();
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><Brain className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-semibold">Prompts</h1>
            <p className="text-sm text-muted-foreground">Converse com o Especialista e gere prompts prontos para seus agentes.</p>
          </div>
        </div>
        <Button onClick={insertMaster} disabled={busy} variant="outline" className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Adicionar Prompt Mestre
        </Button>
      </div>
      <Tabs defaultValue="chat" className="w-full">
        <TabsList>
          <TabsTrigger value="chat">Assistente</TabsTrigger>
          <TabsTrigger value="library">Biblioteca</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="mt-4">
          <PromptChat userId={user?.id ?? null} />
        </TabsContent>
        <TabsContent value="library" className="mt-4">
          <CrudResource
            table="prompts"
            title="Prompts"
            description="Biblioteca de prompts reutilizáveis."
            singular="Prompt"
            icon={<Brain className="h-6 w-6" />}
            fields={[
              { name: "name", label: "Nome", type: "text", required: true },
              { name: "content", label: "Conteúdo", type: "textarea", required: true },
              { name: "is_default", label: "Padrão", type: "boolean" },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function extractPromptBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /```(?:[a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const b = m[1].trim();
    if (b.length > 40) blocks.push(b);
  }
  return blocks;
}

function PromptChat({ userId }: { userId: string | null }) {
  const call = useServerFn(promptChat);
  const stt = useServerFn(transcribeAudio);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Olá! 👋 Sou seu Especialista em Engenharia de Prompt. Me conte: qual é o seu negócio e qual agente de IA você quer criar (atendimento, vendas, suporte, agendamento, etc.)?",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveContent, setSaveContent] = useState("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    const next: ChatMsg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { text: reply } = await call({ data: { messages: next } });
      setMessages((m) => [...m, { role: "assistant", content: reply || "(sem resposta)" }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao responder");
    } finally {
      setSending(false);
    }
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        setTranscribing(true);
        try {
          const b64 = await blobToBase64(blob);
          const { text } = await stt({ data: { audioBase64: b64, mime: blob.type } });
          if (text.trim()) await send(text.trim());
          else toast.info("Áudio não reconhecido");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao transcrever");
        } finally {
          setTranscribing(false);
        }
      };
      recRef.current = { mr, chunks, stream };
      mr.start();
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  }
  function stopRec() {
    recRef.current?.mr.stop();
    recRef.current = null;
    setRecording(false);
  }

  async function copyText(t: string) {
    await navigator.clipboard.writeText(t);
    toast.success("Copiado!");
  }
  function openSave(t: string) {
    setSaveContent(t);
    setSaveName("");
    setSaveOpen(true);
  }
  async function confirmSave() {
    if (!userId) return;
    const name = saveName.trim() || `Prompt gerado ${new Date().toLocaleString("pt-BR")}`;
    const { error } = await supabase.from("prompts").insert({
      user_id: userId,
      name,
      content: saveContent,
      is_default: false,
    } as never);
    if (error) { toast.error("Falha ao salvar"); return; }
    toast.success("Prompt salvo na biblioteca");
    setSaveOpen(false);
  }

  return (
    <Card className="flex h-[calc(100vh-14rem)] flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m, i) => {
          const blocks = m.role === "assistant" ? extractPromptBlocks(m.content) : [];
          return (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>
              )}
              <div className={`max-w-[80%] space-y-2 ${m.role === "user" ? "order-first" : ""}`}>
                <div className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.content}
                </div>
                {blocks.map((b, bi) => (
                  <div key={bi} className="rounded-lg border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Prompt gerado</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => copyText(b)}><Copy className="h-3.5 w-3.5" />Copiar</Button>
                        <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => openSave(b)}><Save className="h-3.5 w-3.5" />Salvar</Button>
                      </div>
                    </div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-foreground/90">{b}</pre>
                  </div>
                ))}
              </div>
              {m.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"><UserIcon className="h-4 w-4" /></div>
              )}
            </div>
          );
        })}
        {sending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
          </div>
        )}
        {transcribing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Transcrevendo áudio…
          </div>
        )}
      </div>
      <div className="border-t bg-background p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Descreva seu negócio ou responda ao especialista…"
            rows={2}
            className="min-h-[52px] resize-none"
            disabled={sending}
          />
          {recording ? (
            <Button variant="destructive" size="icon" onClick={stopRec} title="Parar gravação"><Square className="h-4 w-4" /></Button>
          ) : (
            <Button variant="outline" size="icon" onClick={startRec} disabled={sending || transcribing} title="Gravar áudio"><Mic className="h-4 w-4" /></Button>
          )}
          <Button onClick={() => send()} disabled={sending || !input.trim()} size="icon" title="Enviar"><Send className="h-4 w-4" /></Button>
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Salvar prompt na biblioteca</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome do prompt" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <Textarea value={saveContent} onChange={(e) => setSaveContent(e.target.value)} rows={10} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button>
            <Button onClick={confirmSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
