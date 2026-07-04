import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Search, Send, Square, MessageCircle, Check, CheckCheck, Loader2, ArrowLeft, Smile, Play, Pause, Paperclip, ChevronLeft, ChevronRight, X, FileText, Image as ImageIcon, Video, Music, File as FileIcon, MoreVertical, Star, Archive, ArchiveRestore, Pin, PinOff, Tag, Info, Save, Bell, BellOff, Trash2, Forward, ChevronDown, Reply, CornerUpLeft, Download, Bot, BotOff, Camera, Pencil } from "lucide-react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { sendChatText, sendChatAudio, sendChatMedia, getProfilePicture, sendPresence, ensurePresenceWebhook, deleteChatMessage, forwardChatMessage, editChatMessage } from "@/lib/evolution.functions";
import { toast } from "sonner";
import notificationSound from "@/assets/notification.mp3.asset.json";

export const Route = createFileRoute("/_authenticated/messages")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mensagens — Agent IA" }] }),
  component: MessagesPage,
});

type Contact = {
  id: string; phone: string; name: string | null;
  metadata?: Record<string, unknown> | null;
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
const MESSAGE_PAGE_SIZE = 80;

function jidFromPhone(phone: string) {
  return `${String(phone).replace(/\D+/g, "")}@s.whatsapp.net`;
}

function phoneVariants(value: string) {
  const digits = value.replace(/\D+/g, "");
  const variants = new Set([digits]);
  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
  }
  if (digits.startsWith("55") && digits.length === 12) {
    variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }
  return [...variants].filter(Boolean);
}

function jidVariants(phone: string) {
  return phoneVariants(phone).map((digits) => `${digits}@s.whatsapp.net`);
}

function storagePathFrom(m: Msg) {
  const path = (m.metadata as { storagePath?: unknown } | null)?.storagePath;
  return typeof path === "string" && path ? path : null;
}

function initials(name: string | null, phone: string) {
  const src = (name && name.trim()) || phone;
  return src.replace(/\D/g, "").slice(-2) || src.slice(0, 2).toUpperCase();
}

async function downloadFile(url: string, filename: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("fail");
    const blob = await r.blob();
    const bu = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = bu; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(bu), 1000);
  } catch {
    window.open(url, "_blank");
  }
}

function DownloadBtn({ url, filename, dark = false }: { url: string; filename: string; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); downloadFile(url, filename); }}
      title="Baixar"
      className={`absolute top-1 right-1 z-10 grid place-items-center h-6 w-6 rounded-full backdrop-blur transition ${dark ? "bg-black/50 hover:bg-black/70 text-white" : "bg-white/85 hover:bg-white text-gray-700"}`}
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  );
}

function MessagesPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const recRef = useRef<{ mr: MediaRecorder; chunks: BlobPart[]; stream: MediaStream; cancelled?: boolean; audioCtx?: AudioContext; raf?: number } | null>(null);
  const [recLevels, setRecLevels] = useState<number[]>(() => Array(24).fill(0.15));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
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
  const pushPresence = useServerFn(sendPresence);
  const ensureWebhook = useServerFn(ensurePresenceWebhook);
  const deleteMsgFn = useServerFn(deleteChatMessage);
  const forwardMsgFn = useServerFn(forwardChatMessage);
  const editMsgFn = useServerFn(editChatMessage);
  const [editMsg, setEditMsg] = useState<Msg | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Msg | null>(null);
  const replyToRef = useRef<Msg | null>(null);
  useEffect(() => { replyToRef.current = replyTo; }, [replyTo]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [remotePresence, setRemotePresence] = useState<string | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentPresenceRef = useRef<number>(0);
  const [lightbox, setLightbox] = useState<{ type: "image" | "video"; src: string } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [convoId, setConvoId] = useState<string | null>(null);
  const [agentPaused, setAgentPaused] = useState<boolean>(false);
  const selectedRef = useRef<Contact | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const messageLoadSeqRef = useRef(0);
  const conversationIdsRef = useRef<string[]>([]);
  const messagesCacheRef = useRef<Map<string, Msg[]>>(new Map());
  const conversationIdsCacheRef = useRef<Map<string, string[]>>(new Map());
  // Hydrate persistent caches so messages appear instantly on reload / repeat opens
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("wa-msg-cache");
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, Msg[]>;
        for (const [k, v] of Object.entries(obj)) messagesCacheRef.current.set(k, v);
      }
      const rawIds = localStorage.getItem("wa-conv-cache");
      if (rawIds) {
        const obj = JSON.parse(rawIds) as Record<string, string[]>;
        for (const [k, v] of Object.entries(obj)) conversationIdsCacheRef.current.set(k, v);
      }
    } catch { /* ignore */ }
  }, []);
  const persistMsgCache = useCallback((contactId: string, rows: Msg[]) => {
    messagesCacheRef.current.set(contactId, rows);
    if (typeof window === "undefined") return;
    try {
      const obj: Record<string, Msg[]> = {};
      // Cap: only persist last 40 msgs per contact and last 30 contacts to keep storage small
      const entries = [...messagesCacheRef.current.entries()].slice(-30);
      for (const [k, v] of entries) obj[k] = v.slice(-40);
      localStorage.setItem("wa-msg-cache", JSON.stringify(obj));
    } catch { /* quota */ }
  }, []);
  const persistConvCache = useCallback((contactId: string, ids: string[]) => {
    conversationIdsCacheRef.current.set(contactId, ids);
    if (typeof window === "undefined") return;
    try {
      const obj: Record<string, string[]> = {};
      for (const [k, v] of conversationIdsCacheRef.current.entries()) obj[k] = v;
      localStorage.setItem("wa-conv-cache", JSON.stringify(obj));
    } catch { /* quota */ }
  }, []);
  const signedUrlCacheRef = useRef<Map<string, string>>(new Map());
  const prependScrollRef = useRef(false);
  const [editPhone, setEditPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("wa-sound") !== "0";
  });
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  // Auto-retry registry for failed text/sticker sends
  const retryRegistry = useRef<Map<string, { contactId: string; body: string }>>(new Map());
  const pendingReceiptRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  const attemptSendText = useCallback((tmpId: string, contactId: string, body: string, attempt = 0, quotedMessageId?: string) => {
    const MAX = 3;
    sendText({ data: { contactId, text: body, quotedMessageId } })
      .then((res) => {
        if (res && "ok" in res && res.ok === false) throw new Error(res.error || "send failed");
        retryRegistry.current.delete(tmpId);
        // Do not reload here — the Realtime INSERT reconciles the tmp row with the real one.
        // Reloading caused duplicates/flicker when INSERT arrived before/after the refetch.
      })
      .catch((e) => {
        if (attempt < MAX) {
          const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
          setTimeout(() => attemptSendText(tmpId, contactId, body, attempt + 1, quotedMessageId), delay);
        } else {
          retryRegistry.current.set(tmpId, { contactId, body });
          setMsgs((prev) => prev.map((m) => m.id === tmpId ? { ...m, metadata: { ...(m.metadata ?? {}), pending: false, failed: true } } : m));
          toast.error(e instanceof Error ? e.message : "Falha ao enviar — toque em ! para tentar novamente");
        }
      });
  }, [sendText]);

  const retryFailed = useCallback((tmpId: string) => {
    const payload = retryRegistry.current.get(tmpId);
    if (!payload) { loadMessages(); return; }
    setMsgs((prev) => prev.map((m) => m.id === tmpId ? { ...m, metadata: { ...(m.metadata ?? {}), failed: false, pending: true } } : m));
    attemptSendText(tmpId, payload.contactId, payload.body, 0);
  }, [attemptSendText]);

  // Starred messages (local only)
  const [starred, setStarred] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("wa-starred") ?? "[]")); } catch { return new Set(); }
  });
  const toggleStar = useCallback((id: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (typeof window !== "undefined") localStorage.setItem("wa-starred", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const performDelete = useCallback(async (m: Msg, forEveryone: boolean) => {
    setDeleteConfirm(null);
    setMsgs((prev) => prev.filter((x) => x.id !== m.id));
    if (m.id.startsWith("tmp-")) return;
    try {
      await deleteMsgFn({ data: { messageId: m.id, forEveryone } });
      toast.success(forEveryone ? "Excluída para todos" : "Excluída para mim");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
      loadMessages();
    }
  }, [deleteMsgFn]);

  // Forward dialog
  const [forwardMsg, setForwardMsg] = useState<Msg | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const doForward = useCallback(async (target: Contact) => {
    if (!forwardMsg) return;
    const src = forwardMsg;
    setForwardMsg(null);
    setForwardSearch("");
    try {
      const res = await forwardMsgFn({ data: { messageId: src.id, targetContactId: target.id } });
      if (res && "ok" in res && res.ok === false) throw new Error((res as { error?: string }).error || "Falha ao encaminhar");
      toast.success(`Encaminhada para ${target.name || target.phone}`);
      if (target.id === selected?.id) await loadMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao encaminhar");
    }
  }, [forwardMsg, selected, forwardMsgFn]);

  // Ensure webhook includes PRESENCE_UPDATE (best-effort, one shot)
  useEffect(() => {
    if (!user) return;
    (ensureWebhook as unknown as () => Promise<unknown>)().catch(() => {});
  }, [user, ensureWebhook]);

  // Subscribe to remote presence for the selected contact
  useEffect(() => {
    setRemotePresence(null);
    if (!user || !selected) return;
    const jids = new Set(jidVariants(selected.phone));
    const lidJids = (selected.metadata as { lidJids?: unknown } | null)?.lidJids;
    if (Array.isArray(lidJids)) lidJids.forEach((jid) => { if (typeof jid === "string") jids.add(jid); });
    const ch = supabase.channel(`presence-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "presence", filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = (payload.new ?? payload.old) as { jid?: string; presence?: string; updated_at?: string } | null;
        if (!row?.jid) return;
        const exact = jids.has(row.jid);
        const recentOneToOneLid = !exact && row.jid.endsWith("@lid") && row.updated_at && Date.now() - new Date(row.updated_at).getTime() < 8000;
        if (!exact && !recentOneToOneLid) return;
        const p = row.presence ?? "available";
        if (p === "composing" || p === "recording") {
          setRemotePresence(p);
          // auto-clear after 6s if no new update arrives
          setTimeout(() => setRemotePresence((cur) => (cur === p ? null : cur)), 6000);
        } else {
          setRemotePresence(null);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, selected]);

  // Send "composing" while typing (throttled), "paused" when idle
  useEffect(() => {
    if (!selected) return;
    if (!text.trim()) return;
    const now = Date.now();
    if (now - lastSentPresenceRef.current > 4000) {
      lastSentPresenceRef.current = now;
      pushPresence({ data: { contactId: selected.id, presence: "composing" } }).catch(() => {});
    }
    if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current);
    presenceTimerRef.current = setTimeout(() => {
      if (selected) pushPresence({ data: { contactId: selected.id, presence: "paused" } }).catch(() => {});
    }, 3500);
    return () => { if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current); };
  }, [text, selected, pushPresence]);
  useEffect(() => {
    try { localStorage.setItem("wa-sound", soundOn ? "1" : "0"); } catch { /* ignore */ }
  }, [soundOn]);

  function playBell() {
    if (!soundOnRef.current || typeof window === "undefined") return;
    try {
      const a = new Audio(notificationSound.url);
      a.volume = 0.9;
      void a.play().catch(() => {});
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name ?? "");
    setEditPhone(selected.phone ?? "");
  }, [selected]);

  async function saveContact() {
    if (!selected || savingContact) return;
    const name = editName.trim();
    const phone = editPhone.trim().replace(/\D/g, "");
    if (name.length > 100) { toast.error("Nome deve ter no máximo 100 caracteres"); return; }
    if (!/^\d{10,15}$/.test(phone)) { toast.error("Telefone inválido (use apenas dígitos, 10 a 15)"); return; }
    setSavingContact(true);
    try {
      if (!user) throw new Error("Sessão expirada");
      // Find duplicates by phone variants (e.g. BR 12↔13 dígitos) and merge them
      const variants = phoneVariants(phone);
      const { data: dupes } = await supabase.from("contacts")
        .select("id").eq("user_id", user.id).in("phone", variants).neq("id", selected.id);
      if (dupes && dupes.length) {
        await supabase.from("contacts").delete().in("id", dupes.map((d) => d.id));
      }
      const { error } = await supabase.from("contacts")
        .update({ name: name || null, phone })
        .eq("id", selected.id);
      if (error) throw error;
      const updated = { ...selected, name: name || null, phone };
      setSelected(updated);
      setContacts((prev) => prev
        .filter((c) => !(dupes ?? []).some((d) => d.id === c.id))
        .map((c) => (c.id === updated.id ? updated : c)));
      toast.success("Contato atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSavingContact(false);
    }
  }

  // Load contacts
  const loadContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("contacts")
      .select("id,phone,name,metadata").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(500);
    setContacts((data ?? []) as Contact[]);
  }, [user]);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Auto-select first contact so the composer is always visible
  useEffect(() => {
    if (!selected && contacts.length) setSelected(contacts[0]);
    else if (selected) {
      const fresh = contacts.find((c) => c.id === selected.id);
      if (fresh && (fresh.name !== selected.name || fresh.phone !== selected.phone)) {
        setSelected(fresh);
      }
    }
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

  // Defensive dedup: even if a message slips in through both the optimistic path
  // and Realtime (or a refetch), render it only once. Dedup by id first, then by
  // (direction + type + content) within a 2-minute window to collapse tmp/real pairs.
  const dedupedMsgs = useMemo(() => {
    const seenIds = new Set<string>();
    const bySig = new Map<string, number>(); // signature -> index in output
    const out: typeof msgs = [];
    for (const m of msgs) {
      if (seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      const ts = new Date(m.created_at).getTime() || 0;
      const sig = `${m.direction}|${m.type || "text"}|${m.content ?? ""}`;
      const prevIdx = bySig.get(sig);
      if (prevIdx !== undefined) {
        const prev = out[prevIdx];
        const prevTs = new Date(prev.created_at).getTime() || 0;
        if (Math.abs(ts - prevTs) < 120_000) {
          // Prefer the non-tmp (server) row
          if (prev.id.startsWith("tmp-") && !m.id.startsWith("tmp-")) {
            out[prevIdx] = m;
            bySig.set(sig, prevIdx);
          }
          continue;
        }
      }
      bySig.set(sig, out.length);
      out.push(m);
    }
    return out;
  }, [msgs]);

  const hydrateSignedUrls = useCallback((rows: Msg[], reqId: string) => {
    const rowsWithStorage = rows.filter((m) => storagePathFrom(m));
    if (!rowsWithStorage.length) return;
    (async () => {
      const patches = await Promise.all(rowsWithStorage.map(async (m) => {
        const path = storagePathFrom(m);
        if (!path) return null;
        const cached = signedUrlCacheRef.current.get(path);
        if (cached) return { id: m.id, url: cached };
        const { data: signed } = await supabase.storage.from("agent-media").createSignedUrl(path, 60 * 60 * 24);
        if (!signed?.signedUrl) return null;
        signedUrlCacheRef.current.set(path, signed.signedUrl);
        return { id: m.id, url: signed.signedUrl };
      }));
      if (selectedRef.current?.id !== reqId) return;
      const map = new Map(patches.filter(Boolean).map((p) => [p!.id, p!.url]));
      if (!map.size) return;
      setMsgs((cur) => {
        const next = cur.map((m) => (map.has(m.id) ? { ...m, media_url: map.get(m.id)! } : m));
        messagesCacheRef.current.set(reqId, next);
        return next;
      });
    })();
  }, []);

  async function findConversationRows(contact: Contact) {
    const phone = contact.phone.replace(/\D+/g, "");
    const targets = new Set([jidFromPhone(contact.phone), ...jidVariants(contact.phone)]);
    const lidJids = (contact.metadata as { lidJids?: unknown } | null)?.lidJids;
    if (Array.isArray(lidJids)) lidJids.forEach((jid) => { if (typeof jid === "string") targets.add(jid); });

    const exactTargets = [...targets].filter(Boolean);
    const { data: exact } = exactTargets.length
      ? await supabase.from("conversations")
        .select("id,metadata")
        .eq("user_id", user!.id)
        .in("metadata->>remoteJid", exactTargets)
        .limit(20)
      : { data: [] };

    if (exact?.length) return exact;

    const fallback = await Promise.all(phoneVariants(phone).map((digits) =>
      supabase.from("conversations")
        .select("id,metadata")
        .eq("user_id", user!.id)
        .ilike("metadata->>remoteJid", `${digits}@%`)
        .limit(5),
    ));
    const seen = new Set<string>();
    return fallback.flatMap((r) => r.data ?? []).filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }

  // Load messages for selected contact (match conversation by remoteJid)
  const loadMessages = useCallback(async () => {
    if (!user || !selected) { setMsgs([]); setMessagesLoading(false); return; }
    const reqId = selected.id;
    const seq = ++messageLoadSeqRef.current;
    const cached = messagesCacheRef.current.get(reqId);
    const cachedIds = conversationIdsCacheRef.current.get(reqId);
    setMessagesLoading(!cached?.length);
    setHasOlder(false);
    conversationIdsRef.current = cachedIds ?? [];
    if (cached) setMsgs(cached);

    // Fast path: if we have cached conversation IDs, fetch messages immediately in parallel
    // with re-resolving conversation rows. This eliminates the round-trip delay on repeat opens.
    const fetchMessagesFor = async (ids: string[]) => {
      if (!ids.length) return [] as Msg[];
      const { data } = await supabase.from("messages")
        .select("id,direction,type,content,media_url,created_at,metadata")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1);
      return (data ?? []) as Msg[];
    };

    const fastMsgsPromise = cachedIds?.length ? fetchMessagesFor(cachedIds) : Promise.resolve<Msg[] | null>(null);

    const [convs, fastData] = await Promise.all([
      findConversationRows(selected),
      fastMsgsPromise,
    ]);

    // Apply fast path result first (if any) so UI updates ASAP
    if (fastData && selectedRef.current?.id === reqId && messageLoadSeqRef.current === seq) {
      const rows = fastData.slice(0, MESSAGE_PAGE_SIZE).reverse();
      setHasOlder(fastData.length > MESSAGE_PAGE_SIZE);
      setMsgs(rows);
      persistMsgCache(reqId, rows);
      setMessagesLoading(false);
      hydrateSignedUrls(rows, reqId);
    }

    if (selectedRef.current?.id !== reqId) return;
    const matched = convs ?? [];
    const ids = matched.map((c) => c.id);
    conversationIdsRef.current = ids;
    persistConvCache(reqId, ids);
    const primary = matched[0] ?? null;
    setConvoId(primary?.id ?? null);
    const pausedUntil = (primary?.metadata as { agent_paused_until?: string } | null)?.agent_paused_until ?? null;
    setAgentPaused(!!pausedUntil && new Date(pausedUntil).getTime() > Date.now());
    if (!ids.length) {
      // Don't wipe cached messages if lookup temporarily fails; only clear if we truly have nothing
      if (!cached?.length && !fastData?.length) setMsgs([]);
      setMessagesLoading(false);
      return;
    }
    const data = await fetchMessagesFor(ids);
    if (selectedRef.current?.id !== reqId || messageLoadSeqRef.current !== seq) return;
    const rows = data.slice(0, MESSAGE_PAGE_SIZE).reverse();
    setHasOlder(data.length > MESSAGE_PAGE_SIZE);
    setMsgs(rows);
    persistMsgCache(reqId, rows);
    setMessagesLoading(false);
    hydrateSignedUrls(rows, reqId);
  }, [user, selected, hydrateSignedUrls]);
  useEffect(() => {
    const cached = selected ? messagesCacheRef.current.get(selected.id) : undefined;
    setMsgs(cached ?? []);
    setHasOlder(false);
    setMessagesLoading(!!selected && !cached?.length);
    loadMessages();
  }, [loadMessages]);

  const loadOlderMessages = useCallback(async () => {
    if (!user || !selected || olderLoading || messagesLoading || !hasOlder) return;
    const ids = conversationIdsRef.current;
    const oldest = msgs[0]?.created_at;
    if (!ids.length || !oldest) return;
    const reqId = selected.id;
    const el = scrollRef.current;
    const beforeHeight = el?.scrollHeight ?? 0;
    const beforeTop = el?.scrollTop ?? 0;
    setOlderLoading(true);
    try {
      const { data } = await supabase.from("messages")
        .select("id,direction,type,content,media_url,created_at,metadata")
        .in("conversation_id", ids)
        .lt("created_at", oldest)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1);
      if (selectedRef.current?.id !== reqId) return;
      const older = ((data ?? []) as Msg[]).slice(0, MESSAGE_PAGE_SIZE).reverse();
      setHasOlder((data ?? []).length > MESSAGE_PAGE_SIZE);
      if (!older.length) return;
      prependScrollRef.current = true;
      setMsgs((prev) => {
        const currentIds = new Set(prev.map((m) => m.id));
        const next = [...older.filter((m) => !currentIds.has(m.id)), ...prev];
        messagesCacheRef.current.set(reqId, next);
        return next;
      });
      hydrateSignedUrls(older, reqId);
      requestAnimationFrame(() => {
        const current = scrollRef.current;
        if (!current) return;
        current.scrollTop = current.scrollHeight - beforeHeight + beforeTop;
      });
    } finally {
      if (selectedRef.current?.id === reqId) setOlderLoading(false);
    }
  }, [user, selected, olderLoading, messagesLoading, hasOlder, msgs, hydrateSignedUrls]);

  const toggleAgent = useCallback(async () => {
    if (!convoId) { toast.error("Sem conversa vinculada ainda."); return; }
    const { data: row } = await supabase.from("conversations").select("metadata").eq("id", convoId).maybeSingle();
    const meta = (row?.metadata ?? {}) as Record<string, unknown>;
    const next = agentPaused
      ? { ...meta, agent_paused_until: null }
      : { ...meta, agent_paused_until: new Date(Date.now() + 3650 * 24 * 3600_000).toISOString() };
    const { error } = await supabase.from("conversations").update({ metadata: next } as never).eq("id", convoId);
    if (error) { toast.error("Não foi possível alterar a IA."); return; }
    setAgentPaused(!agentPaused);
    toast.success(agentPaused ? "IA ativada nesta conversa" : "IA desativada nesta conversa");
  }, [convoId, agentPaused]);

  // Realtime refresh on new messages
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("messages-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` }, async (payload) => {
        const row = payload.new as (Msg & { conversation_id?: string }) | null;
        if (!row) return;
        if (row.direction === "inbound") playBell();
        // Try to append immediately if the message belongs to the currently open thread.
        if (selected) {
          const phone = selected.phone.replace(/\D+/g, "");
          const jids = new Set([jidFromPhone(selected.phone), ...jidVariants(selected.phone)]);
          const remote = (row.metadata as { remoteJid?: string } | null)?.remoteJid ?? "";
          const belongs = jids.has(remote) || (!!phone && remote.startsWith(`${phone}@`));
          if (belongs) {
            let hydrated: Msg = row as Msg;
            const path = storagePathFrom(row as Msg);
            if (path) {
              const { data: signed } = await supabase.storage.from("agent-media").createSignedUrl(path, 60 * 60 * 24);
              if (signed?.signedUrl) hydrated = { ...(row as Msg), media_url: signed.signedUrl };
            }
            setMsgs((prev) => {
              const evoId = (hydrated.metadata as { evoId?: unknown } | null)?.evoId;
              const delayedReceipt = pendingReceiptRef.current.get(hydrated.id)
                ?? (typeof evoId === "string" ? pendingReceiptRef.current.get(evoId) : undefined);
              const withReceipt = delayedReceipt
                ? { ...hydrated, metadata: { ...(hydrated.metadata ?? {}), ...delayedReceipt } }
                : hydrated;
              pendingReceiptRef.current.delete(hydrated.id);
              if (typeof evoId === "string") pendingReceiptRef.current.delete(evoId);
              // Already have the real row → no-op
              if (prev.some((m) => m.id === withReceipt.id)) return prev;
              // Reconcile against optimistic (tmp-*) rows: same direction + same content/type
              // added within the last 2 minutes → replace the tmp instead of appending a duplicate.
              const nowTs = Date.now();
              const tmpIdx = prev.findIndex((m) => {
                if (!m.id.startsWith("tmp-")) return false;
                if (m.direction !== withReceipt.direction) return false;
                if ((m.type || "text") !== (withReceipt.type || "text")) return false;
                const sameText = (m.content ?? "") === (withReceipt.content ?? "");
                const created = new Date(m.created_at).getTime();
                const recent = Number.isFinite(created) && nowTs - created < 120_000;
                return sameText && recent;
              });
              if (tmpIdx !== -1) {
                const copy = prev.slice();
                copy[tmpIdx] = withReceipt;
                persistMsgCache(selectedRef.current?.id ?? selected.id, copy);
                return copy;
              }
              const next = [...prev, withReceipt];
              persistMsgCache(selectedRef.current?.id ?? selected.id, next);
              return next;
            });
            return;
          }
        }
        // Not for the open thread — do NOT reload the current view (avoids flicker/disappearing).
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` }, (payload) => {
        // Patch the single row in place so tick status updates without reloading the whole thread
        const row = payload.new as { id?: string; metadata?: Record<string, unknown> | null } | null;
        if (!row?.id) return;
        const rank = (v: unknown) => v === "read" ? 3 : v === "delivered" ? 2 : v === "sent" ? 1 : 0;
        setMsgs((prev) => {
          const rowEvoId = typeof row.metadata?.evoId === "string" ? row.metadata.evoId : null;
          const idx = prev.findIndex((m) => {
            if (m.id === row.id) return true;
            const meta = (m.metadata ?? {}) as { evoId?: unknown };
            return !!rowEvoId && meta.evoId === rowEvoId;
          });
          if (idx === -1) {
            const receipt = row.metadata ?? {};
            if (row.id) pendingReceiptRef.current.set(row.id, receipt);
            if (rowEvoId) pendingReceiptRef.current.set(rowEvoId, receipt);
            return prev;
          }
          const prevMeta = (prev[idx].metadata ?? {}) as Record<string, unknown>;
          const nextMeta = { ...prevMeta, ...(row.metadata ?? {}) };
          // Never downgrade the status
          if (rank(nextMeta.status) < rank(prevMeta.status)) nextMeta.status = prevMeta.status;
          const copy = prev.slice();
          copy[idx] = { ...prev[idx], metadata: nextMeta };
          // Persist so the tick doesn't regress to a stale cached value on contact switch/reload
          const contactId = selectedRef.current?.id;
          if (contactId) persistMsgCache(contactId, copy);
          return copy;
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` }, (payload) => {
        const old = payload.old as { id?: string } | null;
        const deletedId = old?.id;
        if (!deletedId) return;
        setMsgs((prev) => {
          if (!prev.some((m) => m.id === deletedId || (m.metadata as { quotedId?: string } | null)?.quotedId === deletedId)) return prev;
          return prev
            .filter((m) => m.id !== deletedId)
            .map((m) => {
              const meta = (m.metadata ?? {}) as Record<string, unknown> & { quotedId?: string };
              if (meta.quotedId !== deletedId) return m;
              const { quotedId: _q, quotedText: _t, quotedType: _ty, quotedDirection: _d, ...rest } = meta;
              return { ...m, metadata: { ...rest, quotedDeleted: true } };
            });
        });
        if (replyToRef.current?.id === deletedId) setReplyTo(null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts", filter: `user_id=eq.${user.id}` }, () => {
        loadContacts();
      })
      // Conversations UPDATE (unread counters etc.) must NOT reload the open thread — it caused messages to blink/disappear.
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadMessages, loadContacts]);

  // Scroll to bottom only when the thread changes or a new message is appended,
  // not on every metadata patch (status ticks). Prevents jitter/disappearing effect.
  const msgsCountRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependScrollRef.current) {
      prependScrollRef.current = false;
      msgsCountRef.current = msgs.length;
      return;
    }
    const prev = msgsCountRef.current;
    msgsCountRef.current = msgs.length;
    if (msgs.length === prev) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: prev === 0 ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [msgs, selected?.id]);

  async function handleSendText() {
    if (!selected || !text.trim()) return;
    const body = text.trim();
    const tmpId = `tmp-${Date.now()}`;
    const quotedMessageId = replyTo?.id;
    const optimistic: Msg = {
      id: tmpId,
      direction: "outbound",
      type: "text",
      content: body,
      media_url: null,
      created_at: new Date().toISOString(),
      metadata: quotedMessageId ? { pending: true, quotedId: quotedMessageId, quotedText: (replyTo?.content ?? "").slice(0, 200), quotedType: replyTo?.type, quotedDirection: replyTo?.direction } : { pending: true },
    };
    setText("");
    setReplyTo(null);
    setMsgs((prev) => [...prev, optimistic]);
    const contactId = selected.id;
    attemptSendText(tmpId, contactId, body, 0, quotedMessageId);
  }

  async function sendSticker(emoji: string) {
    if (!selected) return;
    const tmpId = `tmp-${Date.now()}`;
    const optimistic: Msg = {
      id: tmpId,
      direction: "outbound",
      type: "text",
      content: emoji,
      media_url: null,
      created_at: new Date().toISOString(),
      metadata: { pending: true },
    };
    setMsgs((prev) => [...prev, optimistic]);
    const contactId = selected.id;
    attemptSendText(tmpId, contactId, emoji, 0);
  }

  async function handleSendAttachment() {
    if (!selected || !attachment || sending) return;
    const MAX = 15 * 1024 * 1024; // 15 MB
    if (attachment.file.size > MAX) {
      toast.error(`Arquivo muito grande (máx. 15 MB). Este tem ${(attachment.file.size / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }
    setSending(true);
    const file = attachment.file;
    const mime = file.type || "application/octet-stream";
    const optimisticType = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
    const quotedMessageId = replyTo?.id;
    const optimistic: Msg = {
      id: `tmp-${Date.now()}`,
      direction: "outbound",
      type: optimisticType,
      content: text.trim() || file.name,
      media_url: attachment.url,
      created_at: new Date().toISOString(),
      metadata: { pending: true, fileName: file.name, ...(quotedMessageId ? { quotedId: quotedMessageId, quotedText: (replyTo?.content ?? "").slice(0, 200), quotedType: replyTo?.type, quotedDirection: replyTo?.direction } : {}) },
    };
    setMsgs((prev) => [...prev, optimistic]);
    setReplyTo(null);
    try {
      const b64 = await blobToBase64(file);
      const res = await sendMedia({ data: {
        contactId: selected.id, base64: b64, mime,
        fileName: file.name, caption: text.trim() || undefined, quotedMessageId,
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

  // Lazy-fetch avatars for the visible contacts (first 30)
  useEffect(() => {
    const pending = contacts.slice(0, 30).filter((c) => avatars[c.id] === undefined);
    if (!pending.length) return;
    let cancelled = false;
    (async () => {
      for (const c of pending) {
        if (cancelled) return;
        try {
          const r = await fetchAvatar({ data: { phone: c.phone } });
          if (!cancelled) setAvatars((prev) => ({ ...prev, [c.id]: r.url }));
        } catch {
          if (!cancelled) setAvatars((prev) => ({ ...prev, [c.id]: null }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [contacts, fetchAvatar, avatars]);

  async function startRecording() {
    if (!selected) return;
    try {
      pushPresence({ data: { contactId: selected.id, presence: "recording" } }).catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        // Cleanup analyser loop
        if (recRef.current?.raf) cancelAnimationFrame(recRef.current.raf);
        recRef.current?.audioCtx?.close().catch(() => {});
        setRecLevels(Array(24).fill(0.15));
        if (recRef.current?.cancelled) { recRef.current = null; return; }
        const blob = new Blob(chunks, { type: "audio/webm" });
        const localUrl = URL.createObjectURL(blob);
        const tmpId = `tmp-${Date.now()}`;
        const quotedMessageId = replyToRef.current?.id;
        const q = replyToRef.current;
        // Optimistic bubble so the user sees the audio right away
        setMsgs((prev) => [...prev, {
          id: tmpId, direction: "outbound", type: "audio",
          content: "[áudio]", media_url: localUrl,
          created_at: new Date().toISOString(),
          metadata: { audio: true, pending: true, ...(quotedMessageId ? { quotedId: quotedMessageId, quotedText: (q?.content ?? "").slice(0, 200), quotedType: q?.type, quotedDirection: q?.direction } : {}) },
        }]);
        setReplyTo(null);
        try {
          const b64 = await blobToBase64(blob);
          const res = await sendAudio({ data: { contactId: selected.id, audioBase64: b64, quotedMessageId } });
          if (res && "ok" in res && res.ok === false) {
            toast.error(res.error);
            setMsgs((prev) => prev.map((m) => m.id === tmpId ? { ...m, metadata: { ...(m.metadata ?? {}), pending: false, failed: true } } : m));
          } else {
            await loadMessages();
            URL.revokeObjectURL(localUrl);
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao enviar áudio");
          setMsgs((prev) => prev.map((m) => m.id === tmpId ? { ...m, metadata: { ...(m.metadata ?? {}), pending: false, failed: true } } : m));
        }
      };
      mr.start();
      // Simple soundwave via WebAudio analyser
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const bars = 24;
        const step = Math.max(1, Math.floor(buf.length / bars));
        const levels: number[] = [];
        for (let i = 0; i < bars; i++) {
          const v = buf[i * step] ?? 0;
          levels.push(Math.max(0.15, v / 255));
        }
        setRecLevels(levels);
        recRef.current!.raf = requestAnimationFrame(tick);
      };
      recRef.current = { mr, chunks, stream, audioCtx };
      recRef.current.raf = requestAnimationFrame(tick);
      setRecording(true);
      setRecTime(0);
    } catch (e) {
      toast.error("Não foi possível acessar o microfone");
    }
  }
  function stopRecording() {
    recRef.current?.mr.stop();
    setRecording(false);
    if (selected) pushPresence({ data: { contactId: selected.id, presence: "paused" } }).catch(() => {});
  }
  function cancelRecording() {
    if (!recRef.current) return;
    recRef.current.cancelled = true;
    try { recRef.current.mr.stop(); } catch { /* noop */ }
    setRecording(false);
    if (selected) pushPresence({ data: { contactId: selected.id, presence: "paused" } }).catch(() => {});
  }
  useEffect(() => {
    if (!recording) return;
    const i = setInterval(() => setRecTime((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [recording]);

  useEffect(() => {
    if (!recording || !selected) return;
    const i = setInterval(() => {
      pushPresence({ data: { contactId: selected.id, presence: "recording" } }).catch(() => {});
    }, 2500);
    return () => clearInterval(i);
  }, [recording, selected, pushPresence]);

  return (
    <div className="-m-6 h-[calc(100vh-3rem)]">
      <TooltipProvider delayDuration={200}>
      <div
        className={`grid grid-cols-1 gap-0 overflow-hidden h-full transition-all duration-300 ${
          sidebarCollapsed
            ? (infoOpen ? "md:grid-cols-[64px_1fr_320px]" : "md:grid-cols-[64px_1fr]")
            : (infoOpen ? "md:grid-cols-[360px_1fr_320px]" : "md:grid-cols-[360px_1fr]")
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
        <section className={`${selected ? "flex" : "hidden md:flex"} flex-col min-w-0 min-h-0 overflow-hidden h-full`} style={{ background: WA.chatBg }}>
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSidebarCollapsed((v) => !v)}
                      className="hidden md:grid h-9 w-9 -ml-1 place-items-center rounded-full bg-white/15 hover:bg-white/25 text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                      aria-label={sidebarCollapsed ? "Expandir lista de conversas" : "Recolher lista de conversas"}
                    >
                      {sidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{sidebarCollapsed ? "Expandir lista" : "Recolher lista"}</TooltipContent>
                </Tooltip>
                {avatars[selected.id] ? (
                  <button onClick={() => setLightbox({ type: "image", src: avatars[selected.id]! })} className="shrink-0 focus:outline-none">
                    <img src={avatars[selected.id]!} alt="" className="h-10 w-10 rounded-full object-cover hover:opacity-90" />
                  </button>
                ) : (
                  <div className="h-10 w-10 rounded-full grid place-items-center text-xs font-semibold bg-white/20 shrink-0">
                    {initials(selected.name, selected.phone)}
                  </div>
                )}
                <button onClick={() => setInfoOpen((v) => !v)} className="min-w-0 flex-1 text-left focus:outline-none">
                  <div className="text-sm font-semibold truncate">{selected.name || selected.phone}</div>
                  <div className="text-[11px] text-white/80 truncate">
                    {remotePresence === "composing" ? (
                      <span className="italic">digitando…</span>
                    ) : remotePresence === "recording" ? (
                      <span className="italic">gravando áudio…</span>
                    ) : (
                      selected.phone
                    )}
                  </div>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setInfoOpen((v) => !v)} className={`p-2 rounded-full hover:bg-white/15 transition ${infoOpen ? "bg-white/15" : ""}`} aria-label="Dados do contato">
                      <Info className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Dados do contato</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setSoundOn((v) => !v); if (!soundOn) playBell(); }}
                      className="p-2 rounded-full hover:bg-white/15 transition"
                      aria-label={soundOn ? "Desligar som" : "Ligar som"}
                    >
                      {soundOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{soundOn ? "Desligar som de notificação" : "Ligar som de notificação"}</TooltipContent>
                </Tooltip>
              </header>

              <div
                ref={scrollRef}
                onScroll={(e) => {
                  if (e.currentTarget.scrollTop < 80) void loadOlderMessages();
                }}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5"
                style={{
                  backgroundColor: WA.chatBg,
                  backgroundImage:
                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><circle cx='30' cy='30' r='1' fill='%23000000' opacity='0.04'/></svg>\")",
                }}
              >
                {hasOlder && (
                  <div className="sticky top-0 z-10 flex justify-center pb-2">
                    <button
                      type="button"
                      onClick={loadOlderMessages}
                      disabled={olderLoading}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white disabled:opacity-70"
                    >
                      {olderLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3 rotate-180" />}
                      Mensagens antigas
                    </button>
                  </div>
                )}
                {messagesLoading && !msgs.length && (
                  <div className="text-center text-xs text-gray-600 py-12">
                    <span className="inline-flex items-center gap-2 bg-white/80 px-3 py-1.5 rounded-full shadow-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando mensagens…
                    </span>
                  </div>
                )}
                {dedupedMsgs.map((m) => {
                  const out = m.direction === "outbound";
                  const isAudio = m.type === "audio" || (m.metadata as { audio?: boolean } | null)?.audio;
                  const isImage = m.type === "image" && !!m.media_url;
                  const isVideo = m.type === "video" && !!m.media_url;
                  const isFile = (m.type === "file" || m.type === "document") && !!m.media_url;
                  return (
                    <div key={m.id} data-msg-id={m.id} className={`group flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`relative max-w-[75%] rounded-lg px-2.5 py-1.5 shadow-sm text-sm text-gray-800`}
                        style={{ background: out ? WA.outBubble : WA.inBubble }}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="absolute top-0.5 right-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/10 transition"
                              aria-label="Opções da mensagem"
                            >
                              <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={out ? "end" : "start"} className="w-48">
                            <DropdownMenuItem onClick={() => setReplyTo(m)}>
                              <Reply className="h-4 w-4 mr-2" /> Marcar (responder)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setForwardMsg(m)}>
                              <Forward className="h-4 w-4 mr-2" /> Encaminhar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleStar(m.id)}>
                              <Star className={`h-4 w-4 mr-2 ${starred.has(m.id) ? "fill-yellow-400 text-yellow-500" : ""}`} />
                              {starred.has(m.id) ? "Desfavoritar" : "Favoritar"}
                            </DropdownMenuItem>
                            {out && m.type === "text" && !m.id.startsWith("tmp-") && (
                              <DropdownMenuItem onClick={() => { setEditMsg(m); setEditText(String(m.content ?? "")); }}>
                                <Pencil className="h-4 w-4 mr-2" /> Editar mensagem
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeleteConfirm(m)} className="text-red-600 focus:text-red-600">
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {(() => {
                          const q = (m.metadata ?? {}) as { quotedId?: string; quotedText?: string; quotedType?: string; quotedDeleted?: boolean };
                          if (q.quotedDeleted) {
                            return (
                              <div className="mb-1 w-full rounded border-l-4 border-gray-400 bg-black/5 px-2 py-1 text-xs italic text-gray-500">
                                Mensagem apagada
                              </div>
                            );
                          }
                          if (!q.quotedId) return null;
                          const label = q.quotedType === "audio" ? "🎤 Mensagem de voz"
                            : q.quotedType === "image" ? "🖼️ Imagem"
                            : q.quotedType === "video" ? "🎬 Vídeo"
                            : q.quotedType === "document" ? "📄 Arquivo"
                            : (q.quotedText || "Mensagem");
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                const el = scrollRef.current?.querySelector(`[data-msg-id="${q.quotedId}"]`) as HTMLElement | null;
                                if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("ring-2","ring-emerald-400"); setTimeout(() => el.classList.remove("ring-2","ring-emerald-400"), 1400); }
                              }}
                              className="mb-1 w-full text-left rounded border-l-4 border-emerald-500 bg-black/5 px-2 py-1 text-xs text-gray-700 hover:bg-black/10 transition"
                            >
                              <div className="font-medium text-emerald-700 text-[11px]">Resposta</div>
                              <div className="truncate">{label}</div>
                            </button>
                          );
                        })()}
                        {isAudio ? (
                          m.media_url
                            ? (
                              <div className="relative pr-8">
                                <AudioPlayer src={m.media_url} />
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); downloadFile(m.media_url!, `audio-${m.id}.ogg`); }}
                                  title="Baixar áudio"
                                  className="absolute top-1/2 -translate-y-1/2 right-1 grid place-items-center h-6 w-6 rounded-full bg-black/10 hover:bg-black/20 text-gray-700"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )
                            : <div className="flex items-center gap-2 text-gray-600"><Mic className="h-4 w-4" /><span>Mensagem de voz</span></div>
                        ) : isImage ? (
                          <div className="relative">
                            <button onClick={() => setLightbox({ type: "image", src: m.media_url! })} className="block focus:outline-none">
                              <img src={m.media_url!} alt={m.content ?? ""} className="rounded-md max-h-64 object-cover cursor-zoom-in" />
                            </button>
                            <DownloadBtn url={m.media_url!} filename={`image-${m.id}.jpg`} />
                          </div>
                        ) : isVideo ? (
                          <div className="relative">
                            <button onClick={() => setLightbox({ type: "video", src: m.media_url! })} className="block focus:outline-none">
                              <video src={m.media_url!} className="rounded-md max-h-64 bg-black cursor-zoom-in pointer-events-none" />
                            </button>
                            <DownloadBtn url={m.media_url!} filename={`video-${m.id}.mp4`} dark />
                          </div>
                        ) : isFile ? (
                          <div className="flex items-center gap-2 text-gray-800">
                            <FileText className="h-5 w-5 shrink-0" />
                            <a href={m.media_url!} target="_blank" rel="noreferrer" className="underline truncate max-w-[200px]">{m.content}</a>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); downloadFile(m.media_url!, m.content || `file-${m.id}`); }}
                              title="Baixar arquivo"
                              className="ml-auto grid place-items-center h-6 w-6 rounded-full bg-black/10 hover:bg-black/20 text-gray-700"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap break-words pr-14">{m.content}</div>
                        )}
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-500">
                          {starred.has(m.id) && <Star className="h-3 w-3 fill-yellow-400 text-yellow-500" />}
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {out && (() => {
                            const meta = (m.metadata ?? {}) as { status?: string; pending?: boolean; failed?: boolean };
                            if (meta.failed) return (
                              <button
                                type="button"
                                onClick={() => retryFailed(m.id)}
                                className="text-red-500 font-bold hover:underline"
                                title="Tentar novamente"
                              >!</button>
                            );
                            const s = meta.pending || !meta.status ? "pending" : meta.status;
                            const color =
                              s === "read" ? WA.read :
                              s === "delivered" || s === "sent" ? "#6b7280" :
                              "#9ca3af";
                            const Icon = s === "delivered" || s === "read" ? CheckCheck : Check;
                            return (
                              <span
                                key={s}
                                className="inline-flex transition-all duration-300 ease-out animate-in fade-in zoom-in-90"
                                style={{ color }}
                                aria-label={s === "read" ? "Lida" : s === "delivered" ? "Entregue" : s === "sent" ? "Enviada" : "Pendente"}
                              >
                                <Icon className="h-3.5 w-3.5 transition-colors duration-300" />
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!msgs.length && !messagesLoading && (
                  <div className="text-center text-xs text-gray-600 py-12">
                    <span className="inline-block bg-white/70 px-3 py-1 rounded-full shadow-sm">Nenhuma mensagem ainda — diga olá!</span>
                  </div>
                )}
              </div>

              <div className="px-3 py-2 flex items-end gap-2" style={{ background: "#F0F2F5" }}>
                {recording ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" onClick={cancelRecording} variant="ghost" className="rounded-full h-11 w-11 text-red-600 hover:bg-red-50" aria-label="Cancelar gravação">
                          <X className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Cancelar</TooltipContent>
                    </Tooltip>
                    <div className="flex-1 flex items-center gap-3 px-4 py-2 rounded-full bg-white shadow-sm">
                      <Mic className="h-4 w-4 text-red-500 animate-pulse shrink-0" />
                      <div className="flex-1 flex items-center gap-[2px] h-6">
                        {recLevels.map((lv, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-sm transition-[height] duration-75"
                            style={{ height: `${Math.round(lv * 100)}%`, background: WA.accent, minHeight: 3 }}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-mono text-gray-600 tabular-nums shrink-0">
                        {Math.floor(recTime / 60)}:{String(recTime % 60).padStart(2, "0")}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-full transition" aria-label="Emojis">
                          <Smile className="h-6 w-6" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" className="p-0 border-0 w-auto">
                        <EmojiPicker
                          onEmojiClick={(e) => setText((t) => t + e.emoji)}
                          emojiStyle={EmojiStyle.NATIVE}
                          theme={Theme.LIGHT}
                          searchPlaceholder="Buscar emoji"
                          width={340}
                          height={420}
                          previewConfig={{ showPreview: false }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={toggleAgent}
                          className={`p-2 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${agentPaused ? "text-gray-400 hover:text-gray-600" : "text-emerald-600 hover:text-emerald-700"}`}
                          aria-label={agentPaused ? "Ativar IA" : "Desativar IA"}
                        >
                          {agentPaused ? <BotOff className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{agentPaused ? "IA desativada — clique para ativar" : "IA ativa — clique para desativar"}</TooltipContent>
                    </Tooltip>
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={async () => {
                            // Probe camera permission so we can give a clear message when blocked.
                            try {
                              if (navigator.mediaDevices?.getUserMedia) {
                                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                                stream.getTracks().forEach((t) => t.stop());
                              }
                              cameraInputRef.current?.click();
                            } catch (err) {
                              const name = (err as { name?: string })?.name ?? "";
                              if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
                                const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edg|OPR/i.test(navigator.userAgent);
                                const isFirefox = /Firefox/i.test(navigator.userAgent);
                                const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome|Chromium/i.test(navigator.userAgent);
                                const hint = isChrome
                                  ? "Chrome: clique no cadeado ao lado do endereço → Permissões do site → Câmera → Permitir, e recarregue a página."
                                  : isFirefox
                                  ? "Firefox: clique no cadeado ao lado do endereço → Permissões → Usar a câmera → Permitir, e recarregue."
                                  : isSafari
                                  ? "Safari: Ajustes → Sites → Câmera → selecione este site e escolha Permitir. No iPhone: Ajustes → Safari → Câmera."
                                  : "Abra as permissões do site no seu navegador e libere o acesso à câmera, depois recarregue a página.";
                                toast.error("Acesso à câmera bloqueado", { description: hint, duration: 8000 });
                              } else if (name === "NotFoundError" || name === "OverconstrainedError") {
                                toast.error("Nenhuma câmera encontrada neste dispositivo.");
                              } else {
                                // Unknown error — fall back to the file picker anyway
                                cameraInputRef.current?.click();
                              }
                            }
                          }}
                          className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-full transition"
                          aria-label="Câmera"
                        >
                          <Camera className="h-6 w-6" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Gravar vídeo ou tirar foto</TooltipContent>
                    </Tooltip>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="video/*,image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setAttachment({ file: f, url: URL.createObjectURL(f) });
                        e.target.value = "";
                      }}
                    />
                    <div className="flex-1 flex flex-col gap-1">
                       {replyTo && (
                         <div className="flex items-stretch gap-2 bg-white rounded-lg px-2 py-1.5 shadow-sm text-sm">
                           <div className="w-1 rounded bg-emerald-500" />
                           <div className="min-w-0 flex-1">
                             <div className="text-[11px] font-medium text-emerald-700">
                               Respondendo {replyTo.direction === "outbound" ? "você" : (selected?.name || selected?.phone || "contato")}
                             </div>
                             <div className="truncate text-gray-700">
                               {replyTo.type === "audio" ? "🎤 Mensagem de voz"
                                 : replyTo.type === "image" ? "🖼️ Imagem"
                                 : replyTo.type === "video" ? "🎬 Vídeo"
                                 : replyTo.type === "document" ? "📄 Arquivo"
                                 : (replyTo.content || "")}
                             </div>
                           </div>
                           <button onClick={() => setReplyTo(null)} className="p-1 rounded-full hover:bg-gray-100 text-gray-500" aria-label="Cancelar resposta">
                             <X className="h-4 w-4" />
                           </button>
                         </div>
                       )}
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
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (attachment) handleSendAttachment(); else handleSendText(); } }}
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
        {selected && infoOpen && (
          <aside className="hidden md:flex flex-col w-80 border-l border-black/10 bg-white overflow-y-auto">
            <div className="px-4 py-3 flex items-center gap-2 text-white" style={{ background: WA.headerDark }}>
              <button onClick={() => setInfoOpen(false)} className="p-1 rounded-full hover:bg-white/15" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
              <div className="text-sm font-semibold">Dados do contato</div>
            </div>
            <div className="flex flex-col items-center py-6 border-b border-black/5">
              {avatars[selected.id] ? (
                <button onClick={() => setLightbox({ type: "image", src: avatars[selected.id]! })}>
                  <img src={avatars[selected.id]!} alt="" className="h-32 w-32 rounded-full object-cover shadow" />
                </button>
              ) : (
                <div className="h-32 w-32 rounded-full grid place-items-center text-3xl font-semibold text-white shadow" style={{ background: WA.headerTeal }}>
                  {initials(selected.name, selected.phone)}
                </div>
              )}
              <div className="mt-3 text-lg font-medium text-gray-900">{selected.name || selected.phone}</div>
              <div className="text-xs text-gray-500">{selected.phone}</div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500">Nome</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome do contato" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Telefone</label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Ex: 5511999999999" className="mt-1" />
              </div>
              <Button onClick={saveContact} disabled={savingContact} className="w-full text-white hover:opacity-90" style={{ background: WA.accent }}>
                {savingContact ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </div>
          </aside>
        )}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>
          {lightbox.type === "image" ? (
            <img src={lightbox.src} alt="" className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
          ) : (
            <video src={lightbox.src} controls autoPlay className="max-h-[90vh] max-w-[95vw]" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
      <Dialog open={!!forwardMsg} onOpenChange={(o) => { if (!o) { setForwardMsg(null); setForwardSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encaminhar mensagem</DialogTitle>
          </DialogHeader>
          <Input placeholder="Buscar contato..." value={forwardSearch} onChange={(e) => setForwardSearch(e.target.value)} />
          <div className="max-h-80 overflow-y-auto -mx-2">
            {contacts
              .filter((c) => {
                const q = forwardSearch.toLowerCase();
                if (!q) return true;
                return (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q);
              })
              .slice(0, 50)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => doForward(c)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted rounded text-left"
                >
                  <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-xs font-semibold shrink-0">
                    {initials(c.name, c.phone)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{c.name || c.phone}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.phone}</div>
                  </div>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir mensagem?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">Escolha como deseja excluir esta mensagem.</p>
          <div className="flex flex-col gap-2 pt-2">
            {deleteConfirm && deleteConfirm.direction === "outbound" && (deleteConfirm.metadata as { evoId?: string } | null)?.evoId && (
              <Button variant="destructive" onClick={() => performDelete(deleteConfirm, true)}>
                Excluir para todos
              </Button>
            )}
            <Button variant="outline" onClick={() => deleteConfirm && performDelete(deleteConfirm, false)}>
              Excluir para mim
            </Button>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
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