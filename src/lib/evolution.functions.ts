import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";

const MEDIA_BUCKET = "agent-media";

const IdInput = z.object({ connectionId: z.string().uuid() });

async function loadConnection(supabase: any, userId: string, id: string) {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

function missingConnectionResult() {
  return {
    ok: false,
    status: "offline" as const,
    state: "missing" as const,
    missing: true,
    message: "Conexão não encontrada",
    raw: null,
  };
}

function baseUrl(url: string) {
  let u = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

function mediaMessageType(mime: string) {
  return mime.startsWith("image/") ? "image"
    : mime.startsWith("video/") ? "video"
    : mime.startsWith("audio/") ? "audio" : "document";
}

function normalizeEvoStatus(value: unknown): "sent" | "delivered" | "read" | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = Number(value);
    return n >= 4 ? "read" : n === 3 ? "delivered" : n >= 1 ? "sent" : null;
  }
  const s = String(value).toUpperCase();
  if (s === "READ" || s === "PLAYED") return "read";
  if (s === "DELIVERY_ACK" || s === "DELIVERED") return "delivered";
  if (s === "SERVER_ACK" || s === "SENT" || s === "PENDING") return "sent";
  return null;
}

function findEvoId(value: unknown, depth = 0): string | null {
  if (!value || depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEvoId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = record.id ?? record.messageId ?? record.keyId;
  if (typeof direct === "string" && /^[A-Z0-9._-]{8,}$/i.test(direct)) return direct;
  const key = record.key as Record<string, unknown> | undefined;
  if (typeof key?.id === "string" && /^[A-Z0-9._-]{8,}$/i.test(key.id)) return key.id;
  for (const nested of [record.response, record.data, record.message, record.result]) {
    const found = findEvoId(nested, depth + 1);
    if (found) return found;
  }
  return null;
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

function jidVariants(remoteJid: string) {
  const suffix = remoteJid.includes("@") ? remoteJid.slice(remoteJid.indexOf("@")) : "@s.whatsapp.net";
  return phoneVariants(remoteJid.split("@")[0] ?? remoteJid).map((phone) => `${phone}${suffix}`);
}

async function saveMediaToStorage(
  supabase: any,
  userId: string,
  conversationId: string,
  base64: string,
  mime: string,
  fileName: string,
) {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  const rawExt = fileName.includes(".") ? fileName.split(".").pop() : mime.split("/")[1]?.split(";")[0];
  const ext = rawExt?.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 12);
  const path = `${userId}/${conversationId}/${Date.now()}-${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const bytes = Uint8Array.from(atob(clean), (char) => char.charCodeAt(0));
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: mime || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
  return { path, url: data?.signedUrl ?? null };
}

async function evoFetch(url: string, apiKey: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: apiKey, ...(init?.headers || {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

async function loadEvolutionCommandKey(supabase: any, fallback: string) {
  const { data: setting } = await supabase
    .from("settings").select("value").eq("key", "evolution_api").maybeSingle();
  try {
    const cfg = typeof setting?.value === "string" ? JSON.parse(setting.value) : setting?.value;
    return cfg?.api_key || fallback;
  } catch {
    return fallback;
  }
}

export const testConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase
      .from("connections").select("*")
      .eq("id", data.connectionId).eq("user_id", context.userId).maybeSingle();
    if (!c) return { ok: false, status: "offline" as const, state: "missing", missing: true, raw: null };
    const apiKey = await loadEvolutionCommandKey(context.supabase, c.api_key);
    const r = await evoFetch(`${baseUrl(c.url_api)}/instance/connectionState/${c.instance_name}`, apiKey);
    const preservedStatus =
      c.status === "online" || c.status === "connecting" ? c.status : "offline";
    if (!r.ok) {
      return {
        ok: false,
        status: preservedStatus as "online" | "connecting" | "offline",
        state: "unreachable",
        raw: r.json,
        message: parseEvoError(r.json, r.status),
      };
    }
    const state = r.json?.instance?.state ?? r.json?.state ?? (r.ok ? "unknown" : "error");
    const status = state === "open" ? "online" : state === "connecting" ? "connecting" : "offline";
    await context.supabase.from("connections").update({ status, last_sync: new Date().toISOString() }).eq("id", c.id).eq("user_id", context.userId);
    return { ok: r.ok, status, state, raw: r.json };
  });

export const connectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
    if (!c) return { ...missingConnectionResult(), qr: null, pairingCode: null };
    const apiKey = await loadEvolutionCommandKey(context.supabase, c.api_key);
    const r = await evoFetch(`${baseUrl(c.url_api)}/instance/connect/${c.instance_name}`, apiKey);
    const j = r.json ?? {};
    const qr =
      j.base64 ||
      j.qrcode?.base64 ||
      j.qrcode?.code ||
      j.qr?.base64 ||
      j.qr ||
      j.code ||
      null;
    await context.supabase.from("connections").update({ status: "connecting", last_sync: new Date().toISOString() }).eq("id", c.id).eq("user_id", context.userId);
    return { ok: r.ok, qr, pairingCode: j.pairingCode ?? null, raw: r.json };
  });

export const disconnectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
    if (!c) return missingConnectionResult();
    const apiKey = await loadEvolutionCommandKey(context.supabase, c.api_key);
    const r = await evoFetch(`${baseUrl(c.url_api)}/instance/logout/${c.instance_name}`, apiKey, { method: "DELETE" });
    await context.supabase.from("connections").update({ status: "offline", last_sync: new Date().toISOString() }).eq("id", c.id).eq("user_id", context.userId);
    return { ok: r.ok, raw: r.json };
  });

const SendTestInput = z.object({
  connectionId: z.string().uuid(),
  number: z.string().min(8).optional(),
  text: z.string().min(1).max(500).optional(),
});

export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SendTestInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
    if (!c) return missingConnectionResult();
    const raw = (data.number ?? c.phone_number ?? "").toString().replace(/\D+/g, "");
    if (!raw) throw new Error("Informe um número de destino (a instância ainda não tem número conectado).");
    const text = data.text ?? "oi";
    const apiKey = await loadEvolutionCommandKey(context.supabase, c.api_key);
    const r = await evoFetch(`${baseUrl(c.url_api)}/message/sendText/${c.instance_name}`, apiKey, {
      method: "POST",
      body: JSON.stringify({ number: raw, text, delay: 500 }),
    });
    if (!r.ok) {
      const pick = (v: any): string => {
        if (v == null) return "";
        if (typeof v === "string") return v;
        if (Array.isArray(v)) return v.map(pick).filter(Boolean).join(" | ");
        if (typeof v === "object") return v.message || v.error || v.exception || JSON.stringify(v);
        return String(v);
      };
      const msg =
        pick(r.json?.response?.message) ||
        pick(r.json?.message) ||
        pick(r.json?.error) ||
        JSON.stringify(r.json ?? {}).slice(0, 500);
      throw new Error(`Evolution ${r.status}: ${msg}`);
    }
    return { ok: true, to: raw, text, raw: r.json };
  });

export const deleteInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
    if (!c) return { ok: true, missing: true };
    // Best-effort: logout then delete on Evolution before dropping the local row
    const apiKey = await loadEvolutionCommandKey(context.supabase, c.api_key);
    try { await evoFetch(`${baseUrl(c.url_api)}/instance/logout/${c.instance_name}`, apiKey, { method: "DELETE" }); } catch { /* ignore */ }
    try { await evoFetch(`${baseUrl(c.url_api)}/instance/delete/${c.instance_name}`, apiKey, { method: "DELETE" }); } catch { /* ignore */ }
    const { error } = await context.supabase.from("connections").delete().eq("id", c.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
    if (!c) return { ...missingConnectionResult(), url: null, response: null };
    // Build the same public webhook URL used at instance creation
    const { data: setting } = await context.supabase
      .from("settings").select("value").eq("key", "evolution_api").maybeSingle();
    let cfg: { webhook_base_url?: string } = {};
    try { cfg = typeof setting?.value === "string" ? JSON.parse(setting.value) : (setting?.value ?? {}); } catch { /* ignore */ }
    const base = (cfg.webhook_base_url || "").replace(/\/+$/, "");
    if (!base) throw new Error("Configure a URL base do webhook em Configurações → Evolution API.");
    const url = `${base}/api/public/evolution/${c.instance_name}`;
    const payload = { event: "test.webhook", data: { at: new Date().toISOString(), by: context.userId } };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: c.api_key },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, url, response: json };
  });

const CreateInput = z.object({
  name: z.string().min(1),
  instanceName: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, "Use apenas letras, números, _ e -"),
  webhookBaseUrl: z.string().url().optional(),
});

export const createAndConnectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateInput.parse(i))
  .handler(async ({ data, context }) => {
    // Load global Evolution config from settings (admin-owned; read with service role so clients can use it)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: setting } = await supabaseAdmin
      .from("settings").select("value").eq("key", "evolution_api").maybeSingle();
    if (!setting?.value) throw new Error("A plataforma ainda não está pronta para gerar instâncias. Tente novamente em instantes.");
    let cfg: { url_api?: string; api_key?: string; webhook_base_url?: string } = {};
    try { cfg = typeof setting.value === "string" ? JSON.parse(setting.value as any) : (setting.value as any); } catch { throw new Error("Configuração interna inválida. Contate o suporte."); }
    if (!cfg.url_api || !cfg.api_key) throw new Error("A plataforma ainda não está pronta para gerar instâncias. Tente novamente em instantes.");

    const platformInstanceName = `${context.userId.slice(0, 8)}_${data.instanceName}`;
    const { data: existingConnection } = await context.supabase
      .from("connections")
      .select("id")
      .eq("user_id", context.userId)
      .eq("instance_name", platformInstanceName)
      .maybeSingle();
    if (existingConnection) throw new Error("Já existe uma conexão com este nome nesta conta.");

    let webhookBase = cfg.webhook_base_url || data.webhookBaseUrl;
    if (!webhookBase) {
      try {
        const host = getRequestHost({ xForwardedHost: true });
        if (host) webhookBase = `https://${host}`;
      } catch { /* ignore */ }
    }
    const webhookSecret = process.env.FOLLOWUP_TRIGGER_SECRET ?? "";
    const webhookUrl = webhookBase ? `${webhookBase.replace(/\/+$/, "")}/api/public/evolution/${platformInstanceName}${webhookSecret ? `?token=${encodeURIComponent(webhookSecret)}` : ""}` : undefined;

    // Insert local connection row
    const { data: conn, error: insErr } = await context.supabase.from("connections").insert({
      user_id: context.userId,
      name: data.name,
      instance_name: platformInstanceName,
      provider: "evolution",
      url_api: cfg.url_api,
      api_key: cfg.api_key,
      status: "connecting",
    }).select("*").single();
    if (insErr || !conn) throw new Error(insErr?.message ?? "Falha ao salvar conexão");

    // Create on Evolution
    const createRes = await evoFetch(`${baseUrl(cfg.url_api)}/instance/create`, cfg.api_key, {
      method: "POST",
      body: JSON.stringify({
        instanceName: platformInstanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        ...(webhookUrl ? {
          webhook: {
            url: webhookUrl,
            byEvents: false,
            webhookByEvents: false,
            webhook_by_events: false,
            base64: false,
            webhookBase64: false,
            webhook_base64: false,
            events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED", "PRESENCE_UPDATE"],
          },
        } : {}),
      }),
    });

    if (!createRes.ok) {
      // rollback
      await context.supabase.from("connections").delete().eq("id", conn.id).eq("user_id", context.userId);
      throw new Error(createRes.json?.response?.message?.[0] ?? createRes.json?.message ?? "Falha ao criar instância na Evolution API");
    }

    const cj = createRes.json ?? {};
    // Evolution returns a per-instance token in `hash.apikey` (or `hash`).
    // That is the key it sends in the `apikey` header of every webhook —
    // store it so our webhook signature check accepts inbound events.
    const instanceApiKey: string =
      cj.hash?.apikey || cj.hash?.apiKey || (typeof cj.hash === "string" ? cj.hash : "") || cfg.api_key;
    if (instanceApiKey && instanceApiKey !== cfg.api_key) {
      await context.supabase.from("connections").update({ api_key: instanceApiKey }).eq("id", conn.id).eq("user_id", context.userId);
    }
    const qr =
      cj.qrcode?.base64 ||
      cj.base64 ||
      cj.qrcode?.code ||
      cj.qr?.base64 ||
      cj.qr ||
      cj.code ||
      null;

    // Register local webhook record for tracking
    if (webhookUrl) {
      await context.supabase.from("webhooks").insert({
        user_id: context.userId,
        name: `WhatsApp · ${data.name}`,
        url: webhookUrl,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "PRESENCE_UPDATE"],
        is_active: true,
      });
    }

    return { connectionId: conn.id, qr, webhookUrl, raw: createRes.json };
  });

// ============================================================
// Chat send helpers (used by /messages WhatsApp-like page)
// ============================================================

async function pickActiveConnection(supabase: any, userId: string) {
  const { data: conns } = await supabase
    .from("connections")
    .select("*")
    .eq("user_id", userId)
    .order("status", { ascending: true })
    .order("last_sync", { ascending: false, nullsFirst: false })
    .limit(10);
  if (!conns?.length) throw new Error("Nenhuma conexão WhatsApp encontrada.");
  return conns.find((c: any) => c.status === "online") ?? conns[0];
}

async function pickConnectionForContact(supabase: any, userId: string, phone: string) {
  const digits = String(phone).replace(/\D+/g, "");
  const variants = new Set([
    ...jidVariants(`${digits}@s.whatsapp.net`),
    ...phoneVariants(digits).flatMap((p) => [`${p}@s.whatsapp.net`, `${p}@lid`]),
  ]);
  const { data: convs } = await supabase
    .from("conversations")
    .select("connection_id,metadata,last_message_at")
    .eq("user_id", userId)
    .not("connection_id", "is", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(500);
  const match = (convs ?? []).find((c: any) => variants.has(c?.metadata?.remoteJid ?? ""));
  if (match?.connection_id) {
    const { data: conn } = await supabase
      .from("connections")
      .select("*")
      .eq("id", match.connection_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (conn?.status === "online") return conn;
  }
  return pickActiveConnection(supabase, userId);
}

function assertOnlineConnection(conn: any) {
  if (conn?.status !== "online") {
    throw new Error("Conexão WhatsApp offline. Reconecte o WhatsApp antes de enviar mensagens.");
  }
}

type SerializableJson = string | number | boolean | null | SerializableJson[] | { [key: string]: SerializableJson };

function serializable(value: unknown): SerializableJson {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === "object") {
    const out: { [key: string]: SerializableJson } = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) out[key] = serializable(val);
    return out;
  }
  return null;
}

function messageDto(row: any, metadata?: Record<string, unknown>) {
  if (!row) return null;
  return {
    id: String(row.id),
    direction: String(row.direction),
    type: String(row.type),
    content: row.content == null ? null : String(row.content),
    media_url: row.media_url == null ? null : String(row.media_url),
    created_at: String(row.created_at),
    metadata: serializable(metadata ?? metadataObject(row.metadata)),
  };
}

async function insertMessageRow(supabase: any, payload: Record<string, unknown>) {
  const { data, error } = await supabase.from("messages").insert(payload).select(
    "id,direction,type,content,media_url,created_at,metadata",
  ).single();
  if (error || !data) {
    throw new Error(error?.message ?? "Falha ao salvar mensagem");
  }
  return data;
}

async function getOrCreateConversationForJid(
  supabase: any, userId: string, connectionId: string, remoteJid: string,
) {
  const variants = jidVariants(remoteJid);
  const { data: existingRows } = await supabase.from("conversations")
    .select("id,metadata")
    .eq("user_id", userId).eq("connection_id", connectionId);
  const existing = (existingRows ?? []).find((row: any) => variants.includes(row?.metadata?.remoteJid));
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase.from("conversations").insert({
    user_id: userId, connection_id: connectionId, status: "open",
    unread_count: 0, last_message_at: new Date().toISOString(),
    metadata: { remoteJid } as never,
  }).select("id").single();
  if (error || !created) throw new Error(error?.message ?? "Falha ao criar conversa");
  return created.id as string;
}

function parseEvoError(json: any, status: number) {
  const pick = (v: any): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(pick).filter(Boolean).join(" | ");
    if (typeof v === "object") return v.message || v.error || v.exception || JSON.stringify(v);
    return String(v);
  };
  // Número não registrado no WhatsApp
  const notExists =
    json?.exists === false ||
    (Array.isArray(json?.response?.message) && json.response.message.some((m: any) => m?.exists === false));
  if (notExists) {
    const num = json?.number || json?.response?.message?.[0]?.number || "";
    return `Este número${num ? ` (${num})` : ""} não está registrado no WhatsApp.`;
  }
  return `Evolution ${status}: ${
    pick(json?.response?.message) || pick(json?.message) || pick(json?.error) || JSON.stringify(json ?? {}).slice(0, 400)
  }`;
}

function shouldRetryWithoutQuoted(json: any, status: number) {
  if (status < 400 || status >= 500) return false;
  const hay = JSON.stringify(json ?? {}).toLowerCase();
  return hay.includes("reading 'id'") || hay.includes('reading "id"') || hay.includes("quoted") || hay.includes("contextinfo");
}

const SendChatTextInput = z.object({
  contactId: z.string().uuid(),
  text: z.string().min(1).max(4096),
  quotedMessageId: z.string().uuid().optional(),
});

export const sendChatText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SendChatTextInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: contact } = await context.supabase.from("contacts")
      .select("*").eq("id", data.contactId).eq("user_id", context.userId).single();
    if (!contact) throw new Error("Contato não encontrado");
    const number = String(contact.phone).replace(/\D+/g, "");
    const conn = await pickConnectionForContact(context.supabase, context.userId, number);
    assertOnlineConnection(conn);
    const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
    const remoteJid = `${number}@s.whatsapp.net`;
    const convoId = await getOrCreateConversationForJid(context.supabase, context.userId, conn.id, remoteJid);
    const quoted = await buildQuoted(context.supabase, context.userId, data.quotedMessageId);
    const saved = await insertMessageRow(context.supabase, {
      user_id: context.userId,
      conversation_id: convoId,
      direction: "outbound",
      type: "text",
      content: data.text,
      metadata: { remoteJid, manual: true, pending: true, ...(quoted.meta ?? {}) } as never,
    });
    await context.supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
    }).eq("id", convoId).eq("user_id", context.userId);
    let r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendText/${conn.instance_name}`, apiKey, {
      method: "POST",
      body: JSON.stringify({ number, text: data.text }),
    });
    if (!r.ok && quoted.evo && shouldRetryWithoutQuoted(r.json, r.status)) {
      r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendText/${conn.instance_name}`, apiKey, {
        method: "POST",
        body: JSON.stringify({ number, text: data.text }),
      });
    }
    if (!r.ok) {
      const error = parseEvoError(r.json, r.status);
      const failedMeta = { ...metadataObject(saved.metadata), pending: false, failed: true, error };
      await context.supabase.from("messages").update({ metadata: failedMeta as never }).eq("id", saved.id).eq("user_id", context.userId);
      return { ok: false as const, error, conversationId: convoId, message: messageDto(saved, failedMeta) };
    }
    const evoId = findEvoId(r.json);
    const status = normalizeEvoStatus(r.json?.status ?? r.json?.ack ?? r.json?.messageStatus) ?? "sent";
    const nextMeta = { ...metadataObject(saved.metadata), pending: false, sent: true, status, ...(evoId ? { evoId } : {}) };
    await context.supabase.from("messages").update({ metadata: nextMeta as never }).eq("id", saved.id).eq("user_id", context.userId);
    return { ok: true, conversationId: convoId, message: messageDto(saved, nextMeta) };
  });

// ===================== Start a visual flow for a contact =====================

const StartFlowInput = z.object({
  contactId: z.string().uuid(),
  flowId: z.string().uuid(),
});

export const startFlowForContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => StartFlowInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: contact } = await context.supabase.from("contacts")
      .select("id,phone").eq("id", data.contactId).eq("user_id", context.userId).single();
    if (!contact) throw new Error("Contato não encontrado");

    const { data: flow } = await context.supabase.from("flows")
      .select("id,definition").eq("id", data.flowId).eq("user_id", context.userId).single();
    if (!flow) throw new Error("Fluxo não encontrado");
    const def = (flow as { definition: { nodes?: unknown[]; edges?: unknown[] } }).definition;
    if (!Array.isArray(def?.nodes) || !Array.isArray(def?.edges)) throw new Error("Definição de fluxo inválida");

    const outputKinds = new Set(["MESSAGE", "IMAGE", "VIDEO", "AUDIO", "QUESTION", "YESNO", "CAPTURE_NAME"]);
    const hasOutput = (def.nodes as Array<{ data?: { kind?: string } }>).some((n) => outputKinds.has(String(n?.data?.kind ?? "")));
    if (!hasOutput) throw new Error("Este fluxo não tem blocos de Mensagem/Pergunta/Mídia — adicione ao menos um antes de iniciar.");

    const number = String(contact.phone).replace(/\D+/g, "");
    const conn = await pickConnectionForContact(context.supabase, context.userId, number);
    assertOnlineConnection(conn);
    const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
    const remoteJid = `${number}@s.whatsapp.net`;
    const convoId = await getOrCreateConversationForJid(context.supabase, context.userId, conn.id, remoteJid);

    const { runFlowTracked } = await import("@/lib/flow-tracking.server");
    const result = await runFlowTracked({
      db: context.supabase,
      conn: { id: conn.id, user_id: context.userId, url_api: conn.url_api, api_key: apiKey, instance_name: conn.instance_name },
      recipient: remoteJid,
      userText: "",
      def: def as { nodes: never[]; edges: never[] },
      state: {}, // fresh run — ignora estado antigo (ex: finished:true de rodadas anteriores)
      flowId: flow.id,
      conversationId: convoId,
      connectionId: conn.id,
      userId: context.userId,
      source: "chat",
    });

    await context.supabase.from("conversations").update({
      flow_state: { ...result.state, updated_at: new Date().toISOString() } as never,
      last_message_at: new Date().toISOString(),
    } as never).eq("id", convoId).eq("user_id", context.userId);

    return { ok: true, conversationId: convoId, finished: !!result.finished, waiting: !!result.waitingForUser };
  });

// ===================== Send media (image/video/audio/document) =====================

const SendChatMediaInput = z.object({
  contactId: z.string().uuid(),
  base64: z.string().min(10),
  mime: z.string().min(3),
  fileName: z.string().min(1),
  caption: z.string().max(1024).optional(),
  quotedMessageId: z.string().uuid().optional(),
});

export const sendChatMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SendChatMediaInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: contact } = await context.supabase.from("contacts")
      .select("*").eq("id", data.contactId).eq("user_id", context.userId).single();
    if (!contact) throw new Error("Contato não encontrado");
    const number = String(contact.phone).replace(/\D+/g, "");
    const conn = await pickConnectionForContact(context.supabase, context.userId, number);
    assertOnlineConnection(conn);
    const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
    const remoteJid = `${number}@s.whatsapp.net`;
    const b64 = data.base64.replace(/^data:[^;]+;base64,/, "");
    const mediatype = mediaMessageType(data.mime);
    const convoId = await getOrCreateConversationForJid(context.supabase, context.userId, conn.id, remoteJid);
    const stored = await saveMediaToStorage(context.supabase, context.userId, convoId, b64, data.mime, data.fileName);
    const quoted = await buildQuoted(context.supabase, context.userId, data.quotedMessageId);
    const saved = await insertMessageRow(context.supabase, {
      user_id: context.userId, conversation_id: convoId,
      direction: "outbound",
      type: mediatype,
      content: data.caption ?? data.fileName,
      media_url: stored.url,
      metadata: { remoteJid, manual: true, fileName: data.fileName, mime: data.mime, storagePath: stored.path, pending: true, ...(quoted.meta ?? {}) } as never,
    });
    await context.supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
    }).eq("id", convoId).eq("user_id", context.userId);
    let r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendMedia/${conn.instance_name}`, apiKey, {
      method: "POST",
      body: JSON.stringify({
        number, mediatype, media: b64, mimetype: data.mime,
        fileName: data.fileName, caption: data.caption ?? "",
      }),
    });
    if (!r.ok && quoted.evo && shouldRetryWithoutQuoted(r.json, r.status)) {
      r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendMedia/${conn.instance_name}`, apiKey, {
        method: "POST",
        body: JSON.stringify({
          number, mediatype, media: b64, mimetype: data.mime,
          fileName: data.fileName, caption: data.caption ?? "",
        }),
      });
    }
    if (!r.ok) {
      const error = parseEvoError(r.json, r.status);
      if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, failed: true, error } as never }).eq("id", saved.id).eq("user_id", context.userId);
      return { ok: false as const, error, conversationId: convoId, message: messageDto(saved, { ...metadataObject(saved?.metadata), pending: false, failed: true, error }) };
    }
    const evoId = findEvoId(r.json);
    const status = normalizeEvoStatus(r.json?.status ?? r.json?.ack ?? r.json?.messageStatus) ?? "sent";
    const nextMeta = { ...metadataObject(saved?.metadata), pending: false, sent: true, status, ...(evoId ? { evoId } : {}) };
    if (saved?.id) await context.supabase.from("messages").update({ metadata: nextMeta as never }).eq("id", saved.id).eq("user_id", context.userId);
    return { ok: true as const, conversationId: convoId, message: messageDto(saved, nextMeta) };
  });

// ===================== Profile picture =====================

const ProfilePicInput = z.object({ phone: z.string().min(4) });

export const getProfilePicture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ProfilePicInput.parse(i))
  .handler(async ({ data, context }) => {
    const number = String(data.phone).replace(/\D+/g, "");
    let conn;
    try {
      conn = await pickConnectionForContact(context.supabase, context.userId, number);
    } catch {
      return { url: null };
    }
    if (!conn) return { url: null };
    const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
    const r = await evoFetch(`${baseUrl(conn.url_api)}/chat/fetchProfilePictureUrl/${conn.instance_name}`, apiKey, {
      method: "POST",
      body: JSON.stringify({ number }),
    });
    const url = r.json?.profilePictureUrl ?? r.json?.profilePicUrl ?? null;
    return { url: typeof url === "string" ? url : null };
  });

// ===================== Sync contact names from WhatsApp =====================

export const syncContactNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: contacts } = await context.supabase
      .from("contacts")
      .select("id,phone,name")
      .eq("user_id", context.userId)
      .or("name.is.null,name.eq.")
      .limit(500);
    if (!contacts?.length) return { updated: 0 };

    const { data: conns } = await context.supabase
      .from("connections")
      .select("id,url_api,api_key,instance_name")
      .eq("user_id", context.userId);
    if (!conns?.length) return { updated: 0 };

    // Build a map: digits -> pushName from every instance's contact list.
    const nameByDigits: Record<string, string> = {};
    for (const c of conns) {
      try {
        const apiKey = await loadEvolutionCommandKey(context.supabase, c.api_key);
        const r = await evoFetch(`${baseUrl(c.url_api)}/chat/findContacts/${c.instance_name}`, apiKey, {
          method: "POST",
          body: JSON.stringify({ where: {} }),
        });
        const list = Array.isArray(r.json) ? r.json : (r.json?.contacts ?? r.json?.data ?? []);
        for (const item of list as any[]) {
          const jid = String(item?.id ?? item?.remoteJid ?? item?.jid ?? "");
          if (!jid || jid.includes("@g.us") || jid.includes("@broadcast") || jid.includes("@lid")) continue;
          const digits = jid.split("@")[0].replace(/\D+/g, "");
          const name = String(item?.pushName ?? item?.name ?? item?.verifiedName ?? item?.notify ?? "").trim();
          if (digits && name && !nameByDigits[digits]) nameByDigits[digits] = name;
        }
      } catch { /* skip failing instance */ }
    }

    let updated = 0;
    for (const ct of contacts) {
      const variants = phoneVariants(String(ct.phone));
      let name: string | undefined;
      for (const v of variants) {
        if (nameByDigits[v]) { name = nameByDigits[v]; break; }
      }
      if (!name) continue;
      const { error } = await context.supabase
        .from("contacts")
        .update({ name, updated_at: new Date().toISOString() } as never)
        .eq("id", ct.id)
        .eq("user_id", context.userId);
      if (!error) updated++;
    }
    return { updated };
  });

const SendChatAudioInput = z.object({
  contactId: z.string().uuid(),
  audioBase64: z.string().min(10),
  quotedMessageId: z.string().uuid().optional(),
});

export const sendChatAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SendChatAudioInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: contact } = await context.supabase.from("contacts")
      .select("*").eq("id", data.contactId).eq("user_id", context.userId).single();
    if (!contact) throw new Error("Contato não encontrado");
    const number = String(contact.phone).replace(/\D+/g, "");
    const conn = await pickConnectionForContact(context.supabase, context.userId, number);
    assertOnlineConnection(conn);
    const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
    const remoteJid = `${number}@s.whatsapp.net`;
    const audio = data.audioBase64.replace(/^data:[^;]+;base64,/, "");
    const convoId = await getOrCreateConversationForJid(context.supabase, context.userId, conn.id, remoteJid);
    const stored = await saveMediaToStorage(context.supabase, context.userId, convoId, audio, "audio/webm", "audio.webm");
    const quoted = await buildQuoted(context.supabase, context.userId, data.quotedMessageId);
    const saved = await insertMessageRow(context.supabase, {
      user_id: context.userId, conversation_id: convoId,
      direction: "outbound", type: "audio", content: "[áudio]",
      media_url: stored.url,
      metadata: { remoteJid, manual: true, audio: true, mime: "audio/webm", storagePath: stored.path, pending: true, ...(quoted.meta ?? {}) } as never,
    });
    await context.supabase.from("conversations").update({
      last_message_at: new Date().toISOString(),
    }).eq("id", convoId).eq("user_id", context.userId);
    let r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendWhatsAppAudio/${conn.instance_name}`, apiKey, {
      method: "POST",
      body: JSON.stringify({ number, audio, encoding: true }),
    });
    if (!r.ok && quoted.evo && shouldRetryWithoutQuoted(r.json, r.status)) {
      r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendWhatsAppAudio/${conn.instance_name}`, apiKey, {
        method: "POST",
        body: JSON.stringify({ number, audio, encoding: true }),
      });
    }
    if (!r.ok) {
      const error = parseEvoError(r.json, r.status);
      if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, failed: true, error } as never }).eq("id", saved.id).eq("user_id", context.userId);
      return { ok: false as const, error, conversationId: convoId, message: messageDto(saved, { ...metadataObject(saved?.metadata), pending: false, failed: true, error }) };
    }
    const evoId = findEvoId(r.json);
    const status = normalizeEvoStatus(r.json?.status ?? r.json?.ack ?? r.json?.messageStatus) ?? "sent";
    const nextMeta = { ...metadataObject(saved?.metadata), pending: false, sent: true, status, ...(evoId ? { evoId } : {}) };
    if (saved?.id) await context.supabase.from("messages").update({ metadata: nextMeta as never }).eq("id", saved.id).eq("user_id", context.userId);
    return { ok: true, conversationId: convoId, message: messageDto(saved, nextMeta) };
  });

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// ===================== Quoted / reply helper =====================
async function buildQuoted(
  supabase: any,
  userId: string,
  quotedMessageId: string | undefined,
): Promise<{ evo?: unknown; meta?: Record<string, unknown> }> {
  if (!quotedMessageId) return {};
  const { data: q } = await supabase.from("messages")
    .select("id,type,content,direction,metadata")
    .eq("id", quotedMessageId).eq("user_id", userId).maybeSingle();
  if (!q) return {};
  const qm = metadataObject(q.metadata);
  const evoId = qm.evoId as string | undefined;
  const remoteJid = qm.remoteJid as string | undefined;
  const preview = String(q.content ?? "").slice(0, 200);
  const meta = { quotedId: q.id, quotedText: preview, quotedType: q.type, quotedDirection: q.direction } as Record<string, unknown>;
  if (!evoId || !remoteJid) return { meta };
  return {
    evo: {
      key: { id: evoId, remoteJid, fromMe: q.direction === "outbound" },
      message: { conversation: preview || " " },
    },
    meta,
  };
}

// ===================== Delete message =====================
const DeleteChatMessageInput = z.object({
  messageId: z.string().uuid(),
  forEveryone: z.boolean(),
});

export const deleteChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteChatMessageInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: m } = await context.supabase.from("messages")
      .select("id,direction,metadata")
      .eq("id", data.messageId).eq("user_id", context.userId).maybeSingle();
    if (!m) return { ok: true as const };
    const meta = metadataObject(m.metadata);
    if (data.forEveryone && m.direction === "outbound" && meta.evoId && meta.remoteJid) {
      try {
        const conn = await pickActiveConnection(context.supabase, context.userId);
        const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
        await evoFetch(`${baseUrl(conn.url_api)}/chat/deleteMessageForEveryone/${conn.instance_name}`, apiKey, {
          method: "DELETE",
          body: JSON.stringify({ id: meta.evoId, remoteJid: meta.remoteJid, fromMe: true }),
        });
      } catch { /* still delete locally */ }
    }
    await context.supabase.from("messages").delete().eq("id", data.messageId).eq("user_id", context.userId);
    return { ok: true as const };
  });

// ===================== Forward message =====================
const ForwardChatMessageInput = z.object({
  messageId: z.string().uuid(),
  targetContactId: z.string().uuid(),
});

// ===================== Edit message =====================
const EditChatMessageInput = z.object({
  messageId: z.string().uuid(),
  text: z.string().min(1).max(4096),
});

export const editChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EditChatMessageInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: m } = await context.supabase.from("messages")
      .select("id,direction,type,metadata,content")
      .eq("id", data.messageId).eq("user_id", context.userId).maybeSingle();
    if (!m) throw new Error("Mensagem não encontrada");
    if (m.direction !== "outbound") throw new Error("Só é possível editar mensagens enviadas por você");
    if (m.type !== "text") throw new Error("Só é possível editar mensagens de texto");
    const meta = metadataObject(m.metadata);
    const evoId = meta.evoId as string | undefined;
    const remoteJid = meta.remoteJid as string | undefined;
    if (evoId && remoteJid) {
      try {
        const conn = await pickActiveConnection(context.supabase, context.userId);
        const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
        const number = String(remoteJid).replace(/@.*/, "");
        const r = await evoFetch(`${baseUrl(conn.url_api)}/chat/updateMessage/${conn.instance_name}`, apiKey, {
          method: "POST",
          body: JSON.stringify({
            number,
            key: { id: evoId, remoteJid, fromMe: true },
            text: data.text,
          }),
        });
        if (!r.ok) {
          const error = parseEvoError(r.json, r.status);
          return { ok: false as const, error };
        }
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao editar no WhatsApp" };
      }
    }
    await context.supabase.from("messages").update({
      content: data.text,
      metadata: { ...meta, edited: true, editedAt: new Date().toISOString() } as never,
    }).eq("id", data.messageId).eq("user_id", context.userId);
    return { ok: true as const };
  });

// ===================== React to message =====================
const ReactChatMessageInput = z.object({
  messageId: z.string().uuid(),
  reaction: z.string().max(8), // empty string removes the reaction
});

export const reactChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReactChatMessageInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: m } = await context.supabase.from("messages")
      .select("id,direction,metadata")
      .eq("id", data.messageId).eq("user_id", context.userId).maybeSingle();
    if (!m) throw new Error("Mensagem não encontrada");
    const meta = metadataObject(m.metadata);
    const evoId = meta.evoId as string | undefined;
    const remoteJid = meta.remoteJid as string | undefined;
    if (evoId && remoteJid) {
      try {
        const conn = await pickActiveConnection(context.supabase, context.userId);
        const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
        const r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendReaction/${conn.instance_name}`, apiKey, {
          method: "POST",
          body: JSON.stringify({
            key: { id: evoId, remoteJid, fromMe: m.direction === "outbound" },
            reaction: data.reaction,
          }),
        });
        if (!r.ok) {
          const error = parseEvoError(r.json, r.status);
          return { ok: false as const, error };
        }
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Falha ao reagir" };
      }
    }
    const next = { ...meta, reaction: data.reaction || undefined } as Record<string, unknown>;
    if (!data.reaction) delete next.reaction;
    await context.supabase.from("messages").update({ metadata: next as never }).eq("id", data.messageId).eq("user_id", context.userId);
    return { ok: true as const };
  });

// ===================== Quick Sends (templates) =====================

const MAX_QUICK_VIDEO_BYTES = 16 * 1024 * 1024;

function guessQuickKind(mime: string): "image" | "video" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

async function saveQuickSendMedia(
  supabase: any,
  userId: string,
  base64: string,
  mime: string,
  fileName: string,
) {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  const rawExt = fileName.includes(".") ? fileName.split(".").pop() : mime.split("/")[1]?.split(";")[0];
  const ext = rawExt?.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 12);
  const path = `${userId}/quick-sends/${Date.now()}-${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: mime || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  return { path, url: data?.signedUrl ?? null, size: bytes.length };
}

async function refreshQuickSendUrl(supabase: any, storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 30);
  return data?.signedUrl ?? null;
}

export const listQuickSends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("quick_sends")
      .select("id,title,text,media_type,media_mime,media_name,media_size,media_url,storage_path,is_ptt,created_at,updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Refresh signed URLs (they expire); best-effort.
    const items = await Promise.all((data ?? []).map(async (row) => {
      if (row.storage_path) {
        const url = await refreshQuickSendUrl(context.supabase, row.storage_path);
        return { ...row, media_url: url ?? row.media_url };
      }
      return row;
    }));
    return { items };
  });

const UpsertQuickSendInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(80),
  text: z.string().max(4000).optional(),
  isPtt: z.boolean().optional(),
  media: z.object({
    base64: z.string().min(10),
    mime: z.string().min(1),
    fileName: z.string().min(1),
  }).optional(),
  removeMedia: z.boolean().optional(),
});

export const upsertQuickSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpsertQuickSendInput.parse(i))
  .handler(async ({ data, context }) => {
    let mediaFields: Record<string, unknown> = {};
    if (data.media) {
      const kind = guessQuickKind(data.media.mime);
      // Estimate raw size (base64 is ~4/3 of raw)
      const clean = data.media.base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
      const approxSize = Math.floor(clean.length * 0.75);
      if (kind === "video" && approxSize > MAX_QUICK_VIDEO_BYTES) {
        throw new Error(`Vídeo excede o limite de ${Math.floor(MAX_QUICK_VIDEO_BYTES / 1024 / 1024)}MB`);
      }
      const stored = await saveQuickSendMedia(context.supabase, context.userId, data.media.base64, data.media.mime, data.media.fileName);
      mediaFields = {
        media_type: kind,
        media_mime: data.media.mime,
        media_name: data.media.fileName,
        media_size: stored.size,
        media_url: stored.url,
        storage_path: stored.path,
      };
    } else if (data.removeMedia) {
      mediaFields = {
        media_type: null, media_mime: null, media_name: null, media_size: null, media_url: null, storage_path: null,
      };
    }
    if (data.id) {
      const { data: existing } = await context.supabase.from("quick_sends")
        .select("storage_path").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
      if (!existing) throw new Error("Template não encontrado");
      if ((data.media || data.removeMedia) && existing.storage_path) {
        await context.supabase.storage.from(MEDIA_BUCKET).remove([existing.storage_path]).catch(() => {});
      }
      const { data: row, error } = await context.supabase.from("quick_sends").update({
        title: data.title,
        text: data.text ?? null,
        is_ptt: !!data.isPtt,
        ...mediaFields,
      } as never).eq("id", data.id).select("*").single();
      if (error) throw new Error(error.message);
      return { ok: true as const, item: row };
    }
    const { data: row, error } = await context.supabase.from("quick_sends").insert({
      user_id: context.userId,
      title: data.title,
      text: data.text ?? null,
      is_ptt: !!data.isPtt,
      ...mediaFields,
    } as never).select("*").single();
    if (error) throw new Error(error.message);
    return { ok: true as const, item: row };
  });

const DeleteQuickSendInput = z.object({ id: z.string().uuid() });

export const deleteQuickSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteQuickSendInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase.from("quick_sends")
      .select("storage_path").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!existing) return { ok: true as const };
    if (existing.storage_path) {
      await context.supabase.storage.from(MEDIA_BUCKET).remove([existing.storage_path]).catch(() => {});
    }
    await context.supabase.from("quick_sends").delete().eq("id", data.id).eq("user_id", context.userId);
    return { ok: true as const };
  });

const SendQuickSendInput = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
});

export const sendQuickSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SendQuickSendInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: qs } = await context.supabase.from("quick_sends")
      .select("*").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!qs) throw new Error("Envio rápido não encontrado");
    const { data: contact } = await context.supabase.from("contacts")
      .select("*").eq("id", data.contactId).eq("user_id", context.userId).single();
    if (!contact) throw new Error("Contato não encontrado");
    const number = String(contact.phone).replace(/\D+/g, "");
    const conn = await pickConnectionForContact(context.supabase, context.userId, number);
    const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
    const remoteJid = `${number}@s.whatsapp.net`;
    const convoId = await getOrCreateConversationForJid(context.supabase, context.userId, conn.id, remoteJid);
    await context.supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convoId).eq("user_id", context.userId);

    const results: Array<{ kind: string; ok: boolean; error?: string }> = [];

    // 1) Send text if present
    const bodyText = String(qs.text ?? "").trim();
    if (bodyText) {
      const { data: saved } = await context.supabase.from("messages").insert({
        user_id: context.userId, conversation_id: convoId,
        direction: "outbound", type: "text", content: bodyText,
        metadata: { remoteJid, manual: true, quickSendId: qs.id, pending: true } as never,
      }).select("id,metadata").single();
      const r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendText/${conn.instance_name}`, apiKey, {
        method: "POST", body: JSON.stringify({ number, text: bodyText }),
      });
      if (!r.ok) {
        const error = parseEvoError(r.json, r.status);
        if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, failed: true, error } as never }).eq("id", saved.id).eq("user_id", context.userId);
        results.push({ kind: "text", ok: false, error });
      } else {
        const evoId = findEvoId(r.json);
        const status = normalizeEvoStatus(r.json?.status ?? r.json?.ack ?? r.json?.messageStatus) ?? "sent";
        if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, sent: true, status, evoId } as never }).eq("id", saved.id).eq("user_id", context.userId);
        results.push({ kind: "text", ok: true });
      }
    }

    // 2) Send media if present
    if (qs.storage_path && qs.media_mime) {
      const dl = await context.supabase.storage.from(MEDIA_BUCKET).download(qs.storage_path);
      if (dl.error || !dl.data) {
        results.push({ kind: "media", ok: false, error: "Não foi possível ler o arquivo do template" });
      } else {
        const buf = new Uint8Array(await dl.data.arrayBuffer());
        let bin = ""; const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
        const b64 = btoa(bin);
        const mime = qs.media_mime as string;
        const fileName = (qs.media_name as string) || `quick.${mime.split("/")[1] ?? "bin"}`;
        const asPtt = qs.is_ptt && mime.startsWith("audio/");
        if (asPtt) {
          const stored = await saveMediaToStorage(context.supabase, context.userId, convoId, b64, mime, fileName);
          const { data: saved } = await context.supabase.from("messages").insert({
            user_id: context.userId, conversation_id: convoId,
            direction: "outbound", type: "audio", content: "[áudio]",
            media_url: stored.url,
            metadata: { remoteJid, manual: true, audio: true, mime, storagePath: stored.path, quickSendId: qs.id, pending: true } as never,
          }).select("id,metadata").single();
          const r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendWhatsAppAudio/${conn.instance_name}`, apiKey, {
            method: "POST", body: JSON.stringify({ number, audio: b64, encoding: true }),
          });
          if (!r.ok) {
            const error = parseEvoError(r.json, r.status);
            if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, failed: true, error } as never }).eq("id", saved.id).eq("user_id", context.userId);
            results.push({ kind: "audio", ok: false, error });
          } else {
            const evoId = findEvoId(r.json);
            const status = normalizeEvoStatus(r.json?.status ?? r.json?.ack ?? r.json?.messageStatus) ?? "sent";
            if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, sent: true, status, evoId } as never }).eq("id", saved.id).eq("user_id", context.userId);
            results.push({ kind: "audio", ok: true });
          }
        } else {
          const mediatype = mediaMessageType(mime);
          const stored = await saveMediaToStorage(context.supabase, context.userId, convoId, b64, mime, fileName);
          const { data: saved } = await context.supabase.from("messages").insert({
            user_id: context.userId, conversation_id: convoId,
            direction: "outbound", type: mediatype, content: fileName,
            media_url: stored.url,
            metadata: { remoteJid, manual: true, fileName, mime, storagePath: stored.path, quickSendId: qs.id, pending: true } as never,
          }).select("id,metadata").single();
          const r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendMedia/${conn.instance_name}`, apiKey, {
            method: "POST",
            body: JSON.stringify({ number, mediatype, media: b64, mimetype: mime, fileName, caption: "" }),
          });
          if (!r.ok) {
            const error = parseEvoError(r.json, r.status);
            if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, failed: true, error } as never }).eq("id", saved.id).eq("user_id", context.userId);
            results.push({ kind: mediatype, ok: false, error });
          } else {
            const evoId = findEvoId(r.json);
            const status = normalizeEvoStatus(r.json?.status ?? r.json?.ack ?? r.json?.messageStatus) ?? "sent";
            if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, sent: true, status, evoId } as never }).eq("id", saved.id).eq("user_id", context.userId);
            results.push({ kind: mediatype, ok: true });
          }
        }
      }
    }

    if (!bodyText && !qs.storage_path) throw new Error("Template vazio");
    return { ok: true as const, results, conversationId: convoId };
  });

export const forwardChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ForwardChatMessageInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: m } = await context.supabase.from("messages")
      .select("id,type,content,media_url,metadata")
      .eq("id", data.messageId).eq("user_id", context.userId).single();
    if (!m) throw new Error("Mensagem não encontrada");
    const { data: contact } = await context.supabase.from("contacts")
      .select("*").eq("id", data.targetContactId).eq("user_id", context.userId).single();
    if (!contact) throw new Error("Contato não encontrado");
    const conn = await pickActiveConnection(context.supabase, context.userId);
    const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
    const number = String(contact.phone).replace(/\D+/g, "");
    const remoteJid = `${number}@s.whatsapp.net`;
    const convoId = await getOrCreateConversationForJid(context.supabase, context.userId, conn.id, remoteJid);
    const meta = metadataObject(m.metadata);
    const storagePath = meta.storagePath as string | undefined;
    const mime = (meta.mime as string | undefined) ?? undefined;
    const isMedia = (m.type === "image" || m.type === "video" || m.type === "audio" || m.type === "document") && !!storagePath;

    if (!isMedia) {
      const body = String(m.content ?? "");
      if (!body.trim()) throw new Error("Nada a encaminhar");
      const { data: saved } = await context.supabase.from("messages").insert({
        user_id: context.userId, conversation_id: convoId,
        direction: "outbound", type: "text", content: body,
        metadata: { remoteJid, manual: true, forwardedFrom: m.id, pending: true } as never,
      }).select("id,metadata").single();
      await context.supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convoId).eq("user_id", context.userId);
      const r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendText/${conn.instance_name}`, apiKey, {
        method: "POST", body: JSON.stringify({ number, text: body }),
      });
      if (!r.ok) {
        const error = parseEvoError(r.json, r.status);
        if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, failed: true, error } as never }).eq("id", saved.id).eq("user_id", context.userId);
        return { ok: false as const, error };
      }
      const evoId = findEvoId(r.json);
      const status = normalizeEvoStatus(r.json?.status ?? r.json?.ack ?? r.json?.messageStatus) ?? "sent";
      if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, sent: true, status, evoId } as never }).eq("id", saved.id).eq("user_id", context.userId);
      return { ok: true as const };
    }

    const dl = await context.supabase.storage.from(MEDIA_BUCKET).download(storagePath!);
    if (dl.error || !dl.data) throw new Error("Não foi possível ler o arquivo original");
    const buf = new Uint8Array(await dl.data.arrayBuffer());
    let bin = ""; const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    const b64 = btoa(bin);
    const mm = mime ?? "application/octet-stream";
    const fileName = (meta.fileName as string | undefined) ?? `forward.${(mm.split("/")[1] ?? "bin")}`;
    const stored = await saveMediaToStorage(context.supabase, context.userId, convoId, b64, mm, fileName);
    const type = m.type;
    const { data: saved } = await context.supabase.from("messages").insert({
      user_id: context.userId, conversation_id: convoId,
      direction: "outbound", type,
      content: m.content ?? fileName, media_url: stored.url,
      metadata: { remoteJid, manual: true, forwardedFrom: m.id, storagePath: stored.path, mime: mm, fileName, pending: true, ...(type === "audio" ? { audio: true } : {}) } as never,
    }).select("id,metadata").single();
    await context.supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convoId).eq("user_id", context.userId);
    let r;
    if (type === "audio") {
      r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendWhatsAppAudio/${conn.instance_name}`, apiKey, {
        method: "POST", body: JSON.stringify({ number, audio: b64, encoding: true }),
      });
    } else {
      r = await evoFetch(`${baseUrl(conn.url_api)}/message/sendMedia/${conn.instance_name}`, apiKey, {
        method: "POST",
        body: JSON.stringify({ number, mediatype: mediaMessageType(mm), media: b64, mimetype: mm, fileName, caption: "" }),
      });
    }
    if (!r.ok) {
      const error = parseEvoError(r.json, r.status);
      if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, failed: true, error } as never }).eq("id", saved.id).eq("user_id", context.userId);
      return { ok: false as const, error };
    }
    const evoId = findEvoId(r.json);
    const status = normalizeEvoStatus(r.json?.status ?? r.json?.ack ?? r.json?.messageStatus) ?? "sent";
    if (saved?.id) await context.supabase.from("messages").update({ metadata: { ...metadataObject(saved.metadata), pending: false, sent: true, status, evoId } as never }).eq("id", saved.id).eq("user_id", context.userId);
    return { ok: true as const };
  });

// ===================== Presence (typing / recording) =====================

const SendPresenceInput = z.object({
  contactId: z.string().uuid(),
  presence: z.enum(["composing", "recording", "paused", "available", "unavailable"]),
});

export const sendPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SendPresenceInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: contact } = await context.supabase.from("contacts")
      .select("phone").eq("id", data.contactId).eq("user_id", context.userId).single();
    if (!contact) return { ok: false as const, error: "Contato não encontrado" };
    try {
      const conn = await pickConnectionForContact(context.supabase, context.userId, contact.phone);
      const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
      const number = String(contact.phone).replace(/\D+/g, "");
      await evoFetch(`${baseUrl(conn.url_api)}/chat/sendPresence/${conn.instance_name}`, apiKey, {
        method: "POST",
        // WhatsApp only shows the indicator for `delay` ms and then clears it.
        // Use a long delay (25s) so the state stays visible well beyond any
        // client re-send interval — this removes the "grava/para/grava" flicker
        // seen on the receiver's phone. The client resends every ~3s while
        // recording, so the indicator is refreshed long before it expires.
        body: JSON.stringify({ number, delay: 25000, presence: data.presence }),
      });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Falha" };
    }
  });

// Subscribe to a contact's presence so WhatsApp starts pushing composing/recording
// updates for that JID (Baileys/Evolution requires this before PRESENCE_UPDATE
// events start flowing per-chat).
const SubscribePresenceInput = z.object({ contactId: z.string().uuid() });
export const subscribeContactPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SubscribePresenceInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: contact } = await context.supabase.from("contacts")
      .select("phone").eq("id", data.contactId).eq("user_id", context.userId).single();
    if (!contact) return { ok: false as const, error: "Contato não encontrado" };
    try {
      const conn = await pickConnectionForContact(context.supabase, context.userId, contact.phone);
      const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
      const number = String(contact.phone).replace(/\D+/g, "");
      // Try both spellings used across Evolution versions; ignore individual failures.
      const paths = [
        `/chat/subscribePresence/${conn.instance_name}`,
        `/chat/presenceSubscribe/${conn.instance_name}`,
      ];
      for (const p of paths) {
        try {
          await evoFetch(`${baseUrl(conn.url_api)}${p}`, apiKey, {
            method: "POST",
            body: JSON.stringify({ number }),
          });
        } catch { /* try next */ }
      }
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Falha" };
    }
  });

export const ensurePresenceWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: conns } = await context.supabase
      .from("connections")
      .select("*")
      .eq("user_id", context.userId)
      .order("last_sync", { ascending: false, nullsFirst: false })
      .limit(50);
    if (!conns?.length) return { ok: false as const, error: "Nenhuma conexão WhatsApp encontrada." };
    let configured = 0;
    let lastError = "Falha";
    try {
      for (const conn of conns) {
        try {
          const apiKey = await loadEvolutionCommandKey(context.supabase, conn.api_key);
          const found = await evoFetch(`${baseUrl(conn.url_api)}/webhook/find/${conn.instance_name}`, apiKey);
          const cur = found.json?.webhook ?? found.json ?? {};
          const events: string[] = Array.isArray(cur.events) ? cur.events : [];
          const required = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "PRESENCE_UPDATE"];
          const base64Enabled = cur.webhookBase64 ?? cur.webhook_base64 ?? cur.base64;
          if (required.every((event) => events.includes(event)) && base64Enabled === false) {
            configured += 1;
            continue;
          }
          const url = cur.url || cur.webhookUrl;
          if (!url) { lastError = "Webhook não configurado"; continue; }
          const byEvents = cur.webhookByEvents ?? cur.webhook_by_events ?? cur.byEvents ?? false;
          const webhook = {
            enabled: true,
            url,
            webhookByEvents: byEvents,
            webhook_by_events: byEvents,
            byEvents,
            webhookBase64: false,
            webhook_base64: false,
            base64: false,
            events: [...new Set([...events, ...required])],
          };
          await evoFetch(`${baseUrl(conn.url_api)}/webhook/set/${conn.instance_name}`, apiKey, {
            method: "POST",
            body: JSON.stringify({ ...webhook, webhook }),
          });
          configured += 1;
        } catch (e) {
          lastError = e instanceof Error ? e.message : "Falha";
        }
      }
      return configured > 0
        ? { ok: true as const, configured }
        : { ok: false as const, error: lastError };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Falha" };
    }
  });
