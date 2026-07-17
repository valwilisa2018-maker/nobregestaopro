import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Search, Send, Square, MessageCircle, Check, CheckCheck, Loader2, ArrowLeft, Smile, Play, Pause, Paperclip, ChevronLeft, ChevronRight, X, FileText, Image as ImageIcon, Video, Music, File as FileIcon, MoreVertical, Star, Archive, ArchiveRestore, Pin, PinOff, Tag, Info, Save, Bell, BellOff, Trash2, Forward, ChevronDown, Reply, CornerUpLeft, Download, Bot, BotOff, Camera, Pencil, Plug, Settings, RefreshCw, Workflow, Sun, Moon } from "lucide-react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { sendChatText, sendChatAudio, sendChatMedia, getProfilePicture, sendPresence, ensurePresenceWebhook, subscribeContactPresence, deleteChatMessage, forwardChatMessage, editChatMessage, reactChatMessage, syncContactNames, startFlowForContact } from "@/lib/evolution.functions";
import { toast } from "sonner";
import notificationSound from "@/assets/notification.mp3.asset.json";
import { QuickSendPopover } from "@/components/quick-send-popover";

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

const CHAT_THEME = {
  light: {
    headerDark: "#4c1d95",    // violet-900
    headerTeal: "#7c3aed",    // violet-600
    accent: "#8b5cf6",        // violet-500
    chatBg: "#ECE5DD",        // WhatsApp original
    outBubble: "#DCF8C6",     // WhatsApp original
    inBubble: "#FFFFFF",
    read: "#34B7F1",          // WhatsApp original
    sidebarBg: "#ffffff",
    sidebarSub: "#F6F6F6",
    emptyBg: "#F0F2F5",
    textMain: "#1f2937",
    textMuted: "#6b7280",
    textSecondary: "#9ca3af",
    inputBg: "#ffffff",
    border: "rgba(0,0,0,0.1)",
    popoverBg: "#ffffff",
    hoverBg: "#f9fafb",
    activeBg: "#f3f4f6",
  },
  dark: {
    headerDark: "#2e1065",    // violet-950
    headerTeal: "#5b21b6",    // violet-800
    accent: "#7c3aed",        // violet-600
    chatBg: "#0b1220",        // deep navy/slate
    outBubble: "#1e3a5f",     // dark blue
    inBubble: "#1f2937",       // dark slate
    read: "#38bdf8",          // sky-400
    sidebarBg: "#111827",      // gray-900
    sidebarSub: "#1f2937",     // gray-800
    emptyBg: "#0b1220",
    textMain: "#e5e7eb",
    textMuted: "#9ca3af",
    textSecondary: "#6b7280",
    inputBg: "#1f2937",
    border: "rgba(255,255,255,0.1)",
    popoverBg: "#1f2937",
    hoverBg: "#1f2937",
    activeBg: "#374151",
  },
};

function chatTheme(dark: boolean) {
  return CHAT_THEME[dark ? "dark" : "light"];
}

function chatClass(dark: boolean, light: string, darkClass: string) {
  return dark ? darkClass : light;
}


const STICKERS = ["😀","😂","😍","🥰","😎","🤩","🥳","😭","😡","🤔","👍","👏","🙏","🔥","💯","🎉","❤️","💔","😅","🤣","😴","🤗","🤝","👀","💪","🌹","🍀","⭐","☀️","🌙","🎂","🍕","☕","⚽","🎮","🎵","📸","💡","✅","❌"];
const MESSAGE_PAGE_SIZE = 30;

function scopedWaKey(key: string, userId?: string | null) {
  return userId ? `${key}:${userId}` : `${key}:anon`;
}

function readScopedJson<T>(key: string, userId: string | undefined | null, fallback: T): T {
  if (typeof window === "undefined" || !userId) return fallback;
  try {
    const raw = localStorage.getItem(scopedWaKey(key, userId));
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeScopedJson(key: string, userId: string | undefined | null, value: unknown) {
  if (typeof window === "undefined" || !userId) return;
  try { localStorage.setItem(scopedWaKey(key, userId), JSON.stringify(value)); } catch { /* quota */ }
}

function readScopedString(key: string, userId: string | undefined | null, fallback: string) {
  if (typeof window === "undefined" || !userId) return fallback;
  try { return localStorage.getItem(scopedWaKey(key, userId)) ?? fallback; } catch { return fallback; }
}

function writeScopedString(key: string, userId: string | undefined | null, value: string) {
  if (typeof window === "undefined" || !userId) return;
  try { localStorage.setItem(scopedWaKey(key, userId), value); } catch { /* ignore */ }
}

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
      className={`absolute top-1 right-1 z-10 grid place-items-center h-6 w-6 rounded-full backdrop-blur transition ${dark ? "bg-background/50 hover:bg-background/70 text-foreground" : "bg-white/85 hover:bg-white text-foreground"}`}
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  );
}

function MessagesPage() {
  const { user } = useAuth();
  const [chatDarkMode, setChatDarkMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(scopedWaKey("wa-dark", user?.id)) === "1";
    } catch { return false; }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    try {
      localStorage.setItem(scopedWaKey("wa-dark", user.id), chatDarkMode ? "1" : "0");
    } catch {}
  }, [chatDarkMode, user?.id]);
  const theme = chatTheme(chatDarkMode);
  // Debug logger — ligue no console com: localStorage.setItem('wa-debug','1')
  // Desligue com: localStorage.removeItem('wa-debug')
  const waDebug = useCallback((event: string, payload?: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("wa-debug") !== "1") return;
    // eslint-disable-next-line no-console
    console.log(`[wa-msg] ${event}`, {
      t: new Date().toISOString(),
      route: typeof window !== "undefined" ? window.location.pathname : "",
      ...(payload ?? {}),
    });
  }, []);
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
  const [uploadQueue, setUploadQueue] = useState<Array<{ id: string; name: string; size: number; url: string; kind: "image" | "video" | "audio" | "pdf" | "file"; status: "uploading" | "done" | "failed"; error?: string }>>([]);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const [filterMode, setFilterMode] = useState<"all" | "unread" | "favorites" | "groups" | "archived">("all");
  const [archived, setArchived] = useState<Set<string>>(() => {
    return new Set(readScopedJson<string[]>("wa-arch", user?.id, []));
  });
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    return new Set(readScopedJson<string[]>("wa-fav", user?.id, []));
  });
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>(() => {
    return readScopedJson<Record<string, number>>("wa-unread", user?.id, {});
  });
  const unreadMapRef = useRef<Record<string, number>>({});
  useEffect(() => {
    unreadMapRef.current = unreadMap;
    writeScopedJson("wa-unread", user?.id, unreadMap);
  }, [unreadMap, user?.id]);
  const [pinned, setPinned] = useState<Set<string>>(() => {
    return new Set(readScopedJson<string[]>("wa-pin", user?.id, []));
  });
  const [labels, setLabels] = useState<Record<string, string>>(() => {
    return readScopedJson<Record<string, string>>("wa-labels", user?.id, {});
  });
  const [instances, setInstances] = useState<Array<{ id: string; name: string; instance_name: string; profile_name: string | null; profile_picture: string | null; phone_number: string | null }>>([]);
  const [activeInstance, setActiveInstance] = useState<string>(() => {
    return readScopedString("wa-instance", user?.id, "all");
  });
  useEffect(() => {
    writeScopedString("wa-instance", user?.id, activeInstance);
  }, [activeInstance, user?.id]);
  // Map: phone digits -> Set of connection ids that have a conversation with that JID
  const [contactConnMap, setContactConnMap] = useState<Record<string, Set<string>>>({});
  // Map: contact.id -> last activity timestamp (ms) — used for WhatsApp-style ordering
  const [lastActivityMap, setLastActivityMap] = useState<Record<string, number>>({});
  const [lastPreviewMap, setLastPreviewMap] = useState<Record<string, { text: string; direction: string; ts: number }>>({});
  const [instanceProfilePic, setInstanceProfilePic] = useState<Record<string, string | null>>({});
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileNameEdit, setProfileNameEdit] = useState("");
  const [profileNameSaving, setProfileNameSaving] = useState(false);
  const profilePicInputRef = useRef<HTMLInputElement | null>(null);
  const sendText = useServerFn(sendChatText);
  const sendAudio = useServerFn(sendChatAudio);
  const sendMedia = useServerFn(sendChatMedia);
  const fetchAvatar = useServerFn(getProfilePicture);
  const syncNamesFn = useServerFn(syncContactNames);
  const pushPresence = useServerFn(sendPresence);
  const ensureWebhook = useServerFn(ensurePresenceWebhook);
  const subscribePresenceFn = useServerFn(subscribeContactPresence);
  const deleteMsgFn = useServerFn(deleteChatMessage);
  const forwardMsgFn = useServerFn(forwardChatMessage);
  const editMsgFn = useServerFn(editChatMessage);
  const reactMsgFn = useServerFn(reactChatMessage);
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
  const remotePresenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentPresenceRef = useRef<number>(0);
  const [lightbox, setLightbox] = useState<{ type: "image" | "video"; src: string } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [convoId, setConvoId] = useState<string | null>(null);
  const [agentPaused, setAgentPaused] = useState<boolean>(false);
  const selectedRef = useRef<Contact | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const contactsRef = useRef<Contact[]>([]);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);
  // Clear unread badge when opening a conversation
  useEffect(() => {
    if (!selected) return;
    setUnreadMap((prev) => {
      if (!prev[selected.id]) return prev;
      const next = { ...prev };
      delete next[selected.id];
      return next;
    });
  }, [selected?.id]);
  const messageLoadSeqRef = useRef(0);
  const conversationIdsRef = useRef<string[]>([]);
  const messagesCacheRef = useRef<Map<string, Msg[]>>(new Map());
  const conversationIdsCacheRef = useRef<Map<string, string[]>>(new Map());
  // Hydrate persistent caches so messages appear instantly on reload / repeat opens
  useEffect(() => {
    messagesCacheRef.current.clear();
    conversationIdsCacheRef.current.clear();
    if (!user?.id) return;
    try {
      const obj = readScopedJson<Record<string, Msg[]>>("wa-msg-cache", user.id, {});
      for (const [k, v] of Object.entries(obj)) messagesCacheRef.current.set(k, v);
      const objIds = readScopedJson<Record<string, string[]>>("wa-conv-cache", user.id, {});
      for (const [k, v] of Object.entries(objIds)) conversationIdsCacheRef.current.set(k, v);
    } catch { /* ignore */ }
    setArchived(new Set(readScopedJson<string[]>("wa-arch", user.id, [])));
    setFavorites(new Set(readScopedJson<string[]>("wa-fav", user.id, [])));
    setPinned(new Set(readScopedJson<string[]>("wa-pin", user.id, [])));
    setLabels(readScopedJson<Record<string, string>>("wa-labels", user.id, {}));
    setUnreadMap(readScopedJson<Record<string, number>>("wa-unread", user.id, {}));
    setActiveInstance(readScopedString("wa-instance", user.id, "all"));
    setMsgs([]);
    setSelected(null);
    setConvoId(null);
  }, [user?.id]);
  const persistMsgCache = useCallback((contactId: string, rows: Msg[]) => {
    messagesCacheRef.current.set(contactId, rows);
    if (typeof window !== "undefined" && localStorage.getItem("wa-debug") === "1") {
      // eslint-disable-next-line no-console
      console.log("[wa-msg] persistMsgCache", { contactId, count: rows.length, firstId: rows[0]?.id, lastId: rows[rows.length - 1]?.id });
    }
    if (typeof window === "undefined") return;
    try {
      const obj: Record<string, Msg[]> = {};
      // Cap: only persist last 40 msgs per contact and last 30 contacts to keep storage small
      const entries = [...messagesCacheRef.current.entries()].slice(-30);
      for (const [k, v] of entries) obj[k] = v.slice(-40);
      writeScopedJson("wa-msg-cache", user?.id, obj);
    } catch { /* quota */ }
  }, [user?.id]);
  const persistConvCache = useCallback((contactId: string, ids: string[]) => {
    conversationIdsCacheRef.current.set(contactId, ids);
    if (typeof window === "undefined") return;
    try {
      const obj: Record<string, string[]> = {};
      for (const [k, v] of conversationIdsCacheRef.current.entries()) obj[k] = v;
      writeScopedJson("wa-conv-cache", user?.id, obj);
    } catch { /* quota */ }
  }, [user?.id]);
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
  const loadMessagesRef = useRef<(() => void) | null>(null);

  function mergeMessageIntoThread(incoming: Msg, replaceTmpId?: string, contactId?: string) {
    const targetId = contactId ?? selectedRef.current?.id;
    if (targetId) {
      const ts = new Date(incoming.created_at).getTime();
      if (Number.isFinite(ts)) {
        setLastActivityMap((prev) => (ts > (prev[targetId] ?? 0) ? { ...prev, [targetId]: ts } : prev));
      }
    }
    setMsgs((prev) => {
      const evoId = (incoming.metadata as { evoId?: unknown } | null)?.evoId;
      let idx = prev.findIndex((m) => {
        if (m.id === incoming.id || (replaceTmpId && m.id === replaceTmpId)) return true;
        const meta = (m.metadata ?? {}) as { evoId?: unknown };
        return !!evoId && meta.evoId === evoId;
      });
      if (idx === -1 && !incoming.id.startsWith("tmp-")) {
        const incomingTs = new Date(incoming.created_at).getTime();
        idx = prev.findIndex((m) => {
          if (!m.id.startsWith("tmp-")) return false;
          if (m.direction !== incoming.direction || (m.type || "text") !== (incoming.type || "text")) return false;
          if ((m.content ?? "") !== (incoming.content ?? "")) return false;
          const mts = new Date(m.created_at).getTime();
          return Number.isFinite(incomingTs) && Number.isFinite(mts) && Math.abs(incomingTs - mts) < 180_000;
        });
      }
      const next = idx === -1 ? [...prev, incoming] : prev.map((m, i) => {
        if (i !== idx) return m;
        // Preserve a local blob:/object URL on the outgoing optimistic bubble
        // until the server-side media URL is a real fetchable http(s) URL.
        // Otherwise the video/image visibly "disappears" the moment the row
        // is replaced by the DB record whose media_url is just a storage path.
        const prevUrl = m.media_url ?? "";
        const incUrl = incoming.media_url ?? "";
        const prevIsLocal = prevUrl.startsWith("blob:") || prevUrl.startsWith("data:");
        const incIsRemote = /^https?:\/\//.test(incUrl);
        const keepLocal = prevIsLocal && !incIsRemote;
        return keepLocal ? { ...incoming, media_url: prevUrl } : incoming;
      });
      next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (targetId) persistMsgCache(targetId, next);
      return next;
    });
  }

  function mergeThreadPagePreservingOlder(current: Msg[], refreshed: Msg[]) {
    if (typeof window !== "undefined" && localStorage.getItem("wa-debug") === "1") {
      // eslint-disable-next-line no-console
      console.log("[wa-msg] mergeThreadPagePreservingOlder:in", { currentCount: current.length, refreshedCount: refreshed.length });
    }
    if (!current.length) return refreshed;
    if (!refreshed.length) return current;
    const oldestRefreshedTs = Math.min(...refreshed.map((m) => new Date(m.created_at).getTime()).filter(Number.isFinite));
    const keyFor = (m: Msg) => {
      const evoId = (m.metadata as { evoId?: unknown } | null)?.evoId;
      return typeof evoId === "string" && evoId ? `evo:${evoId}` : `id:${m.id}`;
    };
    const keptOlder = current.filter((m) => {
      if (m.id.startsWith("tmp-")) return true;
      const ts = new Date(m.created_at).getTime();
      return Number.isFinite(ts) && ts < oldestRefreshedTs;
    });
    const map = new Map<string, Msg>();
    for (const m of [...keptOlder, ...refreshed]) {
      const key = keyFor(m);
      const prev = map.get(key);
      map.set(key, prev ? { ...prev, ...m, metadata: { ...(prev.metadata ?? {}), ...(m.metadata ?? {}) } } : m);
    }
    const out = [...map.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (typeof window !== "undefined" && localStorage.getItem("wa-debug") === "1") {
      // eslint-disable-next-line no-console
      console.log("[wa-msg] mergeThreadPagePreservingOlder:out", {
        outCount: out.length,
        keptOlder: keptOlder.length,
        oldestRefreshedTs,
        droppedFromCurrent: current.length - keptOlder.length,
      });
    }
    return out;
  }

  const attemptSendText = useCallback((tmpId: string, contactId: string, body: string, attempt = 0, quotedMessageId?: string) => {
    const MAX = 3;
    sendText({ data: { contactId, text: body, quotedMessageId } })
      .then((res) => {
        if (res && "ok" in res && res.ok === false) throw new Error(res.error || "send failed");
        retryRegistry.current.delete(tmpId);
        const serverMsg = (res as { message?: Msg | null } | null)?.message;
        if (serverMsg) mergeMessageIntoThread(serverMsg, tmpId, contactId);
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
    return new Set(readScopedJson<string[]>("wa-starred", user?.id, []));
  });
  const toggleStar = useCallback((id: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      writeScopedJson("wa-starred", user?.id, [...next]);
      return next;
    });
  }, [user?.id]);

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
  const [forwardSelected, setForwardSelected] = useState<Record<string, boolean>>({});
  const [forwardSending, setForwardSending] = useState(false);
  const FORWARD_LIMIT = 10;
  const forwardSelectedCount = Object.values(forwardSelected).filter(Boolean).length;
  const toggleForwardTarget = useCallback((c: Contact) => {
    setForwardSelected((prev) => {
      const next = { ...prev };
      if (next[c.id]) { delete next[c.id]; return next; }
      const count = Object.values(next).filter(Boolean).length;
      if (count >= FORWARD_LIMIT) {
        toast.error(`Máximo de ${FORWARD_LIMIT} contatos por encaminhamento`);
        return prev;
      }
      next[c.id] = true;
      return next;
    });
  }, []);
  const closeForward = useCallback(() => {
    setForwardMsg(null);
    setForwardSearch("");
    setForwardSelected({});
  }, []);
  const doForward = useCallback(async () => {
    if (!forwardMsg) return;
    const targets = contacts.filter((c) => forwardSelected[c.id]);
    if (!targets.length) { toast.error("Selecione ao menos um contato"); return; }
    const src = forwardMsg;
    setForwardSending(true);
    let ok = 0; let fail = 0;
    for (const t of targets) {
      try {
        const res = await forwardMsgFn({ data: { messageId: src.id, targetContactId: t.id } });
        if (res && "ok" in res && res.ok === false) throw new Error((res as { error?: string }).error || "Falha");
        ok++;
        if (t.id === selected?.id) await loadMessages();
      } catch { fail++; }
    }
    setForwardSending(false);
    closeForward();
    if (ok && !fail) toast.success(`Encaminhada para ${ok} contato${ok > 1 ? "s" : ""}`);
    else if (ok && fail) toast.warning(`${ok} enviada${ok > 1 ? "s" : ""}, ${fail} falharam`);
    else toast.error("Falha ao encaminhar");
  }, [forwardMsg, forwardSelected, contacts, selected, forwardMsgFn, closeForward]);

  const performEdit = useCallback(async () => {
    if (!editMsg) return;
    const newText = editText.trim();
    if (!newText) { toast.error("Texto não pode ficar vazio"); return; }
    if (newText === String(editMsg.content ?? "")) { setEditMsg(null); return; }
    setEditSaving(true);
    const id = editMsg.id;
    const prevContent = editMsg.content;
    setMsgs((prev) => prev.map((x) => x.id === id ? { ...x, content: newText, metadata: { ...(x.metadata ?? {}), edited: true } } : x));
    try {
      const res = await editMsgFn({ data: { messageId: id, text: newText } });
      if (res && "ok" in res && res.ok === false) throw new Error((res as { error?: string }).error || "Falha ao editar");
      toast.success("Mensagem editada");
      setEditMsg(null);
    } catch (e) {
      setMsgs((prev) => prev.map((x) => x.id === id ? { ...x, content: prevContent } : x));
      toast.error(e instanceof Error ? e.message : "Falha ao editar");
    } finally {
      setEditSaving(false);
    }
  }, [editMsg, editText, editMsgFn]);

  const performReact = useCallback(async (m: Msg, emoji: string) => {
    const current = (m.metadata as { reaction?: string } | null)?.reaction ?? "";
    const next = current === emoji ? "" : emoji; // toggle
    setMsgs((prev) => prev.map((x) => x.id === m.id
      ? { ...x, metadata: { ...(x.metadata ?? {}), reaction: next || undefined } }
      : x));
    if (m.id.startsWith("tmp-")) return;
    try {
      const res = await reactMsgFn({ data: { messageId: m.id, reaction: next } });
      if (res && "ok" in res && res.ok === false) throw new Error((res as { error?: string }).error || "Falha ao reagir");
    } catch (e) {
      setMsgs((prev) => prev.map((x) => x.id === m.id
        ? { ...x, metadata: { ...(x.metadata ?? {}), reaction: current || undefined } }
        : x));
      toast.error(e instanceof Error ? e.message : "Falha ao reagir");
    }
  }, [reactMsgFn]);

  // Ensure webhook includes PRESENCE_UPDATE (best-effort, one shot)
  useEffect(() => {
    if (!user) return;
    (ensureWebhook as unknown as () => Promise<unknown>)().catch(() => {});
  }, [user, ensureWebhook]);

  // Subscribe to remote presence for the selected contact
  useEffect(() => {
    setRemotePresence(null);
    if (remotePresenceTimerRef.current) { clearTimeout(remotePresenceTimerRef.current); remotePresenceTimerRef.current = null; }
    if (!user || !selected) return;
    // Ask Evolution/WhatsApp to start pushing presence for this contact,
    // then re-subscribe every 45s (WhatsApp presence subscription expires).
    subscribePresenceFn({ data: { contactId: selected.id } }).catch(() => {});
    const resubTimer = setInterval(() => {
      subscribePresenceFn({ data: { contactId: selected.id } }).catch(() => {});
    }, 45_000);
    const jids = new Set(jidVariants(selected.phone));
    const lidJids = (selected.metadata as { lidJids?: unknown } | null)?.lidJids;
    if (Array.isArray(lidJids)) lidJids.forEach((jid) => { if (typeof jid === "string") jids.add(jid); });
    const ch = supabase.channel(`presence-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "presence", filter: `user_id=eq.${user.id}` }, (payload) => {
        // Ignore DELETE events (no meaningful presence state)
        if (!payload.new) return;
        const row = payload.new as { jid?: string; presence?: string; updated_at?: string } | null;
        if (!row?.jid) return;
        // STRICT: only react to presence updates whose JID exactly matches this contact.
        // The previous "recent @lid fallback" caused ghost "digitando…" for any recent LID presence.
        if (!jids.has(row.jid)) return;
        // Ignore stale rows (older than 20s) that arrive on channel resubscription.
        if (row.updated_at && Date.now() - new Date(row.updated_at).getTime() > 20000) return;
        const p = row.presence ?? "available";
        if (remotePresenceTimerRef.current) { clearTimeout(remotePresenceTimerRef.current); remotePresenceTimerRef.current = null; }
        if (p === "composing" || p === "recording") {
          setRemotePresence(p);
          // Auto-clear only if no new update arrives. Recording holds longer since audio can be long.
          const ttl = p === "recording" ? 15000 : 8000;
          remotePresenceTimerRef.current = setTimeout(() => {
            setRemotePresence((cur) => (cur === p ? null : cur));
          }, ttl);
        } else {
          // Hold the current indicator briefly to avoid flicker between composing bursts.
          remotePresenceTimerRef.current = setTimeout(() => setRemotePresence(null), 1500);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      clearInterval(resubTimer);
      if (remotePresenceTimerRef.current) { clearTimeout(remotePresenceTimerRef.current); remotePresenceTimerRef.current = null; }
    };
  }, [user, selected, subscribePresenceFn]);

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
        await supabase.from("contacts").delete().eq("user_id", user.id).in("id", dupes.map((d) => d.id));
      }
      const { error } = await supabase.from("contacts")
        .update({ name: name || null, phone })
        .eq("id", selected.id)
        .eq("user_id", user.id);
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
  const loadContactsRef = useRef(loadContacts);
  useEffect(() => { loadContactsRef.current = loadContacts; }, [loadContacts]);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Sync missing contact names from WhatsApp (once per session, when needed)
  const syncedNamesRef = useRef(false);
  useEffect(() => {
    if (!user || syncedNamesRef.current) return;
    if (!contacts.length) return;
    const missing = contacts.filter((c) => !c.name || !c.name.trim());
    if (!missing.length) return;
    syncedNamesRef.current = true;
    syncNamesFn({})
      .then((r) => { if (r?.updated) loadContactsRef.current?.(); })
      .catch(() => { /* ignore */ });
  }, [user, contacts, syncNamesFn]);

  // Load instances (connections) and per-contact connection membership map
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("connections")
        .select("id,name,instance_name,profile_name,profile_picture,phone_number,status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      setInstances((data ?? []).map((c) => ({
        id: c.id, name: c.name, instance_name: c.instance_name, profile_name: c.profile_name,
        profile_picture: c.profile_picture, phone_number: c.phone_number,
      })));
      const map: Record<string, string | null> = {};
      for (const c of data ?? []) map[c.id] = c.profile_picture ?? null;
      setInstanceProfilePic(map);
    })();
  }, [user]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("conversations")
        .select("id,connection_id,metadata,last_message_at,updated_at")
        .eq("user_id", user.id)
        .limit(5000);
      const map: Record<string, Set<string>> = {};
      // digits -> newest activity timestamp across all conversations for that phone
      const digitsTs: Record<string, number> = {};
      const convDigits: Record<string, string> = {};
      for (const row of data ?? []) {
        const jid = (row.metadata as { remoteJid?: string } | null)?.remoteJid ?? "";
        const digits = String(jid).split("@")[0].replace(/\D+/g, "");
        if (!digits) continue;
        if (row.connection_id) (map[digits] ??= new Set()).add(row.connection_id);
        const ts = new Date((row.last_message_at as string | null) ?? (row.updated_at as string | null) ?? 0).getTime() || 0;
        if (ts > (digitsTs[digits] ?? 0)) digitsTs[digits] = ts;
        if (row.id) convDigits[row.id] = digits;
      }
      setContactConnMap(map);
      // Map contact.id -> latest activity by matching phone variants
      const activity: Record<string, number> = {};
      for (const c of contacts) {
        let best = 0;
        for (const d of phoneVariants(c.phone)) {
          const ts = digitsTs[d] ?? 0;
          if (ts > best) best = ts;
        }
        if (best) activity[c.id] = best;
      }
      setLastActivityMap(activity);

      // Fetch recent messages to build a "last message" preview per digits
      const { data: msgs } = await supabase.from("messages")
        .select("conversation_id,content,type,direction,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3000);
      const digitsPreview: Record<string, { text: string; direction: string; ts: number }> = {};
      for (const m of msgs ?? []) {
        const d = convDigits[m.conversation_id as string];
        if (!d) continue;
        if (digitsPreview[d]) continue;
        const t = (m.type as string) || "text";
        let text = (m.content as string | null)?.trim() || "";
        if (!text) {
          if (t === "image") text = "📷 Foto";
          else if (t === "audio") text = "🎤 Áudio";
          else if (t === "video") text = "🎬 Vídeo";
          else if (t === "document") text = "📄 Documento";
          else if (t === "sticker") text = "🩷 Figurinha";
          else text = "Mensagem";
        }
        digitsPreview[d] = {
          text,
          direction: (m.direction as string) || "in",
          ts: new Date(m.created_at as string).getTime() || 0,
        };
      }
      const previewByContact: Record<string, { text: string; direction: string; ts: number }> = {};
      for (const c of contacts) {
        for (const d of phoneVariants(c.phone)) {
          if (digitsPreview[d]) { previewByContact[c.id] = digitsPreview[d]; break; }
        }
      }
      setLastPreviewMap(previewByContact);
    })();
  }, [user, contacts.length]);

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
    if (activeInstance !== "all") {
      list = list.filter((c) => {
        for (const digits of phoneVariants(c.phone)) {
          const set = contactConnMap[digits];
          if (set?.has(activeInstance)) return true;
        }
        return false;
      });
    }
    if (filterMode === "archived") list = list.filter((c) => archived.has(c.id));
    else list = list.filter((c) => !archived.has(c.id));
    if (filterMode === "unread") list = list.filter((c) => (unreadMap[c.id] ?? 0) > 0);
    else if (filterMode === "favorites") list = list.filter((c) => favorites.has(c.id));
    else if (filterMode === "groups") list = list.filter((c) => c.phone.includes("@g.us"));
    if (q) list = list.filter((c) => (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q));
    return [...list].sort((a, b) => {
      const pinDiff = Number(pinned.has(b.id)) - Number(pinned.has(a.id));
      if (pinDiff !== 0) return pinDiff;
      const ta = lastActivityMap[a.id] ?? 0;
      const tb = lastActivityMap[b.id] ?? 0;
      return tb - ta;
    });
  }, [contacts, search, filterMode, favorites, unreadMap, archived, pinned, activeInstance, contactConnMap, lastActivityMap]);
  const unreadTotal = useMemo(
    () => Object.values(unreadMap).reduce((a, b) => a + b, 0),
    [unreadMap],
  );
  const groupsTotal = useMemo(() => contacts.filter((c) => c.phone.includes("@g.us")).length, [contacts]);

  // Defensive dedup: collapse only identical IDs and optimistic tmp/real pairs.
  // Real repeated text like "oi" must stay visible in the history.
  const dedupedMsgs = useMemo(() => {
    const seenIds = new Set<string>();
    const bySig = new Map<string, number>(); // signature -> index in output
    const out: typeof msgs = [];
    for (const m of msgs) {
      if (seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      const type = m.type || "text";
      // Skip empty text messages (no content, no media) that render as blank bubbles.
      if (type === "text" && !m.media_url && !(m.content ?? "").trim()) continue;
      const ts = new Date(m.created_at).getTime() || 0;
      const sig = `${m.direction}|${type}|${m.content ?? ""}`;
      const prevIdx = bySig.get(sig);
      if (prevIdx !== undefined) {
        const prev = out[prevIdx];
        const prevTs = new Date(prev.created_at).getTime() || 0;
        if (Math.abs(ts - prevTs) < 120_000) {
          const hasTmp = prev.id.startsWith("tmp-") || m.id.startsWith("tmp-");
          // Collapse optimistic tmp/real pairs only. Real audios often share
          // the same "[áudio]" content label and must all stay visible.
          if (hasTmp && prev.id.startsWith("tmp-") && !m.id.startsWith("tmp-")) {
            out[prevIdx] = m;
            bySig.set(sig, prevIdx);
          }
          if (hasTmp) continue;
        }
      }
      bySig.set(sig, out.length);
      out.push(m);
    }
    return out;
  }, [msgs]);

  const hydrateSignedUrls = useCallback((rows: Msg[], reqId: string) => {
    // Only hydrate the most recent media rows first — the older ones are off-screen
    // and can be hydrated lazily. Signing every URL up-front is the main reason
    // the chat feels slow to open on threads with lots of media.
    const rowsWithStorage = rows.filter((m) => storagePathFrom(m)).slice(-15);
    if (!rowsWithStorage.length) return;
    (async () => {
      // Split cached vs uncached, then batch-sign the uncached in a single request.
      const patches: Array<{ id: string; url: string }> = [];
      const toSign: Array<{ id: string; path: string }> = [];
      for (const m of rowsWithStorage) {
        const path = storagePathFrom(m);
        if (!path) continue;
        const cached = signedUrlCacheRef.current.get(path);
        if (cached) patches.push({ id: m.id, url: cached });
        else toSign.push({ id: m.id, path });
      }
      if (toSign.length) {
        const paths = Array.from(new Set(toSign.map((r) => r.path)));
        const { data } = await supabase.storage.from("agent-media").createSignedUrls(paths, 60 * 60 * 24);
        const byPath = new Map<string, string>();
        for (const s of data ?? []) if (s.path && s.signedUrl) {
          byPath.set(s.path, s.signedUrl);
          signedUrlCacheRef.current.set(s.path, s.signedUrl);
        }
        for (const r of toSign) {
          const url = byPath.get(r.path);
          if (url) patches.push({ id: r.id, url });
        }
      }
      if (selectedRef.current?.id !== reqId) return;
      const map = new Map(patches.map((p) => [p.id, p.url]));
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
    if (!user || !selected) {
      waDebug("loadMessages:abort-no-selection", { hasUser: !!user, hasSelected: !!selected });
      setMsgs([]); setMessagesLoading(false); return;
    }
    const reqId = selected.id;
    const seq = ++messageLoadSeqRef.current;
    const cached = messagesCacheRef.current.get(reqId);
    const cachedIds = conversationIdsCacheRef.current.get(reqId);
    waDebug("loadMessages:start", {
      contactId: reqId,
      seq,
      cachedMsgs: cached?.length ?? 0,
      cachedConvIds: cachedIds?.length ?? 0,
      selectedPhone: selected.phone,
    });
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
        .eq("user_id", user.id)
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
      waDebug("loadMessages:fastPath", { contactId: reqId, fetched: fastData.length, applied: rows.length });
      setHasOlder(fastData.length > MESSAGE_PAGE_SIZE);
      setMsgs((prev) => {
        const next = mergeThreadPagePreservingOlder(prev, rows);
        waDebug("loadMessages:fastPath:setMsgs", { contactId: reqId, prevCount: prev.length, nextCount: next.length });
        persistMsgCache(reqId, next);
        return next;
      });
      setMessagesLoading(false);
      hydrateSignedUrls(rows, reqId);
    }

    if (selectedRef.current?.id !== reqId) {
      waDebug("loadMessages:abort-selection-changed", { reqId, currentId: selectedRef.current?.id });
      return;
    }
    const matched = convs ?? [];
    const ids = matched.map((c) => c.id);
    conversationIdsRef.current = ids;
    persistConvCache(reqId, ids);
    const primary = matched[0] ?? null;
    setConvoId(primary?.id ?? null);
    const pm = (primary?.metadata ?? {}) as { agent_paused_until?: string; agent_disabled?: boolean };
    const pausedUntil = pm.agent_paused_until ?? null;
    const disabled = !!pm.agent_disabled;
    setAgentPaused(disabled || (!!pausedUntil && new Date(pausedUntil).getTime() > Date.now()));
    if (!ids.length) {
      // Don't wipe cached messages if lookup temporarily fails; only clear if we truly have nothing
      waDebug("loadMessages:no-convo-ids", { contactId: reqId, cached: cached?.length ?? 0, fast: fastData?.length ?? 0 });
      if (!cached?.length && !fastData?.length) setMsgs([]);
      setMessagesLoading(false);
      return;
    }
    const data = await fetchMessagesFor(ids);
    if (selectedRef.current?.id !== reqId || messageLoadSeqRef.current !== seq) {
      waDebug("loadMessages:abort-stale", { reqId, currentId: selectedRef.current?.id, seq, currentSeq: messageLoadSeqRef.current });
      return;
    }
    const rows = data.slice(0, MESSAGE_PAGE_SIZE).reverse();
    waDebug("loadMessages:slowPath", { contactId: reqId, convoIds: ids.length, fetched: data.length, applied: rows.length });
    setHasOlder(data.length > MESSAGE_PAGE_SIZE);
    setMsgs((prev) => {
      const next = mergeThreadPagePreservingOlder(prev, rows);
      waDebug("loadMessages:slowPath:setMsgs", { contactId: reqId, prevCount: prev.length, nextCount: next.length });
      persistMsgCache(reqId, next);
      return next;
    });
    setMessagesLoading(false);
    hydrateSignedUrls(rows, reqId);
  }, [user, selected, hydrateSignedUrls, waDebug]);
  useEffect(() => {
    const cached = selected ? messagesCacheRef.current.get(selected.id) : undefined;
    waDebug("selection:effect", { contactId: selected?.id ?? null, cachedCount: cached?.length ?? 0 });
    setMsgs(cached ?? []);
    setHasOlder(false);
    setMessagesLoading(!!selected && !cached?.length);
    loadMessages();
  }, [loadMessages, selected, waDebug]);

  useEffect(() => { loadMessagesRef.current = () => { void loadMessages(); }; }, [loadMessages]);

  // Fallback: se a thread ficar vazia com um contato selecionado, tenta restaurar do cache
  // (memória → localStorage) e re-busca do servidor. Retry com backoff exponencial:
  // 400, 800, 1600, 3200, 6400ms (máx. 5 tentativas por seleção).
  const emptyRecoveryRef = useRef<{ contactId: string | null; attempts: number }>({ contactId: null, attempts: 0 });
  useEffect(() => {
    if (!selected) return;
    if (messagesLoading) return;
    if (msgs.length > 0) {
      if (emptyRecoveryRef.current.contactId !== selected.id || emptyRecoveryRef.current.attempts !== 0) {
        emptyRecoveryRef.current = { contactId: selected.id, attempts: 0 };
      }
      return;
    }
    if (emptyRecoveryRef.current.contactId !== selected.id) {
      emptyRecoveryRef.current = { contactId: selected.id, attempts: 0 };
    }
    const MAX_ATTEMPTS = 5;
    const attempt = emptyRecoveryRef.current.attempts;
    if (attempt >= MAX_ATTEMPTS) return;
    const delay = Math.min(400 * 2 ** attempt, 6400); // 400,800,1600,3200,6400
    const jitter = Math.floor(Math.random() * 150);
    const t = window.setTimeout(() => {
      if (selectedRef.current?.id !== selected.id) return;
      // 1) cache em memória
      let cached = messagesCacheRef.current.get(selected.id);
      // 2) cache persistido em localStorage
      if (!cached?.length && typeof window !== "undefined") {
        try {
          const obj = readScopedJson<Record<string, Msg[]>>("wa-msg-cache", user?.id, {});
          const fromDisk = obj[selected.id];
          if (Array.isArray(fromDisk) && fromDisk.length) {
            messagesCacheRef.current.set(selected.id, fromDisk);
            cached = fromDisk;
          }
        } catch { /* ignore */ }
      }
      emptyRecoveryRef.current = { contactId: selected.id, attempts: attempt + 1 };
      waDebug("emptyRecovery:trigger", {
        contactId: selected.id,
        cachedCount: cached?.length ?? 0,
        attempt: attempt + 1,
        delayMs: delay + jitter,
      });
      if (cached?.length) setMsgs(cached);
      void loadMessages();
    }, delay + jitter);
    return () => window.clearTimeout(t);
  }, [msgs.length, messagesLoading, selected, loadMessages, waDebug]);

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
        .eq("user_id", user.id)
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
    if (!convoId || !user) { toast.error("Sem conversa vinculada ainda."); return; }
    const { data: row } = await supabase.from("conversations").select("metadata").eq("id", convoId).eq("user_id", user.id).maybeSingle();
    const meta = (row?.metadata ?? {}) as Record<string, unknown>;
    // Regra: quando o operador desliga a IA no chat, ela fica REALMENTE
    // desligada (flag booleana persistente) e só volta se ele reativar.
    const next = agentPaused
      ? { ...meta, agent_disabled: false, agent_paused_until: null }
      : { ...meta, agent_disabled: true, agent_paused_until: null };
    const { error } = await supabase.from("conversations").update({ metadata: next } as never).eq("id", convoId).eq("user_id", user.id);
    if (error) { toast.error("Não foi possível alterar a IA."); return; }
    setAgentPaused(!agentPaused);
    toast.success(agentPaused ? "IA ativada nesta conversa" : "IA desativada nesta conversa");
  }, [convoId, agentPaused, user]);

  // Realtime refresh on new messages
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("messages-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` }, async (payload) => {
        const row = payload.new as (Msg & { conversation_id?: string }) | null;
        if (!row) return;
        if (row.direction === "inbound") playBell();
        // Bump unread badge for any inbound message that isn't for the currently open conversation.
        if (row.direction === "inbound") {
          const remote = (row.metadata as { remoteJid?: string } | null)?.remoteJid ?? "";
          const digits = remote.replace(/\D+/g, "");
          const match = contactsRef.current.find((c) => c.phone.replace(/\D+/g, "") === digits);
          if (match && selectedRef.current?.id !== match.id) {
            setUnreadMap((prev) => ({ ...prev, [match.id]: (prev[match.id] ?? 0) + 1 }));
          }
        }
        // Try to append immediately if the message belongs to the currently open thread.
        const openContact = selectedRef.current;
        if (openContact) {
          const phone = openContact.phone.replace(/\D+/g, "");
          const jids = new Set([jidFromPhone(openContact.phone), ...jidVariants(openContact.phone)]);
          const remote = (row.metadata as { remoteJid?: string } | null)?.remoteJid ?? "";
          const remoteDigits = remote.split("@")[0]?.split(":")[0]?.replace(/\D+/g, "") ?? "";
          const phoneAlts = new Set(phoneVariants(openContact.phone));
          const convIds = new Set(conversationIdsRef.current);
          const belongs =
            jids.has(remote) ||
            (!!phone && remote.startsWith(`${phone}@`)) ||
            (!!remoteDigits && phoneAlts.has(remoteDigits)) ||
            (!!row.conversation_id && convIds.has(row.conversation_id));
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
                persistMsgCache(selectedRef.current?.id ?? openContact.id, copy);
                return copy;
              }
              const next = [...prev, withReceipt];
              persistMsgCache(selectedRef.current?.id ?? openContact.id, next);
              return next;
            });
            window.setTimeout(() => loadMessagesRef.current?.(), 600);
            return;
          }
        }
        // Not for the open thread — do NOT reload the current view (avoids flicker/disappearing).
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` }, (payload) => {
        // Patch the single row in place so tick status updates without reloading the whole thread
          const row = payload.new as { id?: string; type?: string | null; content?: string | null; media_url?: string | null; metadata?: Record<string, unknown> | null } | null;
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
          const contentChanged = typeof row.content === "string" && row.content !== prev[idx].content;
          copy[idx] = {
            ...prev[idx],
            ...(contentChanged ? { content: row.content as string } : {}),
            ...(row.type ? { type: row.type } : {}),
            ...(row.media_url !== undefined ? { media_url: row.media_url } : {}),
            metadata: nextMeta,
          };
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
        loadContactsRef.current?.();
      })
      // Conversations UPDATE (unread counters etc.) must NOT reload the open thread — it caused messages to blink/disappear.
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // IMPORTANT: keep deps to [user] only. Re-subscribing on every `selected`
    // change (via loadMessages) tore down the channel and dropped INSERTs that
    // arrived during the gap — causing sent messages/audios to "disappear".
  }, [user]);

  // Safety net: if the browser misses a realtime event while the tab/network hiccups,
  // reconcile the open thread from the database without clearing the current view.
  useEffect(() => {
    if (!user || !selected) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadMessagesRef.current?.();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [user, selected?.id]);

  // Scroll to bottom when the thread changes or a new message is appended,
  // not on every metadata patch (status ticks). Prevents jitter/disappearing effect.
  const msgsCountRef = useRef(0);
  const lastContactRef = useRef<string | null>(null);
  const settledForContactRef = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependScrollRef.current) {
      prependScrollRef.current = false;
      msgsCountRef.current = msgs.length;
      return;
    }
    const contactChanged = lastContactRef.current !== (selected?.id ?? null);
    if (contactChanged) {
      lastContactRef.current = selected?.id ?? null;
      msgsCountRef.current = msgs.length;
      settledForContactRef.current = null;
    }
    // Until we've jumped to the bottom with real content for this contact,
    // force-anchor to the latest message on every msgs update (cache → server load → image layout).
    const contactId = selected?.id ?? null;
    if (contactId && settledForContactRef.current !== contactId) {
      const jump = () => { const c = scrollRef.current; if (c) c.scrollTop = c.scrollHeight; };
      jump();
      requestAnimationFrame(jump);
      const t1 = setTimeout(jump, 120);
      const t2 = setTimeout(jump, 400);
      const t3 = setTimeout(jump, 900);
      const t4 = setTimeout(jump, 1800);
      if (msgs.length > 0) settledForContactRef.current = contactId;
      msgsCountRef.current = msgs.length;
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    }
    const prev = msgsCountRef.current;
    msgsCountRef.current = msgs.length;
    if (msgs.length === prev) return;
    const elNow = scrollRef.current;
    const isLoadingOlderMessages = msgs.length > prev && elNow && elNow.scrollTop < 160;
    if (isLoadingOlderMessages) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
    if (!selected || !attachment) return;
    const file = attachment.file;
    const url = attachment.url;
    const caption = text.trim() || undefined;
    const quotedMessageId = replyTo?.id;
    const quotedSnapshot = replyTo ? { quotedId: replyTo.id, quotedText: (replyTo.content ?? "").slice(0, 200), quotedType: replyTo.type, quotedDirection: replyTo.direction } : undefined;
    // Free the composer immediately — the upload continues in the background.
    setText("");
    setAttachment(null);
    setReplyTo(null);
    sendOneFile(file, caption, { objectUrl: url, quotedMessageId, quotedSnapshot });
  }

  function fileKind(file: File): "image" | "video" | "audio" | "pdf" | "file" {
    const t = file.type;
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("audio/")) return "audio";
    if (t === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
    return "file";
  }

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  async function sendOneFile(
    file: File,
    caption?: string,
    opts?: { objectUrl?: string; quotedMessageId?: string; quotedSnapshot?: Record<string, unknown> },
  ) {
    if (!selected) return;
    const kind = fileKind(file);
    // Envio: padrão WhatsApp (16 MB por mídia). Recebimento aceita até 2 GB.
    const MAX = 16 * 1024 * 1024;
    const maxLabel = "16 MB";
    const url = opts?.objectUrl ?? URL.createObjectURL(file);
    const qid = `up-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setUploadQueue((q) => [...q, { id: qid, name: file.name, size: file.size, url, kind, status: "uploading" }]);
    if (file.size > MAX) {
      const err = `Máx. ${maxLabel} (este tem ${(file.size / 1024 / 1024).toFixed(1)} MB)`;
      setUploadQueue((q) => q.map((x) => (x.id === qid ? { ...x, status: "failed", error: err } : x)));
      toast.error(`${file.name}: arquivo muito grande. ${err}`);
      return;
    }
    const mime = file.type || "application/octet-stream";
    const optimisticType = kind === "pdf" || kind === "file" ? "document" : kind;
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const contactId = selected.id;
    setMsgs((prev) => [...prev, {
      id: tmpId,
      direction: "outbound",
      type: optimisticType,
      content: caption || file.name,
      media_url: url,
      created_at: new Date().toISOString(),
      metadata: { pending: true, fileName: file.name, ...(opts?.quotedSnapshot ?? {}) },
    }]);
    try {
      const b64 = await blobToBase64(file);
      const res = await sendMedia({ data: { contactId, base64: b64, mime, fileName: file.name, caption, quotedMessageId: opts?.quotedMessageId } });
      if (res && "ok" in res && res.ok === false) {
        setMsgs((prev) => prev.map((m) => (m.id === tmpId ? { ...m, metadata: { ...(m.metadata ?? {}), pending: false, failed: true } } : m)));
        setUploadQueue((q) => q.map((x) => (x.id === qid ? { ...x, status: "failed", error: res.error } : x)));
        toast.error(`${file.name}: ${res.error}`);
        return;
      }
      const serverMsg = (res as { message?: Msg | null } | null)?.message;
      if (serverMsg) mergeMessageIntoThread({ ...serverMsg, media_url: serverMsg.media_url || url }, tmpId, contactId);
      setUploadQueue((q) => q.map((x) => (x.id === qid ? { ...x, status: "done" } : x)));
      window.setTimeout(() => setUploadQueue((q) => q.filter((x) => x.id !== qid)), 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao enviar";
      setMsgs((prev) => prev.map((m) => (m.id === tmpId ? { ...m, metadata: { ...(m.metadata ?? {}), pending: false, failed: true } } : m)));
      setUploadQueue((q) => q.map((x) => (x.id === qid ? { ...x, status: "failed", error: msg } : x)));
      toast.error(`${file.name}: ${msg}`);
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
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Seu navegador não suporta gravação de áudio.");
        return;
      }
      // Chame getUserMedia PRIMEIRO (dentro do gesto do usuário) — qualquer
      // await antes quebra a cadeia de gesto no Chrome/Safari.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pushPresence({ data: { contactId: selected.id, presence: "recording" } }).catch(() => {});
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
            const serverMsg = (res as { message?: Msg | null } | null)?.message;
            if (serverMsg) mergeMessageIntoThread({ ...serverMsg, media_url: serverMsg.media_url || localUrl }, tmpId, selected.id);
            window.setTimeout(() => loadMessagesRef.current?.(), 1200);
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
      const err = e as { name?: string; message?: string } | undefined;
      const inIframe = typeof window !== "undefined" && window.self !== window.top;
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        toast.error(
          inIframe
            ? "Microfone bloqueado no preview. Abra o app em uma nova aba para gravar áudio."
            : "Permissão de microfone negada. Habilite nas configurações do navegador."
        );
      } else if (err?.name === "NotFoundError") {
        toast.error("Nenhum microfone encontrado.");
      } else if (err?.name === "NotReadableError") {
        toast.error("Microfone em uso por outro aplicativo.");
      } else {
        toast.error(`Não foi possível acessar o microfone${err?.message ? `: ${err.message}` : ""}`);
      }
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
    }, 3000);
    return () => clearInterval(i);
  }, [recording, selected, pushPresence]);

  return (
    <div className="-m-3 sm:-m-6 h-[calc(100vh-3rem)]">
      <TooltipProvider delayDuration={200}>
      <div
        className={`grid grid-cols-1 gap-0 overflow-hidden h-full transition-all duration-300 ${
          sidebarCollapsed
            ? (infoOpen ? "lg:grid-cols-[64px_1fr_320px]" : "lg:grid-cols-[64px_1fr]")
            : (infoOpen ? "lg:grid-cols-[340px_1fr_300px] xl:grid-cols-[360px_1fr_320px]" : "lg:grid-cols-[300px_1fr] xl:grid-cols-[360px_1fr]")
        }`}
      >
        {/* Contacts */}
        <aside
          className={`${selected ? "hidden lg:flex" : "flex animate-in fade-in slide-in-from-left-4 duration-200"} flex-col border-r transition-all duration-300 overflow-hidden`}
          style={{ backgroundColor: theme.sidebarBg, borderColor: theme.border }}
        >
          <div className="px-3 py-3 flex items-center gap-2" style={{ background: theme.headerDark, color: "white" }}>
            <Popover onOpenChange={(o) => {
              if (o) {
                const inst = instances.find((i) => i.id === activeInstance);
                setProfileNameEdit(inst?.name ?? "");
              }
            }}>
              <PopoverTrigger asChild>
                <button
                  className="h-10 w-10 rounded-full grid place-items-center bg-white/20 font-semibold shrink-0 overflow-hidden hover:ring-2 hover:ring-ring transition"
                  aria-label="Perfil da instância"
                  title="Perfil da instância"
                >
                  {activeInstance !== "all" && instanceProfilePic[activeInstance] ? (
                    <img src={instanceProfilePic[activeInstance]!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span>{(instances.find((i) => i.id === activeInstance)?.name ?? user?.email ?? "U").slice(0, 1).toUpperCase()}</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="bottom" className="w-72 p-0 overflow-hidden">
                {activeInstance === "all" ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Selecione uma instância para editar o perfil do WhatsApp.
                  </div>
                ) : (() => {
                  const inst = instances.find((i) => i.id === activeInstance);
                  if (!inst) return null;
                  const pic = instanceProfilePic[inst.id];
                  return (
                    <div>
                      <div className="p-4 flex flex-col items-center gap-2 bg-gradient-to-br from-primary/10 to-transparent">
                        <div className="relative">
                          <div className="h-20 w-20 rounded-full overflow-hidden bg-muted grid place-items-center text-2xl font-semibold text-primary ring-2 ring-primary/30">
                            {pic ? <img src={pic} alt="" className="h-full w-full object-cover" /> : <span>{(inst.name || "?").slice(0, 1).toUpperCase()}</span>}
                          </div>
                          <button
                            type="button"
                            onClick={() => profilePicInputRef.current?.click()}
                            disabled={profileUploading}
                            className="absolute -bottom-1 -right-1 h-8 w-8 grid place-items-center rounded-full bg-primary text-primary-foreground shadow-md hover:opacity-90 disabled:opacity-60"
                            aria-label="Trocar foto"
                          >
                            {profileUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                          </button>
                          <input
                            ref={profilePicInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!file || !user) return;
                              setProfileUploading(true);
                              try {
                                const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
                                const path = `${user.id}/connections/${inst.id}/profile-${Date.now()}.${ext}`;
                                const up = await supabase.storage.from("agent-media").upload(path, file, { upsert: true, contentType: file.type });
                                if (up.error) throw up.error;
                                const signed = await supabase.storage.from("agent-media").createSignedUrl(path, 60 * 60 * 24 * 365);
                                if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("URL");
                                const url = signed.data.signedUrl;
                                const upd = await supabase.from("connections").update({ profile_picture: url }).eq("id", inst.id).eq("user_id", user.id);
                                if (upd.error) throw upd.error;
                                setInstanceProfilePic((prev) => ({ ...prev, [inst.id]: url }));
                                setInstances((prev) => prev.map((i) => i.id === inst.id ? { ...i, profile_picture: url } : i));
                                toast.success("Foto atualizada");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Falha ao enviar foto");
                              } finally {
                                setProfileUploading(false);
                              }
                            }}
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground">{inst.instance_name}</div>
                      </div>
                      <div className="p-3 space-y-3">
                        <div>
                          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Nome</label>
                          <div className="mt-1 flex gap-1.5">
                            <Input
                              value={profileNameEdit}
                              onChange={(e) => setProfileNameEdit(e.target.value)}
                              className="h-8 text-sm"
                              placeholder="Nome da instância"
                            />
                            <Button
                              size="sm"
                              disabled={profileNameSaving || !profileNameEdit.trim() || profileNameEdit === inst.name}
                              onClick={async () => {
                                if (!user) return;
                                setProfileNameSaving(true);
                                try {
                                  const newName = profileNameEdit.trim();
                                  const { error } = await supabase.from("connections").update({ name: newName }).eq("id", inst.id).eq("user_id", user.id);
                                  if (error) throw error;
                                  setInstances((prev) => prev.map((i) => i.id === inst.id ? { ...i, name: newName } : i));
                                  toast.success("Nome atualizado");
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Falha ao salvar");
                                } finally {
                                  setProfileNameSaving(false);
                                }
                              }}
                            >
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Número conectado</div>
                          <div className="mt-1 text-sm font-mono">{inst.phone_number || "—"}</div>
                        </div>
                        {inst.profile_name && (
                          <div>
                            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Perfil WhatsApp</div>
                            <div className="mt-1 text-sm">{inst.profile_name}</div>
                          </div>
                        )}
                        <div className="pt-2 border-t border-border/60 flex flex-col gap-1">
                          <Link to="/connections" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                            <Plug className="h-4 w-4" /> Gerenciar conexões
                          </Link>
                          <Link to="/settings" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                            <Settings className="h-4 w-4" /> Configurações do chat
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </PopoverContent>
            </Popover>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-foreground/70">Conversas</div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="mt-0.5 flex items-center gap-1 max-w-full text-sm font-semibold truncate rounded hover:bg-muted/60 px-1 -mx-1 py-0.5">
                      <span className="truncate">
                        {activeInstance === "all"
                          ? "Todas as instâncias"
                          : (instances.find((i) => i.id === activeInstance)?.name
                              ?? instances.find((i) => i.id === activeInstance)?.instance_name
                              ?? "Instância")}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-80 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuItem onClick={() => setActiveInstance("all")}>
                      <span className="flex-1">Todas as instâncias</span>
                      {activeInstance === "all" && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                    {instances.length > 0 && <DropdownMenuSeparator />}
                    {instances.map((i) => (
                      <DropdownMenuItem key={i.id} onClick={() => setActiveInstance(i.id)}>
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{i.name || i.instance_name}</div>
                          {i.profile_name && <div className="text-[10px] text-muted-foreground truncate">{i.profile_name}</div>}
                        </div>
                        {activeInstance === i.id && <Check className="h-4 w-4" />}
                      </DropdownMenuItem>
                    ))}
                    {!instances.length && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma instância cadastrada</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSidebarCollapsed((v) => !v)}
                  className="hidden md:grid h-8 w-8 place-items-center rounded-full text-foreground/90 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
                  aria-label={sidebarCollapsed ? "Expandir" : "Recolher"}
                >
                  {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{sidebarCollapsed ? "Expandir lista" : "Recolher lista"}</TooltipContent>
            </Tooltip>
          </div>
          {!sidebarCollapsed && <div className="p-2" style={{ backgroundColor: theme.sidebarSub }}>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar ou começar uma nova conversa"
                className="pl-9 border-transparent rounded-full h-9 text-sm placeholder:text-muted-foreground" style={{ backgroundColor: theme.inputBg, color: theme.textMain }}
              />
            </div>
          </div>}
          {!sidebarCollapsed && (
            <div className="px-2 pb-2 pt-1 flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ backgroundColor: theme.sidebarSub }}>
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
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "border hover:bg-white/10"
                    }`}
                  >
                    <span>{t.label}</span>
                    {t.count != null && t.count > 0 && (
                      <span className={`text-[9px] leading-none px-1 py-0.5 rounded-full ${active ? "bg-emerald-600 text-foreground" : "bg-white/10 text-foreground"}`}>{t.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex-1 overflow-y-auto" style={{ backgroundColor: theme.sidebarBg }}>
            {filtered.map((c) => {
              const active = selected?.id === c.id;
              const isFav = favorites.has(c.id);
              const isArch = archived.has(c.id);
              const isPin = pinned.has(c.id);
              const label = labels[c.id];
              return (
                <div
                  key={c.id}
                  className={`group w-full flex items-center gap-3 px-3 py-3 border-b transition hover:bg-white/5 ${active ? "bg-white/10" : ""} ${sidebarCollapsed ? "justify-center" : ""}`} style={{ borderColor: theme.border }}
                  title={sidebarCollapsed ? (c.name || c.phone) : undefined}
                >
                  <button onClick={() => setSelected(c)} className="flex items-center gap-3 flex-1 min-w-0 text-left focus:outline-none">
                    {avatars[c.id] ? (
                      <img src={avatars[c.id]!} alt="" className="h-12 w-12 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded-full grid place-items-center text-sm font-semibold text-foreground shrink-0" style={{ background: theme.headerTeal }}>
                        {initials(c.name, c.phone)}
                      </div>
                    )}
                    {!sidebarCollapsed && (
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-medium truncate flex-1" style={{ color: theme.textMain }}>{c.name || c.phone}</div>
                          {isPin && <Pin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          {isFav && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />}
                          {isArch && <Archive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          {label && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: label }} />}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs truncate flex-1" style={{ color: theme.textMuted }}>
                            {lastPreviewMap[c.id]?.text
                              ? (
                                <>
                                  {lastPreviewMap[c.id].direction === "out" && <span className="mr-1" style={{ color: theme.textSecondary }}>Você:</span>}
                                  {lastPreviewMap[c.id].text}
                                </>
                              )
                              : c.phone}
                          </div>
                          {(unreadMap[c.id] ?? 0) > 0 && (
                            <span
                              className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold text-foreground grid place-items-center"
                              style={{ background: theme.headerTeal }}
                              aria-label={`${unreadMap[c.id]} mensagens não lidas`}
                            >
                              {unreadMap[c.id] > 99 ? "99+" : unreadMap[c.id]}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                  {!sidebarCollapsed && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition" aria-label="Opções">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="right" align="start" className="w-48 p-1">
                        <button
                          onClick={() => setPinned((prev) => {
                            const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                            writeScopedJson("wa-pin", user?.id, [...n]);
                            return n;
                          })}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 text-sm"
                        >
                          {isPin ? <PinOff className="h-4 w-4 text-emerald-600" /> : <Pin className="h-4 w-4 text-emerald-600" />}
                          <span>{isPin ? "Desafixar" : "Fixar"}</span>
                        </button>
                        <button
                          onClick={() => setFavorites((prev) => {
                            const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                            writeScopedJson("wa-fav", user?.id, [...n]);
                            return n;
                          })}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 text-sm"
                        >
                          <Star className={`h-4 w-4 ${isFav ? "fill-amber-400 text-amber-400" : "text-amber-500"}`} />
                          <span>{isFav ? "Remover favorito" : "Favoritar"}</span>
                        </button>
                        <button
                          onClick={() => setArchived((prev) => {
                            const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                            writeScopedJson("wa-arch", user?.id, [...n]);
                            return n;
                          })}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 text-sm"
                        >
                          {isArch ? <ArchiveRestore className="h-4 w-4 text-muted-foreground" /> : <Archive className="h-4 w-4 text-muted-foreground" />}
                          <span>{isArch ? "Desarquivar" : "Arquivar"}</span>
                        </button>
                        <div className="px-3 pt-2 pb-1 flex items-center gap-2 text-xs text-muted-foreground border-t mt-1">
                          <Tag className="h-3.5 w-3.5" /> Etiqueta
                        </div>
                        <div className="px-2 pb-2 flex flex-wrap gap-1.5">
                          {["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899"].map((color) => (
                            <button
                              key={color}
                              onClick={() => setLabels((prev) => {
                                const n = { ...prev };
                                if (n[c.id] === color) delete n[c.id]; else n[c.id] = color;
                                writeScopedJson("wa-labels", user?.id, n);
                                return n;
                              })}
                              className={`h-5 w-5 rounded-full border-2 transition ${label === color ? "border-foreground scale-110" : "border-transparent shadow"}`}
                              style={{ background: color }}
                              aria-label={`Etiqueta ${color}`}
                            />
                          ))}
                          {label && (
                            <button
                              onClick={() => setLabels((prev) => {
                                const n = { ...prev }; delete n[c.id];
                                writeScopedJson("wa-labels", user?.id, n);
                                return n;
                              })}
                              className="h-5 w-5 rounded-full border grid place-items-center text-muted-foreground hover:bg-white/10"
                              aria-label="Remover etiqueta"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <div className="border-t mt-1 pt-1">
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Excluir o contato "${c.name || c.phone}"? As mensagens e conversas relacionadas também serão removidas.`)) return;
                              try {
                                const phone = c.phone.replace(/\D+/g, "");
                                const { data: convs } = await supabase.from("conversations").select("id").eq("user_id", user!.id).or(`remote_jid.ilike.%${phone}%,contact_id.eq.${c.id}`);
                                const convIds = (convs || []).map((r) => r.id);
                                if (convIds.length) {
                                  await supabase.from("messages").delete().eq("user_id", user!.id).in("conversation_id", convIds);
                                  await supabase.from("conversations").delete().eq("user_id", user!.id).in("id", convIds);
                                }
                                const { error } = await supabase.from("contacts").delete().eq("id", c.id).eq("user_id", user!.id);
                                if (error) throw error;
                                setContacts((prev) => prev.filter((x) => x.id !== c.id));
                                if (selected?.id === c.id) setSelected(null);
                                toast.success("Contato excluído");
                              } catch (e) {
                                toast.error("Não foi possível excluir", { description: e instanceof Error ? e.message : String(e) });
                              }
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-red-500/10 text-sm text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Excluir contato</span>
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              );
            })}
            {!filtered.length && !sidebarCollapsed && <div className="p-6 text-center text-xs text-muted-foreground">Nenhum contato</div>}
          </div>
        </aside>

        {/* Chat area */}
        <section
          onDragEnter={(e) => {
            if (!selected) return;
            if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
            e.preventDefault();
            dragDepthRef.current += 1;
            setDragActive(true);
          }}
          onDragOver={(e) => {
            if (!selected) return;
            if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            if (!selected) return;
            if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setDragActive(false);
          }}
          onDrop={(e) => {
            if (!selected) return;
            if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
            e.preventDefault();
            dragDepthRef.current = 0;
            setDragActive(false);
            const files = Array.from(e.dataTransfer.files || []);
            if (!files.length) return;
            const cap = text.trim();
            if (cap) setText("");
            files.forEach((f, i) => sendOneFile(f, i === 0 ? cap || undefined : undefined));
          }}
          className={`${selected ? "flex animate-in fade-in slide-in-from-right-4 duration-200" : "hidden lg:flex"} flex-col min-w-0 min-h-0 overflow-hidden h-full relative`}
          style={{ background: theme.chatBg }}
        >
          {dragActive && (
            <div className="pointer-events-none absolute inset-0 z-40 p-4 flex items-center justify-center transition-opacity duration-200">
              <div className="w-full h-full rounded-2xl border-4 border-dashed border-blue-500 bg-blue-500/10 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 text-blue-700">
                <Paperclip className="h-14 w-14" />
                <div className="text-xl font-semibold">Solte para enviar</div>
                <div className="text-sm opacity-80">Imagens, áudio, PDF e documentos até 15 MB · vídeos até 60 MB</div>
              </div>
            </div>
          )}
          {!selected ? (
            <div className="flex-1 grid place-items-center text-center px-6" style={{ backgroundColor: theme.emptyBg }}>
              <div>
                <div className="mx-auto h-40 w-40 rounded-full grid place-items-center mb-6" style={{ background: theme.headerTeal }}>
                  <MessageCircle className="h-20 w-20 text-foreground" />
                </div>
                <h2 className="text-2xl font-light" style={{ color: theme.textMain }}>Agent IA — Mensagens</h2>
                <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: theme.textMuted }}>Selecione uma conversa para começar a enviar mensagens, áudios e figurinhas.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="px-4 py-2.5 flex items-center gap-3 text-foreground shadow-sm" style={{ background: theme.headerTeal }}>
                <button className="lg:hidden p-1 -ml-1 active:bg-white/20 rounded-full text-foreground" onClick={() => setSelected(null)}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSidebarCollapsed((v) => !v)}
                      className="hidden lg:grid h-9 w-9 -ml-1 place-items-center rounded-full bg-white/15 hover:bg-muted text-foreground transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <div className="h-10 w-10 rounded-full grid place-items-center text-xs font-semibold text-foreground shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                    {initials(selected.name, selected.phone)}
                  </div>
                )}
                <button onClick={() => setInfoOpen((v) => !v)} className="min-w-0 flex-1 text-left focus:outline-none">
                  <div className="text-sm font-semibold truncate">{selected.name || selected.phone}</div>
                  <div className="relative h-4 text-[11px] text-foreground/80">
                    <span
                      className={`absolute inset-0 truncate transition-opacity duration-300 ease-in-out ${remotePresence ? "opacity-0" : "opacity-100"}`}
                    >
                      {selected.phone}
                    </span>
                    <span
                      className={`absolute inset-0 flex items-center gap-1.5 italic transition-opacity duration-300 ease-in-out ${remotePresence === "composing" ? "opacity-100" : "opacity-0"}`}
                      aria-hidden={remotePresence !== "composing"}
                    >
                      Digitando
                      <span className="inline-flex gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-white/90 animate-bounce [animation-delay:-0.3s]" />
                        <span className="h-1 w-1 rounded-full bg-white/90 animate-bounce [animation-delay:-0.15s]" />
                        <span className="h-1 w-1 rounded-full bg-white/90 animate-bounce" />
                      </span>
                    </span>
                    <span
                      className={`absolute inset-0 flex items-center gap-1.5 italic transition-opacity duration-300 ease-in-out ${remotePresence === "recording" ? "opacity-100" : "opacity-0"}`}
                      aria-hidden={remotePresence !== "recording"}
                    >
                      Gravando áudio
                      <Mic className="h-3 w-3 text-red-300 animate-pulse" />
                    </span>
                  </div>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setInfoOpen((v) => !v)} className={`p-2 rounded-full hover:bg-muted transition ${infoOpen ? "bg-white/15" : ""}`} aria-label="Dados do contato">
                      <Info className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Dados do contato</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={async () => {
                        try {
                          if (navigator.mediaDevices?.getUserMedia) {
                            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                            stream.getTracks().forEach((t) => t.stop());
                          }
                          cameraInputRef.current?.click();
                        } catch (err) {
                          const name = (err as { name?: string })?.name ?? "";
                          if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
                            toast.error("Acesso à câmera bloqueado", { description: "Libere o acesso à câmera nas permissões do navegador e recarregue a página.", duration: 8000 });
                          } else if (name === "NotFoundError" || name === "OverconstrainedError") {
                            toast.error("Nenhuma câmera encontrada neste dispositivo.");
                          } else {
                            cameraInputRef.current?.click();
                          }
                        }
                      }}
                      className="p-2 rounded-full hover:bg-muted transition"
                      aria-label="Gravar vídeo"
                    >
                      <Video className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Gravar vídeo pela câmera</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setSoundOn((v) => !v); if (!soundOn) playBell(); }}
                      className="p-2 rounded-full hover:bg-muted transition"
                      aria-label={soundOn ? "Desligar som" : "Ligar som"}
                    >
                      {soundOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{soundOn ? "Desligar som de notificação" : "Ligar som de notificação"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setChatDarkMode((v) => !v)}
                      className="p-2 rounded-full hover:bg-muted transition"
                      aria-label={chatDarkMode ? "Modo claro" : "Modo escuro"}
                    >
                      {chatDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{chatDarkMode ? "Modo claro" : "Modo escuro"}</TooltipContent>
                </Tooltip>
              </header>

              <div
                ref={scrollRef}
                onScroll={(e) => {
                  if (e.currentTarget.scrollTop < 80) void loadOlderMessages();
                }}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5"
                style={{
                  backgroundColor: theme.chatBg,
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
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-sm hover:bg-white/20 disabled:opacity-70" style={{ backgroundColor: chatDarkMode ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.9)", color: theme.textMain }}
                    >
                      {olderLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3 rotate-180" />}
                      Mensagens antigas
                    </button>
                  </div>
                )}
                {messagesLoading && !msgs.length && (
                  <div className="text-center text-xs py-12" style={{ color: theme.textMuted }}>
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm" style={{ backgroundColor: chatDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)", color: theme.textMain }}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando mensagens…
                    </span>
                  </div>
                )}
                {dedupedMsgs.map((m) => {
                  const out = m.direction === "outbound";
                  const isAudio = m.type === "audio" || (m.metadata as { audio?: boolean } | null)?.audio;
                  const isSticker = m.type === "sticker";
                  const isImage = m.type === "image" && !!m.media_url;
                  const isVideo = m.type === "video" && !!m.media_url;
                  const isFile = (m.type === "file" || m.type === "document") && !!m.media_url;
                  const linkUrl = !isAudio && !isSticker && !isImage && !isVideo && !isFile ? extractFirstUrl(m.content ?? "") : null;
                  return (
                    <div key={m.id} data-msg-id={m.id} className={`group flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`relative max-w-[75%] rounded-lg shadow-sm text-sm ${linkUrl ? "px-1 py-1" : "px-2.5 py-1.5"} ${(m.metadata as { reaction?: string } | null)?.reaction ? "mb-3" : ""}`}
                        style={{ color: theme.textMain, background: out ? theme.outBubble : theme.inBubble }}
                      >
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              className={`absolute -top-3 ${out ? "right-8" : "left-1"} p-1 rounded-full shadow opacity-0 group-hover:opacity-100 hover:bg-white/10 transition`} style={{ backgroundColor: theme.popoverBg, borderColor: theme.border, borderWidth: 1 }}
                              aria-label="Reagir"
                            >
                              <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align={out ? "end" : "start"} side="top" className="p-1 w-auto rounded-full">
                            <div className="flex items-center gap-0.5">
                              {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((e) => (
                                <button
                                  key={e}
                                  onClick={() => performReact(m, e)}
                                  className={`h-9 w-9 grid place-items-center text-xl rounded-full hover:bg-white/10 transition ${((m.metadata as { reaction?: string } | null)?.reaction === e) ? "bg-white/10" : ""}`}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="absolute top-0.5 right-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-background/10 transition"
                              aria-label="Opções da mensagem"
                            >
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={out ? "end" : "start"} className="w-48">
                            <div className="flex items-center justify-around px-1 py-1">
                              {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((e) => (
                                <button
                                  key={e}
                                  onClick={() => performReact(m, e)}
                                  className={`h-8 w-8 grid place-items-center text-lg rounded-full hover:bg-white/10 transition ${((m.metadata as { reaction?: string } | null)?.reaction === e) ? "bg-white/10" : ""}`}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                            <DropdownMenuSeparator />
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
                              <div className="mb-1 w-full rounded border-l-4 border-muted-foreground bg-background/5 px-2 py-1 text-xs italic" style={{ color: theme.textMuted }}>
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
                              className="mb-1 w-full text-left rounded border-l-4 border-emerald-500 bg-background/5 px-2 py-1 text-xs hover:bg-background/10 transition" style={{ color: theme.textMuted }}
                            >
                              <div className="font-medium text-emerald-700 text-[11px]">Resposta</div>
                              <div className="truncate">{label}</div>
                            </button>
                          );
                        })()}
                        {isAudio ? (
                          m.media_url
                            ? (
                               <AudioPlayer
                                 src={m.media_url}
                                 id={m.id}
                                 avatarUrl={
                                   m.direction === "outbound"
                                     ? (
                                         (activeInstance !== "all" && instanceProfilePic[activeInstance])
                                         || Object.values(instanceProfilePic).find((v) => !!v)
                                         || null
                                       )
                                     : (avatars[selected.id] ?? null)
                                 }
                                 direction={m.direction as "inbound" | "outbound"}
                                 onDownload={() => downloadFile(m.media_url!, `audio-${m.id}.ogg`)}
                                 dark={chatDarkMode}
                               />
                            )
                            : <MediaMissing kind="audio" onRetry={() => loadMessagesRef.current?.()} />
                        ) : isSticker ? (
                          m.media_url ? (
                            <div className="relative pr-7">
                              <button
                                onClick={() => !(m.metadata as { pending?: boolean } | null)?.pending && setLightbox({ type: "image", src: m.media_url! })}
                                className="block focus:outline-none"
                              >
                                <img
                                  src={m.media_url!}
                                  alt={m.content ?? "Figurinha"}
                                  className={`max-h-36 max-w-36 object-contain ${(m.metadata as { pending?: boolean } | null)?.pending ? "opacity-70" : "cursor-zoom-in"}`}
                                />
                              </button>
                              {(m.metadata as { pending?: boolean } | null)?.pending ? (
                                <div className="absolute inset-0 grid place-items-center rounded-md bg-background/10">
                                  <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                                </div>
                              ) : (
                                <DownloadBtn url={m.media_url!} filename={`figurinha-${m.id}.webp`} dark={chatDarkMode} />
                              )}
                            </div>
                          ) : <MediaMissing kind="sticker" onRetry={() => loadMessagesRef.current?.()} />
                        ) : isImage ? (
                          <div className="relative">
                             <button onClick={() => !(m.metadata as { pending?: boolean } | null)?.pending && setLightbox({ type: "image", src: m.media_url! })} className="block focus:outline-none">
                               <img
                                 src={m.media_url!}
                                 alt={m.content ?? ""}
                                 loading="lazy"
                                 decoding="async"
                                 className={`rounded-md max-h-64 object-cover ${(m.metadata as { pending?: boolean } | null)?.pending ? "opacity-70" : "cursor-zoom-in"}`}
                                 onError={(e) => {
                                   const el = e.currentTarget;
                                   if (el.dataset.retried) return;
                                   el.dataset.retried = "1";
                                   const path = storagePathFrom(m);
                                   if (!path) return;
                                   supabase.storage.from("agent-media").createSignedUrl(path, 60 * 60 * 24).then(({ data }) => {
                                     if (data?.signedUrl) { signedUrlCacheRef.current.set(path, data.signedUrl); el.src = data.signedUrl; }
                                   });
                                 }}
                               />
                             </button>
                            {(m.metadata as { pending?: boolean } | null)?.pending ? (
                              <div className="absolute inset-0 grid place-items-center rounded-md bg-background/25">
                                <Loader2 className="h-8 w-8 text-foreground animate-spin drop-shadow" />
                              </div>
                            ) : (
                              <DownloadBtn url={m.media_url!} filename={`image-${m.id}.jpg`} dark={chatDarkMode} />
                            )}
                          </div>
                        ) : isVideo ? (
                          <div className="relative">
                            <button onClick={() => !(m.metadata as { pending?: boolean } | null)?.pending && setLightbox({ type: "video", src: m.media_url! })} className="block focus:outline-none">
                              <video
                                src={`${m.media_url!}${m.media_url!.includes("#") ? "" : "#t=0.1"}`}
                                className={`rounded-md max-h-64 bg-background pointer-events-none ${(m.metadata as { pending?: boolean } | null)?.pending ? "opacity-70" : "cursor-zoom-in"}`}
                                preload="metadata"
                                muted
                                playsInline
                              />
                            </button>
                            {(m.metadata as { pending?: boolean } | null)?.pending ? (
                              <div className="absolute inset-0 grid place-items-center rounded-md bg-background/35">
                                <Loader2 className="h-8 w-8 text-foreground animate-spin drop-shadow" />
                              </div>
                            ) : (
                              <DownloadBtn url={m.media_url!} filename={`video-${m.id}.mp4`} dark={chatDarkMode} />
                            )}
                          </div>
                        ) : isFile ? (() => {
                          const meta = (m.metadata ?? {}) as { pending?: boolean; fileName?: string; fileSize?: number; mimeType?: string; mime?: string };
                          const name = meta.fileName || (m.content ?? "") || `arquivo-${m.id}`;
                          const ext = (name.split(".").pop() || "").toLowerCase();
                          const isPdf = ext === "pdf" || meta.mimeType === "application/pdf" || meta.mime === "application/pdf";
                          const sizeLabel = typeof meta.fileSize === "number"
                            ? (meta.fileSize < 1024 * 1024
                                ? `${(meta.fileSize / 1024).toFixed(0)} KB`
                                : `${(meta.fileSize / 1024 / 1024).toFixed(1)} MB`)
                            : null;
                          const badge = ext ? ext.slice(0, 4).toUpperCase() : "FILE";
                          const pending = !!meta.pending;
                          return (
                            <a
                              href={pending ? undefined : m.media_url!}
                              target="_blank"
                              rel="noreferrer"
                              onClick={pending ? (e) => e.preventDefault() : undefined}
                              className={`group/file flex items-center gap-3 min-w-[240px] max-w-[300px] rounded-xl border px-2.5 py-2 shadow-sm hover:bg-white/10 transition ${pending ? "cursor-default" : "cursor-pointer"}`} style={{ backgroundColor: chatDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.7)", borderColor: theme.border }}
                            >
                              <div className={`relative h-12 w-10 shrink-0 rounded-md grid place-items-end justify-items-center overflow-hidden ${isPdf ? "bg-gradient-to-b from-red-500 to-red-600" : "bg-gradient-to-b from-sky-500 to-sky-600"}`}>
                                <div className="absolute top-0 right-0 h-3 w-3 bg-white/30" style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }} />
                                {pending ? (
                                  <Loader2 className="absolute inset-0 m-auto h-5 w-5 text-foreground animate-spin" />
                                ) : (
                                  <FileText className="absolute top-1.5 left-1/2 -translate-x-1/2 h-4 w-4 text-foreground/90" />
                                )}
                                <span className="mb-0.5 text-[8px] font-bold tracking-wide text-foreground leading-none">{badge}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium" title={name} style={{ color: theme.textMain }}>{name}</div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: theme.textMuted }}>
                                  {sizeLabel && <span className="tabular-nums">{sizeLabel}</span>}
                                  {sizeLabel && <span aria-hidden>·</span>}
                                  <span className="uppercase">{isPdf ? "PDF" : (ext || "arquivo")}</span>
                                </div>
                              </div>
                              {!pending && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); downloadFile(m.media_url!, name); }}
                                  title="Baixar"
                                  className="ml-1 grid place-items-center h-8 w-8 rounded-full bg-background/5 hover:bg-background/10 text-muted-foreground shrink-0"
                                  aria-label="Baixar arquivo"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                              )}
                            </a>
                          );
                        })() : (() => {
                          const url = linkUrl;
                          return (
                            <div className={url ? "w-[260px] max-w-full" : "pr-14"}>
                              {url && <LinkPreview url={url} />}
                              <div className="whitespace-pre-wrap break-words">{m.content}</div>
                            </div>
                          );
                        })()}
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px]" style={{ color: theme.textSecondary }}>
                          {starred.has(m.id) && <Star className="h-3 w-3 fill-yellow-400 text-yellow-500" />}
                          {(m.metadata as { edited?: boolean } | null)?.edited && (
                            <span className="italic">editada</span>
                          )}
                          {out && (() => {
                            const meta = (m.metadata ?? {}) as { flow_id?: string; source?: string; agent_id?: string };
                            if (meta.flow_id || meta.source === "flow") {
                              return (
                                <span title="Enviado pelo Fluxo" className="inline-flex text-emerald-600">
                                  <Workflow className="h-3 w-3" />
                                </span>
                              );
                            }
                            if (meta.agent_id) {
                              return (
                                <span title="Resposta da IA" className="inline-flex text-violet-600">
                                  <Bot className="h-3 w-3" />
                                </span>
                              );
                            }
                            return null;
                          })()}
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
                              s === "read" ? theme.read :
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
                        {(m.metadata as { reaction?: string } | null)?.reaction && (
                          <button
                            onClick={() => performReact(m, (m.metadata as { reaction?: string }).reaction!)}
                            className={`absolute -bottom-3 ${out ? "right-2" : "left-2"} rounded-full shadow px-1.5 py-0.5 text-sm leading-none hover:scale-110 transition`} style={{ backgroundColor: theme.popoverBg, borderColor: theme.border, borderWidth: 1 }}
                            title="Remover reação"
                          >
                            {(m.metadata as { reaction?: string }).reaction}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!msgs.length && !messagesLoading && (
                  <div className="text-center text-xs py-12" style={{ color: theme.textMuted }}>
                    <span className="inline-block px-3 py-1 rounded-full shadow-sm" style={{ backgroundColor: chatDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.7)", color: theme.textMain }}>Nenhuma mensagem ainda — diga olá!</span>
                  </div>
                )}
              </div>

              {/* Upload progress is shown inline on the message bubble (WhatsApp-style),
                  so we intentionally do not render a separate upload queue bar here. */}
              <div className="px-3 py-2 flex items-end gap-2" style={{ background: "#F0F2F5" }}>
                {recording ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" onClick={cancelRecording} variant="ghost" className="rounded-full h-11 w-11 text-red-500 hover:bg-red-500/10" aria-label="Cancelar gravação">
                          <X className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Cancelar</TooltipContent>
                    </Tooltip>
                    <div className="flex-1 flex items-center gap-3 px-4 py-2 rounded-full shadow-sm" style={{ backgroundColor: theme.inputBg }}>
                      <Mic className="h-4 w-4 text-red-500 animate-pulse shrink-0" />
                      <div className="flex-1 flex items-center gap-[2px] h-6">
                        {recLevels.map((lv, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-sm transition-[height] duration-75"
                            style={{ height: `${Math.round(lv * 100)}%`, background: theme.accent, minHeight: 3 }}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-mono tabular-nums shrink-0" style={{ color: theme.textMuted }}>
                        {Math.floor(recTime / 60)}:{String(recTime % 60).padStart(2, "0")}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="p-2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-full transition" aria-label="Emojis">
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
                          className={`p-2 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${agentPaused ? "text-muted-foreground hover:text-foreground" : "text-emerald-600 hover:text-emerald-700"}`}
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
                          className="p-2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-full transition"
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
                    <QuickSendPopover contactId={selected?.id ?? null} />
                    <FlowLauncher contactId={selected?.id ?? null} />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) sendOneFile(f);
                        e.target.value = "";
                      }}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="video/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) sendOneFile(f);
                        e.target.value = "";
                      }}
                    />
                    <div className="flex-1 flex flex-col gap-1">
                       {replyTo && (
                         <div className="flex items-stretch gap-2 rounded-lg px-2 py-1.5 shadow-sm text-sm" style={{ backgroundColor: theme.inputBg }}>
                           <div className="w-1 rounded bg-emerald-500" />
                           <div className="min-w-0 flex-1">
                             <div className="text-[11px] font-medium text-emerald-700">
                               Respondendo {replyTo.direction === "outbound" ? "você" : (selected?.name || selected?.phone || "contato")}
                             </div>
                             <div className="truncate" style={{ color: theme.textMuted }}>
                               {replyTo.type === "audio" ? "🎤 Mensagem de voz"
                                 : replyTo.type === "image" ? "🖼️ Imagem"
                                 : replyTo.type === "video" ? "🎬 Vídeo"
                                 : replyTo.type === "document" ? "📄 Arquivo"
                                 : (replyTo.content || "")}
                             </div>
                           </div>
                           <button onClick={() => setReplyTo(null)} className="p-1 rounded-full hover:bg-white/10 text-muted-foreground" aria-label="Cancelar resposta">
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
                         <div className="flex items-center gap-2 rounded-lg px-3 py-2 shadow-sm text-sm" style={{ backgroundColor: theme.inputBg }}>
                           {isImg ? (
                             <img src={attachment.url} alt="" className="h-12 w-12 object-cover rounded" />
                           ) : isVid ? (
                             <video src={attachment.url} className="h-12 w-12 object-cover rounded bg-background" muted />
                           ) : isAud ? (
                             <div className="h-12 w-12 rounded grid place-items-center bg-orange-100 text-orange-600"><Music className="h-6 w-6" /></div>
                           ) : isPdf ? (
                             <div className="h-12 w-12 rounded grid place-items-center bg-red-100 text-red-600"><FileText className="h-6 w-6" /></div>
                           ) : (
                             <div className="h-12 w-12 rounded grid place-items-center bg-sky-100 text-sky-600"><FileIcon className="h-6 w-6" /></div>
                           )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate" style={{ color: theme.textMain }}>{attachment.file.name}</div>
                            <div className="text-[11px]" style={{ color: theme.textMuted }}>{Math.round(attachment.file.size / 1024)} KB</div>
                          </div>
                          <button
                            onClick={() => { URL.revokeObjectURL(attachment.url); setAttachment(null); }}
                            className="p-1 rounded-full hover:bg-white/10 text-muted-foreground"
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
                      className="w-full resize-none rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40 max-h-32 shadow-sm placeholder:text-muted-foreground" style={{ backgroundColor: theme.inputBg, color: theme.textMain }}
                      />
                    </div>
                  </>
                )}
                {recording ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" onClick={stopRecording} className="rounded-full h-11 w-11 text-foreground hover:opacity-90" style={{ background: "#DC2626" }}>
                        <Square className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Parar gravação</TooltipContent>
                  </Tooltip>
                ) : text.trim() || attachment ? (
                  <Button size="icon" onClick={() => { if (attachment) handleSendAttachment(); else if (text.trim()) handleSendText(); }} className="rounded-full h-11 w-11 text-foreground hover:opacity-90" style={{ background: theme.accent }}>
                    <Send className="h-5 w-5" />
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" onClick={startRecording} className="rounded-full h-11 w-11 text-foreground hover:opacity-90" style={{ background: theme.headerTeal }}>
                        <Mic className="h-5 w-5" />
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
          <aside className="hidden xl:flex flex-col w-80 border-l overflow-y-auto" style={{ backgroundColor: theme.sidebarBg, borderColor: theme.border }}>
            <div className="px-4 py-3 flex items-center gap-2 text-foreground" style={{ background: theme.headerDark }}>
              <button onClick={() => setInfoOpen(false)} className="p-1 rounded-full hover:bg-muted" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
              <div className="text-sm font-semibold">Dados do contato</div>
            </div>
            <div className="flex flex-col items-center py-6 border-b" style={{ borderColor: theme.border }}>
              {avatars[selected.id] ? (
                <button onClick={() => setLightbox({ type: "image", src: avatars[selected.id]! })}>
                  <img src={avatars[selected.id]!} alt="" className="h-32 w-32 rounded-full object-cover shadow" />
                </button>
              ) : (
                <div className="h-32 w-32 rounded-full grid place-items-center text-3xl font-semibold text-foreground shadow" style={{ background: theme.headerTeal }}>
                  {initials(selected.name, selected.phone)}
                </div>
              )}
              <div className="mt-3 text-lg font-medium" style={{ color: theme.textMain }}>{selected.name || selected.phone}</div>
              <div className="text-xs" style={{ color: theme.textMuted }}>{selected.phone}</div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs font-medium" style={{ color: theme.textMuted }}>Nome</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome do contato" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: theme.textMuted }}>Telefone</label>
                <Input value={selected.phone} readOnly disabled className="mt-1 cursor-not-allowed opacity-70" />
              </div>
              <Button onClick={saveContact} disabled={savingContact || editName.trim() === (selected.name ?? "").trim()} className="w-full text-foreground hover:opacity-90" style={{ background: theme.accent }}>
                {savingContact ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </div>
          </aside>
        )}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-background/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-muted/60 hover:bg-muted text-foreground"
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
      <Dialog open={!!forwardMsg} onOpenChange={(o) => { if (!o && !forwardSending) closeForward(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encaminhar mensagem</DialogTitle>
          </DialogHeader>
          <Input placeholder="Buscar contato..." value={forwardSearch} onChange={(e) => setForwardSearch(e.target.value)} />
          <div className="text-xs text-muted-foreground -mt-1">
            {forwardSelectedCount}/{FORWARD_LIMIT} selecionado{forwardSelectedCount === 1 ? "" : "s"}
          </div>
          <div className="max-h-80 overflow-y-auto -mx-2">
            {contacts
              .filter((c) => {
                const q = forwardSearch.toLowerCase();
                if (!q) return true;
                return (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q);
              })
              .slice(0, 50)
              .map((c) => {
                const checked = !!forwardSelected[c.id];
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleForwardTarget(c)}
                    className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-muted rounded text-left ${checked ? "bg-muted" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    {avatars[c.id] ? (
                      <img src={avatars[c.id]!} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-xs font-semibold shrink-0">
                        {initials(c.name, c.phone)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{c.name || c.phone}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.phone}</div>
                    </div>
                  </button>
                );
              })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeForward} disabled={forwardSending}>Cancelar</Button>
            <Button onClick={doForward} disabled={forwardSending || forwardSelectedCount === 0}>
              {forwardSending ? "Enviando..." : `Encaminhar${forwardSelectedCount ? ` (${forwardSelectedCount})` : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir mensagem?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Escolha como deseja excluir esta mensagem.</p>
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
      <Dialog open={!!editMsg} onOpenChange={(o) => { if (!o && !editSaving) setEditMsg(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar mensagem</DialogTitle>
          </DialogHeader>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            autoFocus
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); performEdit(); }
            }}
          />
          <p className="text-xs text-muted-foreground">O WhatsApp permite editar apenas mensagens enviadas nos últimos 15 minutos.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEditMsg(null)} disabled={editSaving}>Cancelar</Button>
            <Button onClick={performEdit} disabled={editSaving || !editText.trim()}>
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
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

function MediaMissing({ kind, onRetry }: { kind: "audio" | "sticker"; onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onRetry(); }}
      className="flex items-center gap-2 rounded-lg bg-background/5 px-2.5 py-2 text-muted-foreground hover:bg-background/10 transition"
      title="Tentar carregar mídia"
    >
      {kind === "audio" ? <Mic className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
      <span>{kind === "audio" ? "Mensagem de voz" : "Figurinha"}</span>
      <RefreshCw className="h-3.5 w-3.5" />
    </button>
  );
}

let activeAudioElement: HTMLAudioElement | null = null;

function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;!?]+$/, "") : null;
}

const linkPreviewCache = new Map<string, { title?: string; description?: string; image?: string; publisher?: string; url: string } | null>();

function LinkPreview({ url, dark = false }: { url: string; dark?: boolean }) {
  const theme = chatTheme(dark);
  const [data, setData] = useState<{ title?: string; description?: string; image?: string; publisher?: string; url: string } | null | undefined>(
    () => linkPreviewCache.get(url),
  );
  useEffect(() => {
    if (linkPreviewCache.has(url)) { setData(linkPreviewCache.get(url)); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
        const json = (await res.json()) as { status?: string; data?: { title?: string; description?: string; image?: { url?: string }; publisher?: string; url?: string } };
        if (json.status !== "success" || !json.data) { linkPreviewCache.set(url, null); if (!cancelled) setData(null); return; }
        const p = { title: json.data.title, description: json.data.description, image: json.data.image?.url, publisher: json.data.publisher, url: json.data.url ?? url };
        linkPreviewCache.set(url, p);
        if (!cancelled) setData(p);
      } catch { linkPreviewCache.set(url, null); if (!cancelled) setData(null); }
    })();
    return () => { cancelled = true; };
  }, [url]);
  if (data === undefined) {
    return <div className="mb-1 rounded-md bg-background/5 h-16 animate-pulse" />;
  }
  if (data === null) return null;
  let domain = "";
  try { domain = new URL(data.url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
  return (
    <a href={data.url} target="_blank" rel="noreferrer" className="mb-1 block w-full max-w-[260px] rounded-lg overflow-hidden bg-background/5 hover:bg-background/10 transition">
      {data.image && (
        <img src={data.image} alt="" className="w-full max-h-[260px] object-cover bg-background" loading="lazy" />
      )}
      <div className="px-2.5 py-1.5">
        {data.title && <div className="text-[13px] font-medium line-clamp-2 leading-snug" style={{ color: theme.textMain }}>{data.title}</div>}
        {domain && <div className="mt-0.5 text-[11px] truncate" style={{ color: theme.textSecondary }}>{domain}</div>}
      </div>
    </a>
  );
}

function AudioPlayer({
  src,
  id,
  avatarUrl,
  direction,
  onDownload,
  dark,
}: {
  src: string;
  id: string;
  avatarUrl?: string | null;
  direction?: "inbound" | "outbound";
  onDownload?: () => void;
  dark?: boolean;
}) {
  const theme = chatTheme(dark ?? false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onMeta = () => setDur(a.duration || 0);
    const onEnd = () => { setPlaying(false); if (activeAudioElement === a) activeAudioElement = null; };
    const onPause = () => setPlaying(false);
    const onCanPlay = () => { setLoading(false); setFailed(false); setDur(a.duration || 0); };
    const onError = () => { setLoading(false); setFailed(true); setPlaying(false); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("pause", onPause);
    a.addEventListener("canplay", onCanPlay);
    a.addEventListener("error", onError);
    return () => {
      if (activeAudioElement === a) activeAudioElement = null;
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("error", onError);
    };
  }, [src]);

  useEffect(() => {
    setPlaying(false);
    setLoading(false);
    setFailed(false);
    setCur(0);
    setDur(0);
  }, [src]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (activeAudioElement && activeAudioElement !== a) activeAudioElement.pause();
    activeAudioElement = a;
    setLoading(true);
    setFailed(false);
    a.playbackRate = rate;
    a.play()
      .then(() => { setPlaying(true); setLoading(false); })
      .catch(() => { setPlaying(false); setLoading(false); setFailed(true); });
  }

  function cycleRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  // Deterministic pseudo-random waveform based on id so bars are stable across renders
  const bars = useMemo(() => {
    const n = 34;
    let seed = 0;
    for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const h = 0.25 + ((seed % 1000) / 1000) * 0.75; // 0.25 .. 1.0
      out.push(h);
    }
    return out;
  }, [id]);

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = p * dur;
    setCur(a.currentTime);
  }

  const isOutbound = direction === "outbound";

  return (
    <div className="flex items-center gap-2.5 min-w-[260px] py-1 pr-1">
      <button
        onClick={toggle}
        className="h-8 w-8 grid place-items-center rounded-full text-muted-foreground shrink-0 hover:bg-background/5"
        aria-label={playing ? "Pausar áudio" : "Tocar áudio"}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div
          onClick={seek}
          className="relative h-7 flex items-center gap-[2px] cursor-pointer select-none"
        >
          {bars.map((h, i) => {
            const barPct = ((i + 0.5) / bars.length) * 100;
            const played = barPct <= pct;
            return (
              <div
                key={i}
                className="w-[2.5px] rounded-full"
                style={{
                  height: `${Math.round(h * 22)}px`,
                  background: played ? "#54656f" : "#9aa3a8",
                  opacity: played ? 1 : 0.55,
                }}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground">
            {failed ? "toque para tentar novamente" : fmtTime(playing || cur > 0 ? cur : dur)}
          </span>
          <button
            onClick={cycleRate}
            className="text-[10px] font-semibold text-muted-foreground hover:text-foreground px-1 rounded"
            aria-label="Velocidade de reprodução"
            title="Velocidade"
          >
            {rate}x
          </button>
          {onDownload && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDownload(); }}
              title="Baixar áudio"
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="relative shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className="h-11 w-11 rounded-full grid place-items-center text-foreground text-xs font-semibold" style={{ background: theme.headerTeal }}>
            {isOutbound ? "EU" : "?"}
          </div>
        )}
        <div
          className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full grid place-items-center ring-2 ring-white"
          style={{ background: theme.accent }}
        >
          <Mic className="h-2.5 w-2.5 text-foreground" />
        </div>
      </div>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" data-audio-id={id} />
    </div>
  );
}

function FlowLauncher({ contactId }: { contactId: string | null }) {
  const { user } = useAuth();
  const startFlow = useServerFn(startFlowForContact);
  const [open, setOpen] = useState(false);
  const [flows, setFlows] = useState<Array<{ id: string; name: string; is_active: boolean | null; trigger_keywords: string[] | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [kwDraft, setKwDraft] = useState<Record<string, string>>({});

  async function openDialog() {
    if (!contactId || !user) return;
    setOpen(true);
    setLoading(true);
    const { data } = await supabase
      .from("flows")
      .select("id,name,is_active,trigger_keywords")
      .eq("user_id", user.id)
      .order("name");
    setFlows((data ?? []) as typeof flows);
    setLoading(false);
  }

  async function toggleActive(f: { id: string; is_active: boolean | null }) {
    if (!user) return;
    const next = !f.is_active;
    setFlows((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_active: next } : x)));
    const { error } = await supabase.from("flows").update({ is_active: next }).eq("id", f.id).eq("user_id", user.id);
    if (error) {
      toast.error("Falha ao atualizar status");
      setFlows((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_active: !next } : x)));
    } else {
      toast.success(next ? "Fluxo ativado" : "Fluxo desativado");
    }
  }

  async function saveKeywords(id: string) {
    if (!user) return;
    const raw = kwDraft[id] ?? "";
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    setSavingId(id);
    const { error } = await supabase.from("flows").update({ trigger_keywords: list }).eq("id", id).eq("user_id", user.id);
    setSavingId(null);
    if (error) {
      toast.error("Falha ao salvar palavras-chave");
      return;
    }
    setFlows((prev) => prev.map((x) => (x.id === id ? { ...x, trigger_keywords: list } : x)));
    setKwDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    toast.success("Palavras-chave salvas");
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={openDialog}
            disabled={!contactId}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-full transition"
            aria-label="Iniciar fluxo"
          >
            <Workflow className="h-6 w-6" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Iniciar fluxo</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden border-0 bg-gradient-to-br from-card via-background to-black text-foreground">
          <div className="p-5 border-b border-border bg-gradient-to-r from-emerald-500/10 to-transparent">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 grid place-items-center ring-1 ring-emerald-400/30">
                  <Workflow className="h-4 w-4 text-emerald-400" />
                </div>
                Fluxos disponíveis
              </DialogTitle>
              <p className="text-xs text-foreground/60 mt-1">Ative, defina palavras-chave e inicie um fluxo para este contato.</p>
            </DialogHeader>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
            {loading && <div className="p-6 text-center text-xs text-foreground/60">Carregando...</div>}
            {!loading && flows.map((f) => {
              const kws = f.trigger_keywords ?? [];
              const draftValue = kwDraft[f.id];
              const editing = draftValue !== undefined;
              return (
                <div
                  key={f.id}
                  className="rounded-xl border border-border bg-white/[0.03] hover:bg-white/[0.05] transition p-4 space-y-3 shadow-lg shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold truncate">{f.name}</div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 h-4 border ${f.is_active ? "border-emerald-400/40 text-emerald-300 bg-emerald-500/10" : "border-border text-foreground/50"}`}
                        >
                          {f.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-foreground/50 mt-0.5">
                        {kws.length ? `Dispara com: ${kws.join(", ")}` : "Sem palavras-chave configuradas"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={!!f.is_active} onCheckedChange={() => toggleActive(f)} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Palavras-chave separadas por vírgula (ex: oi, olá, começar)"
                      value={editing ? draftValue : kws.join(", ")}
                      onChange={(e) => setKwDraft((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      className="h-8 bg-muted/40 border-border text-foreground placeholder:text-foreground/30 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!editing || savingId === f.id}
                      onClick={() => saveKeywords(f.id)}
                      className="h-8 border-white/15 bg-muted/40 text-foreground hover:bg-muted/60"
                    >
                      {savingId === f.id ? "..." : "Salvar"}
                    </Button>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!contactId || startingId === f.id}
                      onClick={async () => {
                        if (!contactId) return;
                        setStartingId(f.id);
                        try {
                          await startFlow({ data: { contactId, flowId: f.id } });
                          toast.success("Fluxo iniciado");
                          setOpen(false);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Falha ao iniciar fluxo");
                        } finally {
                          setStartingId(null);
                        }
                      }}
                      className="bg-emerald-500 hover:bg-emerald-400 text-black font-medium"
                    >
                      {startingId === f.id ? "Iniciando..." : "Iniciar agora"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {!loading && !flows.length && <div className="p-6 text-center text-xs text-foreground/60">Nenhum fluxo cadastrado</div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}