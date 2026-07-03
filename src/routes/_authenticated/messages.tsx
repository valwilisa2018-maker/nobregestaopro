import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Search, Send, Square, MessageCircle, Check, CheckCheck, Loader2, ArrowLeft, Smile, Play, Pause, Paperclip, ChevronLeft, ChevronRight, X, FileText } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useServerFn } from "@tanstack/react-start";
import { sendChatText, sendChatAudio } from "@/lib/evolution.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages")({
  ssr: false,
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

const WA = {
  headerDark: "#075E54",
  headerTeal: "#128C7E",
  accent: "#25D366",
  chatBg: "#ECE5DD",
  outBubble: "#DCF8C6",
  inBubble: "#FFFFFF",
  read: "#34B7F1",
};

const STICKERS = ["😀","😂","😍","🥰","😎","🤩","🥳","😭","😡","🤔","👍","👏","🙏","🔥","💯","🎉","❤️","💔","😅","🤣","😴","🤗","🤝","👀","💪","🌹","🍀","⭐","☀️","🌙","🎂","🍕","☕","⚽","🎮","🎵","📸","💡","✅","❌"];

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [attachment, setAttachment] = useState<{ file: File; url: string } | null>(null);
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

  async function sendSticker(emoji: string) {
    if (!selected || sending) return;
    setSending(true);
    try {
      await sendText({ data: { contactId: selected.id, text: emoji } });
      await loadMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
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
      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-0 rounded-2xl border border-border/60 overflow-hidden shadow-xl h-[80vh]">
        {/* Contacts */}
        <aside
          className={`${selected ? "hidden md:flex" : "flex"} flex-col bg-white border-r border-black/10`}
        >
          <div className="px-4 py-3 flex items-center gap-3" style={{ background: WA.headerDark, color: "white" }}>
            <div className="h-10 w-10 rounded-full grid place-items-center bg-white/20 font-semibold">
              {(user?.email ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="text-sm font-semibold">Conversas</div>
          </div>
          <div className="p-2 bg-[#F6F6F6]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar ou começar uma nova conversa"
                className="pl-9 bg-white border-transparent rounded-full h-9 text-sm text-gray-800 placeholder:text-gray-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            {filtered.map((c) => {
              const active = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-left border-b border-black/5 hover:bg-gray-50 transition ${active ? "bg-gray-100" : ""}`}
                >
                  <div className="h-12 w-12 rounded-full grid place-items-center text-sm font-semibold text-white shrink-0" style={{ background: WA.headerTeal }}>
                    {initials(c.name, c.phone)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate text-gray-900">{c.name || c.phone}</div>
                    </div>
                    <div className="text-xs text-gray-500 truncate">{c.phone}</div>
                  </div>
                </button>
              );
            })}
            {!filtered.length && <div className="p-6 text-center text-xs text-gray-500">Nenhum contato</div>}
          </div>
        </aside>

        {/* Chat area */}
        <section className={`${selected ? "flex" : "hidden md:flex"} flex-col min-w-0`} style={{ background: WA.chatBg }}>
          {!selected ? (
            <div className="flex-1 grid place-items-center text-center px-6" style={{ background: "#F0F2F5" }}>
              <div>
                <div className="mx-auto h-40 w-40 rounded-full grid place-items-center mb-6" style={{ background: WA.headerTeal }}>
                  <MessageCircle className="h-20 w-20 text-white" />
                </div>
                <h2 className="text-2xl font-light text-gray-700">Agent IA — Mensagens</h2>
                <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">Selecione uma conversa para começar a enviar mensagens, áudios e figurinhas.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="px-4 py-2.5 flex items-center gap-3 text-white shadow-sm" style={{ background: WA.headerTeal }}>
                <button className="md:hidden p-1 -ml-1" onClick={() => setSelected(null)}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="h-10 w-10 rounded-full grid place-items-center text-xs font-semibold bg-white/20 shrink-0">
                  {initials(selected.name, selected.phone)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{selected.name || selected.phone}</div>
                  <div className="text-[11px] text-white/80 truncate">{selected.phone}</div>
                </div>
              </header>

              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5"
                style={{
                  backgroundColor: WA.chatBg,
                  backgroundImage:
                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><circle cx='30' cy='30' r='1' fill='%23000000' opacity='0.04'/></svg>\")",
                }}
              >
                {msgs.map((m) => {
                  const out = m.direction === "outbound";
                  const isAudio = m.type === "audio" || (m.metadata as { audio?: boolean } | null)?.audio;
                  return (
                    <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-lg px-2.5 py-1.5 shadow-sm text-sm text-gray-800`}
                        style={{ background: out ? WA.outBubble : WA.inBubble }}
                      >
                        {isAudio ? (
                          m.media_url
                            ? <AudioPlayer src={m.media_url} />
                            : <div className="flex items-center gap-2 text-gray-600"><Mic className="h-4 w-4" /><span>Mensagem de voz</span></div>
                        ) : (
                          <div className="whitespace-pre-wrap break-words pr-14">{m.content}</div>
                        )}
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-500">
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {out && <CheckCheck className="h-3.5 w-3.5" style={{ color: WA.read }} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!msgs.length && (
                  <div className="text-center text-xs text-gray-600 py-12">
                    <span className="inline-block bg-white/70 px-3 py-1 rounded-full shadow-sm">Nenhuma mensagem ainda — diga olá!</span>
                  </div>
                )}
              </div>

              <div className="px-3 py-2 flex items-end gap-2" style={{ background: "#F0F2F5" }}>
                {recording ? (
                  <div className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-full bg-white text-red-600 text-sm shadow-sm">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                    Gravando… {Math.floor(recTime / 60)}:{String(recTime % 60).padStart(2, "0")}
                  </div>
                ) : (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="p-2 text-gray-500 hover:text-gray-700 transition" aria-label="Figurinhas">
                          <Smile className="h-6 w-6" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" className="w-80 p-2">
                        <div className="text-xs text-muted-foreground px-1 pb-2">Figurinhas</div>
                        <div className="grid grid-cols-8 gap-1 max-h-64 overflow-y-auto">
                          {STICKERS.map((s) => (
                            <button
                              key={s}
                              onClick={() => sendSticker(s)}
                              className="text-2xl rounded hover:bg-accent transition p-1"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                      placeholder="Digite uma mensagem"
                      rows={1}
                      className="flex-1 resize-none rounded-full bg-white px-4 py-2.5 text-sm text-gray-800 outline-none max-h-32 shadow-sm placeholder:text-gray-500"
                    />
                  </>
                )}
                {recording ? (
                  <Button size="icon" onClick={stopRecording} className="rounded-full h-11 w-11 text-white hover:opacity-90" style={{ background: "#DC2626" }}>
                    <Square className="h-5 w-5" />
                  </Button>
                ) : text.trim() ? (
                  <Button size="icon" onClick={handleSendText} disabled={sending} className="rounded-full h-11 w-11 text-white hover:opacity-90" style={{ background: WA.accent }}>
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </Button>
                ) : (
                  <Button size="icon" onClick={startRecording} disabled={sending} className="rounded-full h-11 w-11 text-white hover:opacity-90" style={{ background: WA.headerTeal }}>
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
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

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onMeta = () => setDur(a.duration || 0);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  }

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[220px] py-1">
      <button onClick={toggle} className="h-9 w-9 grid place-items-center rounded-full text-white shrink-0" style={{ background: WA.headerTeal }}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="h-1 bg-gray-300 rounded-full overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${pct}%`, background: WA.headerTeal }} />
        </div>
        <div className="text-[10px] text-gray-500 mt-1">{fmtTime(playing || cur > 0 ? cur : dur)}</div>
      </div>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
    </div>
  );
}