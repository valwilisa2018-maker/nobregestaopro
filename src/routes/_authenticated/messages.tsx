import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Search, Send, Square, MessageCircle, Check, CheckCheck, Loader2 } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { sendChatText, sendChatAudio } from "@/lib/evolution.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Mensagens — Agent IA" }] }),
  component: MessagesPage,
});

type Contact = {
  id: string; phone: string; name: string | null;
};
type Msg = {
  id: string;
  direction: string;
  type: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function jidFromPhone(phone: string) {
  return `${String(phone).replace(/\D+/g, "")}@s.whatsapp.net`;
}

function initials(name: string | null, phone: string) {
  const src = (name && name.trim()) || phone;
  return src.replace(/\D/g, "").slice(-2) || src.slice(0, 2).toUpperCase();
}

function MessagesPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const recRef = useRef<{ mr: MediaRecorder; chunks: BlobPart[]; stream: MediaStream } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sendText = useServerFn(sendChatText);
  const sendAudio = useServerFn(sendChatAudio);

  // Load contacts
  const loadContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("contacts")
      .select("id,phone,name").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(500);
    setContacts((data ?? []) as Contact[]);
  }, [user]);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q));
  }, [contacts, search]);

  // Load messages for selected contact (match conversation by remoteJid)
  const loadMessages = useCallback(async () => {
    if (!user || !selected) { setMsgs([]); return; }
    const jid = jidFromPhone(selected.phone);
    const { data: convs } = await supabase.from("conversations")
      .select("id").eq("user_id", user.id).eq("metadata->>remoteJid", jid);
    const ids = (convs ?? []).map((c) => c.id);
    if (!ids.length) { setMsgs([]); return; }
    const { data } = await supabase.from("messages")
      .select("id,direction,type,content,media_url,created_at,metadata")
      .in("conversation_id", ids)
      .order("created_at", { ascending: true })
      .limit(500);
    setMsgs((data ?? []) as Msg[]);
  }, [user, selected]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Realtime refresh on new messages
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("messages-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` }, () => {
        loadMessages();
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function handleSendText() {
    if (!selected || !text.trim() || sending) return;
    const body = text.trim();
    setSending(true);
    setText("");
    try {
      await sendText({ data: { contactId: selected.id, text: body } });
      await loadMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
      setText(body);
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    if (!selected) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const b64 = await blobToBase64(blob);
        setSending(true);
        try {
          await sendAudio({ data: { contactId: selected.id, audioBase64: b64 } });
          await loadMessages();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao enviar áudio");
        } finally {
          setSending(false);
        }
      };
      mr.start();
      recRef.current = { mr, chunks, stream };
      setRecording(true);
      setRecTime(0);
    } catch (e) {
      toast.error("Não foi possível acessar o microfone");
    }
  }
  function stopRecording() {
    recRef.current?.mr.stop();
    setRecording(false);
  }
  useEffect(() => {
    if (!recording) return;
    const i = setInterval(() => setRecTime((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [recording]);

  return (
    <PageShell
      title="Mensagens"
      description="Converse com seus contatos direto pelo WhatsApp."
      icon={<MessageCircle className="h-6 w-6" />}
      status="ativo"
    >
      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-0 rounded-2xl border border-border/60 overflow-hidden bg-card/40 h-[75vh]">
        {/* Contacts */}
        <aside className="border-r border-border/60 flex flex-col bg-background/40">
          <div className="p-3 border-b border-border/60">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contato" className="pl-8" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {filtered.map((c) => {
              const active = selected?.id === c.id;
              return (
                <button key={c.id} onClick={() => setSelected(c)}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-accent/40 transition ${active ? "bg-accent/50" : ""}`}>
                  <div className="h-10 w-10 rounded-full grid place-items-center text-xs font-semibold bg-primary/20 text-primary">
                    {initials(c.name, c.phone)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name || c.phone}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{c.phone}</div>
                  </div>
                </button>
              );
            })}
            {!filtered.length && <div className="p-6 text-center text-xs text-muted-foreground">Nenhum contato</div>}
          </div>
        </aside>

        {/* Chat area */}
        <section className="flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              Selecione um contato para começar a conversar
            </div>
          ) : (
            <>
              <header className="border-b border-border/60 px-4 py-3 flex items-center gap-3 bg-background/60">
                <div className="h-9 w-9 rounded-full grid place-items-center text-xs font-semibold bg-primary/20 text-primary">
                  {initials(selected.name, selected.phone)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{selected.name || selected.phone}</div>
                  <div className="text-[11px] text-muted-foreground">{selected.phone}</div>
                </div>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2"
                style={{ backgroundImage: "radial-gradient(circle at 20% 10%, hsl(var(--primary)/0.05), transparent 40%), radial-gradient(circle at 80% 90%, hsl(var(--primary)/0.05), transparent 40%)" }}>
                {msgs.map((m) => {
                  const out = m.direction === "outbound";
                  return (
                    <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${out ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border/60 rounded-bl-sm"}`}>
                        {m.type === "audio" || (m.metadata as { audio?: boolean } | null)?.audio ? (
                          m.media_url
                            ? <audio controls src={m.media_url} className="max-w-[240px]" />
                            : <div className="flex items-center gap-2 opacity-90"><Mic className="h-4 w-4" /><span>Mensagem de voz</span></div>
                        ) : (
                          <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        )}
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {out && <CheckCheck className="h-3 w-3" />}
                          {!out && <Check className="h-3 w-3" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!msgs.length && <div className="text-center text-xs text-muted-foreground py-12">Sem mensagens ainda</div>}
              </div>

              <div className="border-t border-border/60 p-3 bg-background/60 flex items-end gap-2">
                {recording ? (
                  <div className="flex-1 flex items-center gap-3 px-3 py-2 rounded-full bg-destructive/10 text-destructive text-sm">
                    <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                    Gravando… {Math.floor(recTime / 60)}:{String(recTime % 60).padStart(2, "0")}
                  </div>
                ) : (
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                    placeholder="Digite uma mensagem"
                    rows={1}
                    className="flex-1 resize-none rounded-2xl border border-border/60 bg-background px-4 py-2 text-sm outline-none focus:border-primary max-h-32"
                  />
                )}
                {recording ? (
                  <Button size="icon" variant="destructive" onClick={stopRecording} className="rounded-full h-10 w-10">
                    <Square className="h-4 w-4" />
                  </Button>
                ) : text.trim() ? (
                  <Button size="icon" onClick={handleSendText} disabled={sending} className="rounded-full h-10 w-10">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                ) : (
                  <Button size="icon" onClick={startRecording} disabled={sending} className="rounded-full h-10 w-10">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = String(r.result || "");
      resolve(s.replace(/^data:[^;]+;base64,/, ""));
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}