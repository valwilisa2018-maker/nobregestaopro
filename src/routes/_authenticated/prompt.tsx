import { createFileRoute } from "@tanstack/react-router";
import { Brain, Sparkles, Loader2, Send, Mic, Square, Copy, Save, Bot, User as UserIcon, Pencil, Plus, MessageSquare, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
      <div className="mt-4">
        <PromptChat userId={user?.id ?? null} />
      </div>
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
  const WELCOME: ChatMsg = {
    role: "assistant",
    content:
      "Olá! 👋 Sou seu Especialista em Engenharia de Prompt. Me conte: qual é o seu negócio e qual agente de IA você quer criar (atendimento, vendas, suporte, agendamento, etc.)?",
  };
  const [threads, setThreads] = useState<Array<{ id: string; title: string; updated_at: string }>>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME]);
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

  // Load thread list
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("prompt_chat_threads" as never)
        .select("id,title,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      const list = (data as Array<{ id: string; title: string; updated_at: string }> | null) ?? [];
      setThreads(list);
      if (list.length && !threadId) selectThread(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function selectThread(id: string) {
    setThreadId(id);
    const { data } = await supabase
      .from("prompt_chat_messages" as never)
      .select("role,content")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });
    const msgs = (data as ChatMsg[] | null) ?? [];
    setMessages(msgs.length ? msgs : [WELCOME]);
  }

  async function newThread() {
    setThreadId(null);
    setMessages([WELCOME]);
    setInput("");
  }

  async function deleteThread(id: string) {
    if (!confirm("Excluir esta conversa?")) return;
    await supabase.from("prompt_chat_threads" as never).delete().eq("id", id);
    setThreads((t) => t.filter((x) => x.id !== id));
    if (threadId === id) newThread();
  }

  async function ensureThread(firstUserText: string): Promise<string | null> {
    if (threadId || !userId) return threadId;
    const title = firstUserText.slice(0, 60) || "Nova conversa";
    const { data, error } = await supabase
      .from("prompt_chat_threads" as never)
      .insert({ user_id: userId, title } as never)
      .select("id,title,updated_at")
      .single();
    if (error || !data) return null;
    const row = data as { id: string; title: string; updated_at: string };
    setThreadId(row.id);
    setThreads((t) => [row, ...t]);
    return row.id;
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    if (!userId) { toast.error("Faça login para conversar"); return; }
    const next: ChatMsg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const tid = await ensureThread(content);
      if (tid) {
        await supabase.from("prompt_chat_messages" as never).insert({
          thread_id: tid, user_id: userId, role: "user", content,
        } as never);
      }
      const { text: reply } = await call({ data: { messages: next } });
      const assistant = reply || "(sem resposta)";
      setMessages((m) => [...m, { role: "assistant", content: assistant }]);
      if (tid) {
        await supabase.from("prompt_chat_messages" as never).insert({
          thread_id: tid, user_id: userId, role: "assistant", content: assistant,
        } as never);
        await supabase.from("prompt_chat_threads" as never)
          .update({ updated_at: new Date().toISOString() } as never).eq("id", tid);
        setThreads((t) => {
          const idx = t.findIndex((x) => x.id === tid);
          if (idx < 0) return t;
          const copy = [...t];
          const [row] = copy.splice(idx, 1);
          return [{ ...row, updated_at: new Date().toISOString() }, ...copy];
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao responder");
    } finally {
      setSending(false);
    }
  }

  async function startRec() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Microfone não suportado neste navegador");
        return;
      }
      const inIframe = typeof window !== "undefined" && window.self !== window.top;
      if (inIframe) {
        toast.error("O microfone está bloqueado no preview.", {
          description: "Abra o app em uma aba separada para gravar áudio.",
          action: {
            label: "Abrir em nova aba",
            onClick: () => window.open(window.location.href, "_blank", "noopener"),
          },
          duration: 10000,
        });
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const pick = candidates.find((t) =>
        typeof MediaRecorder !== "undefined" &&
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported(t),
      );
      const mr = pick ? new MediaRecorder(stream, { mimeType: pick }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = mr.mimeType || pick || "audio/webm";
        const blob = new Blob(chunks, { type });
        if (blob.size < 1200) {
          toast.info("Gravação muito curta — segure para falar e solte para enviar.");
          return;
        }
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isPerm = /permission|denied|NotAllowed/i.test(msg);
      toast.error(
        isPerm
          ? "Permissão de microfone negada. Libere o microfone para o site (ou abra em nova aba)."
          : `Não foi possível acessar o microfone: ${msg}`,
      );
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
    <Card className="flex h-[calc(100vh-14rem)] overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/30 md:flex">
        <div className="p-3">
          <Button onClick={newThread} className="w-full gap-2" size="sm">
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {threads.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">Suas conversas aparecerão aqui.</p>
          )}
          {threads.map((t) => (
            <div
              key={t.id}
              className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted ${threadId === t.id ? "bg-muted" : ""}`}
            >
              <button
                type="button"
                onClick={() => selectThread(t.id)}
                className="flex flex-1 items-center gap-2 truncate text-left"
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{t.title}</span>
              </button>
              <button
                type="button"
                onClick={() => deleteThread(t.id)}
                className="opacity-0 transition group-hover:opacity-100"
                title="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
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
                        <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => openSave(b)}><Pencil className="h-3.5 w-3.5" />Editar</Button>
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
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>
            <div className="rounded-2xl border bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60" />
                <span className="ml-2 text-xs text-muted-foreground">digitando…</span>
              </div>
            </div>
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
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar prompt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <Input placeholder="Nome do prompt" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Conteúdo</label>
              <Textarea value={saveContent} onChange={(e) => setSaveContent(e.target.value)} rows={16} className="font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">{saveContent.length} caracteres</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { copyText(saveContent); }} className="gap-1"><Copy className="h-4 w-4" />Copiar</Button>
              <Button onClick={confirmSave} className="gap-1"><Save className="h-4 w-4" />Salvar na biblioteca</Button>
            </div>
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
