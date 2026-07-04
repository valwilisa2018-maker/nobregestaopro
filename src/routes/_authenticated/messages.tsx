import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Search, Send, Square, MessageCircle, Check, CheckCheck, Loader2, ArrowLeft, Smile, Play, Pause, Paperclip, ChevronLeft, ChevronRight, X, FileText, Image as ImageIcon, Video, Music, File as FileIcon, MoreVertical, Star, Archive, ArchiveRestore, Pin, PinOff, Tag } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useServerFn } from "@tanstack/react-start";
import { sendChatText, sendChatAudio, sendChatMedia, getProfilePicture } from "@/lib/evolution.functions";
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
  headerDark: "#4c1d95",   // violet-900
  headerTeal: "#7c3aed",   // violet-600
  accent: "#8b5cf6",       // violet-500
  chatBg: "#ECE5DD",       // WhatsApp original
  outBubble: "#DCF8C6",    // WhatsApp original
  inBubble: "#FFFFFF",
  read: "#34B7F1",         // WhatsApp original
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
  const [filterMode, setFilterMode] = useState<"all" | "unread" | "favorites" | "groups" | "archived">("all");
  const [archived, setArchived] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("wa-arch") ?? "[]")); } catch { return new Set(); }
  });
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("wa-fav") ?? "[]")); } catch { return new Set(); }
  });
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [pinned, setPinned] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("wa-pin") ?? "[]")); } catch { return new Set(); }
  });
  const [labels, setLabels] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("wa-labels") ?? "{}"); } catch { return {}; }
  });
  const sendText = useServerFn(sendChatText);
  const sendAudio = useServerFn(sendChatAudio);
  const sendMedia = useServerFn(sendChatMedia);
  const fetchAvatar = useServerFn(getProfilePicture);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  // Load contacts
  const loadContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("contacts")
      .select("id,phone,name").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(500);
    setContacts((data ?? []) as Contact[]);
  }, [user]);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Auto-select first contact so the composer is always visible
  useEffect(() => {
    if (!selected && contacts.length) setSelected(contacts[0]);
  }, [contacts, selected]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = contacts;
    if (filterMode === "archived") list = list.filter((c) => archived.has(c.id));
    else list = list.filter((c) => !archived.has(c.id));
    if (filterMode === "unread") list = list.filter((c) => (unreadMap[c.id] ?? 0) > 0);
    else if (filterMode === "favorites") list = list.filter((c) => favorites.has(c.id));
    else if (filterMode === "groups") list = list.filter((c) => c.phone.includes("@g.us"));
    if (q) list = list.filter((c) => (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q));
    return [...list].sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
  }, [contacts, search, filterMode, favorites, unreadMap, archived, pinned]);
  const unreadTotal = useMemo(
    () => Object.values(unreadMap).reduce((a, b) => a + b, 0),
    [unreadMap],
  );
  const groupsTotal = useMemo(() => contacts.filter((c) => c.phone.includes("@g.us")).length, [contacts]);

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
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [msgs, selected?.id]);

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

  async function handleSendAttachment() {
    if (!selected || !attachment || sending) return;
    setSending(true);
    const file = attachment.file;
    try {
      const b64 = await blobToBase64(file);
      const res = await sendMedia({ data: {
        contactId: selected.id, base64: b64, mime: file.type || "application/octet-stream",
        fileName: file.name, caption: text.trim() || undefined,
      }});
      if (res && "ok" in res && res.ok === false) toast.error(res.error);
      else { setText(""); setAttachment(null); }
      await loadMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar arquivo");
    } finally {
      setSending(false);
    }
  }

  // Fetch avatar for the selected contact
  useEffect(() => {
    if (!selected || avatars[selected.id] !== undefined) return;
    fetchAvatar({ data: { phone: selected.phone } })
      .then((r) => setAvatars((prev) => ({ ...prev, [selected.id]: r.url })))
      .catch(() => setAvatars((prev) => ({ ...prev, [selected.id]: null })));
  }, [selected, fetchAvatar, avatars]);

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
          const res = await sendAudio({ data: { contactId: selected.id, audioBase64: b64 } });
          if (res && "ok" in res && res.ok === false) toast.error(res.error);
          else await loadMessages();
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
    <div className="-m-6 h-[calc(100vh-3rem)]">
      <TooltipProvider delayDuration={200}>
      <div
        className={`grid grid-cols-1 gap-0 overflow-hidden h-full transition-all duration-300 ${
          sidebarCollapsed ? "md:grid-cols-[64px_1fr]" : "md:grid-cols-[360px_1fr]"
        }`}
      >
        {/* Contacts */}
        <aside
          className={`${selected ? "hidden md:flex" : "flex"} flex-col bg-white border-r border-black/10 transition-all duration-300 overflow-hidden`}
        >
          <div className="px-3 py-3 flex items-center gap-2" style={{ background: WA.headerDark, color: "white" }}>
            <div className="h-10 w-10 rounded-full grid place-items-center bg-white/20 font-semibold shrink-0">
              {(user?.email ?? "U").slice(0, 1).toUpperCase()}
            </div>
            {!sidebarCollapsed && <div className="text-sm font-semibold flex-1 truncate">Conversas</div>}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSidebarCollapsed((v) => !v)}
                  className="hidden md:grid h-8 w-8 place-items-center rounded-full text-white/90 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition"
                  aria-label={sidebarCollapsed ? "Expandir" : "Recolher"}
                >
                  {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{sidebarCollapsed ? "Expandir lista" : "Recolher lista"}</TooltipContent>
            </Tooltip>
          </div>
          {!sidebarCollapsed && <div className="p-2 bg-[#F6F6F6]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar ou começar uma nova conversa"
                className="pl-9 bg-white border-transparent rounded-full h-9 text-sm text-gray-800 placeholder:text-gray-500"
              />
            </div>
          </div>}
          {!sidebarCollapsed && (
            <div className="px-2 pb-2 pt-1 bg-[#F6F6F6] flex items-center gap-1 overflow-x-auto no-scrollbar">
              {([
                { key: "all", label: "Tudo", count: null as number | null },
                { key: "unread", label: "Não lidas", count: unreadTotal },
                { key: "favorites", label: "Favoritas", count: favorites.size },
                { key: "groups", label: "Grupos", count: groupsTotal },
                { key: "archived", label: "Arquivadas", count: archived.size },
              ] as const).map((t) => {
                const active = filterMode === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setFilterMode(t.key)}
                    className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition border ${
                      active
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span>{t.label}</span>
                    {t.count != null && t.count > 0 && (
                      <span className={`text-[9px] leading-none px-1 py-0.5 rounded-full ${active ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700"}`}>{t.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex-1 overflow-y-auto bg-white">
            {filtered.map((c) => {
              const active = selected?.id === c.id;
              const isFav = favorites.has(c.id);
              const isArch = archived.has(c.id);
              const isPin = pinned.has(c.id);
              const label = labels[c.id];
              return (
                <div
                  key={c.id}
                  className={`group w-full flex items-center gap-3 px-3 py-3 border-b border-black/5 hover:bg-gray-50 transition ${active ? "bg-gray-100" : ""} ${sidebarCollapsed ? "justify-center" : ""}`}
                  title={sidebarCollapsed ? (c.name || c.phone) : undefined}
                >
                  <button onClick={() => setSelected(c)} className="flex items-center gap-3 flex-1 min-w-0 text-left focus:outline-none">
                    {avatars[c.id] ? (
                      <img src={avatars[c.id]!} alt="" className="h-12 w-12 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-full grid place-items-center text-sm font-semibold text-white shrink-0" style={{ background: WA.headerTeal }}>
                        {initials(c.name, c.phone)}
                      </div>
                    )}
                    {!sidebarCollapsed && (
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-medium truncate text-gray-900">{c.name || c.phone}</div>
                          {isPin && <Pin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          {isFav && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />}
                          {isArch && <Archive className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                          {label && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: label }} />}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{c.phone}</div>
                      </div>
                    )}
                  </button>
                  {!sidebarCollapsed && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition" aria-label="Opções">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="right" align="start" className="w-48 p-1">
                        <button
                          onClick={() => setPinned((prev) => {
                            const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                            try { localStorage.setItem("wa-pin", JSON.stringify([...n])); } catch { /* ignore */ }
                            return n;
                          })}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent text-sm"
                        >
                          {isPin ? <PinOff className="h-4 w-4 text-emerald-600" /> : <Pin className="h-4 w-4 text-emerald-600" />}
                          <span>{isPin ? "Desafixar" : "Fixar"}</span>
                        </button>
                        <button
                          onClick={() => setFavorites((prev) => {
                            const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                            try { localStorage.setItem("wa-fav", JSON.stringify([...n])); } catch { /* ignore */ }
                            return n;
                          })}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent text-sm"
                        >
                          <Star className={`h-4 w-4 ${isFav ? "fill-amber-400 text-amber-400" : "text-amber-500"}`} />
                          <span>{isFav ? "Remover favorito" : "Favoritar"}</span>
                        </button>
                        <button
                          onClick={() => setArchived((prev) => {
                            const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                            try { localStorage.setItem("wa-arch", JSON.stringify([...n])); } catch { /* ignore */ }
                            return n;
                          })}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent text-sm"
                        >
                          {isArch ? <ArchiveRestore className="h-4 w-4 text-gray-600" /> : <Archive className="h-4 w-4 text-gray-600" />}
                          <span>{isArch ? "Desarquivar" : "Arquivar"}</span>
                        </button>
                        <div className="px-3 pt-2 pb-1 flex items-center gap-2 text-xs text-gray-500 border-t mt-1">
                          <Tag className="h-3.5 w-3.5" /> Etiqueta
                        </div>
                        <div className="px-2 pb-2 flex flex-wrap gap-1.5">
                          {["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899"].map((color) => (
                            <button
                              key={color}
                              onClick={() => setLabels((prev) => {
                                const n = { ...prev };
                                if (n[c.id] === color) delete n[c.id]; else n[c.id] = color;
                                try { localStorage.setItem("wa-labels", JSON.stringify(n)); } catch { /* ignore */ }
                                return n;
                              })}
                              className={`h-5 w-5 rounded-full border-2 transition ${label === color ? "border-gray-900 scale-110" : "border-white shadow"}`}
                              style={{ background: color }}
                              aria-label={`Etiqueta ${color}`}
                            />
                          ))}
                          {label && (
                            <button
                              onClick={() => setLabels((prev) => {
                                const n = { ...prev }; delete n[c.id];
                                try { localStorage.setItem("wa-labels", JSON.stringify(n)); } catch { /* ignore */ }
                                return n;
                              })}
                              className="h-5 w-5 rounded-full border grid place-items-center text-gray-500 hover:bg-gray-100"
                              aria-label="Remover etiqueta"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              );
            })}
            {!filtered.length && !sidebarCollapsed && <div className="p-6 text-center text-xs text-gray-500">Nenhum contato</div>}
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
                {avatars[selected.id] ? (
                  <img src={avatars[selected.id]!} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-full grid place-items-center text-xs font-semibold bg-white/20 shrink-0">
                    {initials(selected.name, selected.phone)}
                  </div>
                )}
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
                  const isImage = m.type === "image" && !!m.media_url;
                  const isFile = m.type === "file" && !!m.media_url;
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
                        ) : isImage ? (
                          <img src={m.media_url!} alt={m.content ?? ""} className="rounded-md max-h-64 object-cover" />
                        ) : isFile ? (
                          <a href={m.media_url!} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-gray-800">
                            <FileText className="h-5 w-5" /><span className="underline truncate max-w-[220px]">{m.content}</span>
                          </a>
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
                        <button className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-full transition" aria-label="Figurinhas">
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
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-full transition"
                          aria-label="Anexar"
                        >
                          <Paperclip className="h-6 w-6" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" className="w-52 p-1">
                        {[
                          { label: "Imagem", icon: ImageIcon, accept: "image/*", color: "text-violet-600" },
                          { label: "Vídeo", icon: Video, accept: "video/*", color: "text-rose-600" },
                          { label: "Áudio", icon: Music, accept: "audio/*", color: "text-orange-600" },
                          { label: "PDF", icon: FileText, accept: "application/pdf", color: "text-red-600" },
                          { label: "Arquivo", icon: FileIcon, accept: "*/*", color: "text-sky-600" },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            onClick={() => {
                              if (!fileInputRef.current) return;
                              fileInputRef.current.accept = opt.accept;
                              fileInputRef.current.click();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm"
                          >
                            <opt.icon className={`h-4 w-4 ${opt.color}`} />
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setAttachment({ file: f, url: URL.createObjectURL(f) });
                        e.target.value = "";
                      }}
                    />
                    <div className="flex-1 flex flex-col gap-1">
                       {attachment && (() => {
                         const t = attachment.file.type;
                         const isImg = t.startsWith("image/");
                         const isVid = t.startsWith("video/");
                         const isAud = t.startsWith("audio/");
                         const isPdf = t === "application/pdf" || attachment.file.name.toLowerCase().endsWith(".pdf");
                         return (
                         <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm text-sm">
                           {isImg ? (
                             <img src={attachment.url} alt="" className="h-12 w-12 object-cover rounded" />
                           ) : isVid ? (
                             <video src={attachment.url} className="h-12 w-12 object-cover rounded bg-black" muted />
                           ) : isAud ? (
                             <div className="h-12 w-12 rounded grid place-items-center bg-orange-100 text-orange-600"><Music className="h-6 w-6" /></div>
                           ) : isPdf ? (
                             <div className="h-12 w-12 rounded grid place-items-center bg-red-100 text-red-600"><FileText className="h-6 w-6" /></div>
                           ) : (
                             <div className="h-12 w-12 rounded grid place-items-center bg-sky-100 text-sky-600"><FileIcon className="h-6 w-6" /></div>
                           )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-gray-800">{attachment.file.name}</div>
                            <div className="text-[11px] text-gray-500">{Math.round(attachment.file.size / 1024)} KB</div>
                          </div>
                          <button
                            onClick={() => { URL.revokeObjectURL(attachment.url); setAttachment(null); }}
                            className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
                            aria-label="Remover anexo"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                         );
                       })()}
                      <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                      placeholder="Digite uma mensagem"
                      rows={1}
                      className="w-full resize-none rounded-full bg-white px-4 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500/40 max-h-32 shadow-sm placeholder:text-gray-500"
                      />
                    </div>
                  </>
                )}
                {recording ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" onClick={stopRecording} className="rounded-full h-11 w-11 text-white hover:opacity-90" style={{ background: "#DC2626" }}>
                        <Square className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Parar gravação</TooltipContent>
                  </Tooltip>
                ) : text.trim() || attachment ? (
                  <Button size="icon" onClick={() => { if (attachment) handleSendAttachment(); else if (text.trim()) handleSendText(); }} disabled={sending} className="rounded-full h-11 w-11 text-white hover:opacity-90" style={{ background: WA.accent }}>
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" onClick={startRecording} disabled={sending} className="rounded-full h-11 w-11 text-white hover:opacity-90" style={{ background: WA.headerTeal }}>
                        {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Gravar áudio</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      </TooltipProvider>
    </div>
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