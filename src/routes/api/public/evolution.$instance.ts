import { createFileRoute } from "@tanstack/react-router";

type Ext = {
  keywords?: { enabled?: boolean; mode?: string; list?: string[] };
  hours?: {
    enabled?: boolean; start?: string; end?: string;
    lunch?: boolean; lunchStart?: string; lunchEnd?: string;
    days?: string[]; blockedDates?: string[];
  };
  timing?: {
    delayChar?: number; delayMax?: number; wait?: number;
    humanIntervention?: boolean; reactivation?: number; unknownMsg?: string;
  };
  conversation?: {
    keepUnread?: boolean; singleMessage?: boolean;
    cancelOnNew?: boolean; stopAfterManual?: boolean;
  };
  alerts?: {
    whatsapp?: boolean; stopAfterHandoff?: boolean;
    stopAfterHours?: number; includeSummary?: boolean;
  };
  audio?: {
    enabled?: boolean; replaceText?: boolean; autoReply?: boolean;
    mirrorFormat?: boolean; smartAudio?: boolean; smartAudioChars?: number;
    voice?: string;
  };
  media?: {
    enabled?: boolean;
    items?: Array<{ id: string; name: string; mode?: string; keywords?: string; description?: string; storage_path?: string; mime?: string }>;
  };
};
type ConvMeta = {
  remoteJid?: string;
  pending_until?: string;      // ISO
  pending_texts?: string[];
  agent_paused_until?: string; // ISO
  last_manual_at?: string;     // ISO
  handoff?: boolean;
};

const MEDIA_BUCKET = "agent-media";
// Limite de recebimento de mídia: 200 MB por arquivo
const MAX_INBOUND_MEDIA_BYTES = 200 * 1024 * 1024;
// Evita derrubar o worker com vídeo em base64 no webhook.
const MAX_WEBHOOK_BODY_BYTES = 25 * 1024 * 1024;
const MAX_INLINE_MEDIA_BYTES = 25 * 1024 * 1024;
let bucketLimitEnsured = false;

class MediaTooLargeError extends Error {
  bytes: number;
  constructor(bytes: number) {
    super(`Mídia excede o limite de 200 MB (${(bytes / 1024 / 1024).toFixed(1)} MB recebidos).`);
    this.name = "MediaTooLargeError";
    this.bytes = bytes;
  }
}

function normalizeEvoStatus(value: unknown): "sent" | "delivered" | "read" | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = Number(value);
    return n >= 4 ? "read" : n === 3 ? "delivered" : n >= 1 ? "sent" : null;
  }
  const s = String(value).toUpperCase();
  if (s === "READ" || s === "PLAYED" || s === "READ_ACK" || s === "READ_RECEIPT") return "read";
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
  const key = record.key as Record<string, unknown> | undefined;
  // Receipt payloads can include both an internal `messageId` and the real
  // WhatsApp/Evolution id in `keyId`; the latter is what we store as evoId.
  const direct = key?.id ?? record.keyId ?? record.id ?? record.messageId;
  if (typeof direct === "string" && /^[A-Z0-9._-]{8,}$/i.test(direct)) return direct;
  for (const nested of [record.update, record.data, record.message, record.response, record.result]) {
    const found = findEvoId(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

// Extract new text from a Baileys/Evolution edit event.
// Handles: editedMessage.message.protocolMessage.editedMessage.{conversation|extendedTextMessage.text}
// and message.protocolMessage.editedMessage.* variants.
function extractEditedText(value: unknown, depth = 0): string | null {
  if (!value || depth > 8 || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const proto = (v.protocolMessage ?? (v.message as Record<string, unknown> | undefined)?.protocolMessage) as Record<string, unknown> | undefined;
  if (proto && (proto.type === 14 || proto.type === "MESSAGE_EDIT" || proto.editedMessage)) {
    const em = (proto.editedMessage ?? {}) as Record<string, unknown>;
    const conv = em.conversation as string | undefined;
    if (typeof conv === "string") return conv;
    const ext = (em.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined;
    if (typeof ext === "string") return ext;
  }
  for (const val of Object.values(v)) {
    if (val && typeof val === "object") {
      const found = extractEditedText(val, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function extractEditedTargetId(value: unknown, depth = 0): string | null {
  if (!value || depth > 8 || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const proto = (v.protocolMessage ?? (v.message as Record<string, unknown> | undefined)?.protocolMessage) as Record<string, unknown> | undefined;
  if (proto && (proto.type === 14 || proto.type === "MESSAGE_EDIT" || proto.editedMessage)) {
    const key = proto.key as Record<string, unknown> | undefined;
    const id = key?.id as string | undefined;
    if (typeof id === "string") return id;
  }
  for (const val of Object.values(v)) {
    if (val && typeof val === "object") {
      const found = extractEditedTargetId(val, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function receiptRemoteJidCandidates(remoteJid: string) {
  const base = remoteJid.split(":")[0] ?? remoteJid;
  const candidates = new Set<string>([remoteJid, base]);
  for (const jid of [remoteJid, base]) {
    const phone = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
    if (!phone) continue;
    candidates.add(`${phone}@s.whatsapp.net`);
    candidates.add(`${phone}@lid`);
    for (const variant of phoneVariants(phone)) {
      candidates.add(`${variant}@s.whatsapp.net`);
      candidates.add(`${variant}@lid`);
    }
  }
  return [...candidates].filter(Boolean);
}

export const Route = createFileRoute("/api/public/evolution/$instance")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const instance = params.instance;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Garante que o bucket aceita arquivos de até 200 MB (executa uma vez por processo)
        if (!bucketLimitEnsured) {
          bucketLimitEnsured = true;
          try {
            await (supabaseAdmin.storage as any).updateBucket(MEDIA_BUCKET, {
              fileSizeLimit: MAX_INBOUND_MEDIA_BYTES,
            });
          } catch { /* best-effort */ }
        }

        // Find connection by instance_name
        const { data: conn } = await supabaseAdmin
          .from("connections").select("id,user_id,url_api,api_key,instance_name").eq("instance_name", instance).maybeSingle();

        if (!conn) return Response.json({ ok: false, reason: "instance not found" }, { status: 404 });

        // Verify caller: Evolution forwards its instance apikey in the `apikey` header.
        // Evolution v2 may send either the per-instance token (hash.apikey) or the
        // global AUTHENTICATION_API_KEY configured on the server — accept either.
        const url = new URL(request.url);
        const providedKey = request.headers.get("apikey") ?? request.headers.get("x-evolution-apikey") ?? url.searchParams.get("apikey") ?? url.searchParams.get("token") ?? "";
        const instanceKey = conn.api_key ?? "";
        let globalKey = "";
        try {
          const { data: setting } = await supabaseAdmin
            .from("settings").select("value").eq("key", "evolution_api").maybeSingle();
          const cfg = (typeof setting?.value === "string" ? JSON.parse(setting.value) : setting?.value) as { api_key?: string } | null;
          if (cfg?.api_key) globalKey = cfg.api_key;
        } catch { /* ignore */ }
        const safeEq = (a: string, b: string) => {
          if (!a || !b || a.length !== b.length) return false;
          let diff = 0;
          for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
          return diff === 0;
        };
        const webhookSecret = process.env.FOLLOWUP_TRIGGER_SECRET ?? "";
        const matchedInstance = !!instanceKey && safeEq(providedKey, instanceKey);
        const matchedGlobal = !!globalKey && safeEq(providedKey, globalKey);
        const matchedSecret = !!webhookSecret && safeEq(providedKey, webhookSecret);
        const matched: "instance" | "global" | "secret" | "none" =
          matchedInstance ? "instance" : matchedGlobal ? "global" : matchedSecret ? "secret" : "none";
        if (matched === "none") {
          const diag = {
            instance,
            matched,
            providedKeyLen: providedKey.length,
            providedKeyPrefix: providedKey ? providedKey.slice(0, 6) : "",
            instanceKeyLen: instanceKey.length,
            instanceKeyPrefix: instanceKey ? instanceKey.slice(0, 6) : "",
            globalKeyLen: globalKey.length,
            globalKeyPrefix: globalKey ? globalKey.slice(0, 6) : "",
          };
          try {
            await (supabaseAdmin.from("logs") as any).insert({
              user_id: conn.user_id,
              level: "warn",
              source: "evolution.webhook",
              message: "invalid signature: apikey did not match instance or global",
              metadata: { ...diag, headers: Object.fromEntries(request.headers) },
            });
          } catch { /* ignore */ }
          return Response.json(
            { ok: false, reason: "invalid signature", diag },
            { status: 401 },
          );
        }
        const commandConn = { ...conn, api_key: globalKey || conn.api_key };
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
          await disableWebhookBase64(commandConn).catch(() => undefined);
          await supabaseAdmin.from("logs").insert({
            user_id: conn.user_id,
            level: "warn",
            source: `evolution:${instance}`,
            message: "webhook payload too large; disabled base64 media mode",
            metadata: { bytes: contentLength, limit: MAX_WEBHOOK_BODY_BYTES } as never,
          } as never);
          return Response.json({ ok: true, skipped: "payload-too-large", action: "disabled-webhook-base64" });
        }

        let payload: any = null;
        const rawBody = await request.text().catch(() => "");
        try { payload = rawBody ? JSON.parse(rawBody) : null; } catch { payload = null; }
        const event = payload?.event;
        // Successful match — record which key type authenticated the call.
        try {
          await (supabaseAdmin.from("logs") as any).insert({
            user_id: conn.user_id,
            level: "info",
            source: "evolution.webhook",
            message: `apikey matched: ${matched}`,
            metadata: { instance, matched, providedKeyPrefix: providedKey.slice(0, 6) },
          });
        } catch { /* ignore */ }

        // Log the raw event
        await supabaseAdmin.from("logs").insert({
          user_id: conn.user_id,
          level: "info",
          source: `evolution:${instance}`,
          message: payload?.event ?? "webhook",
          metadata: sanitizeWebhookPayload(payload ?? {}) as never,
        } as never);

        // Handle connection state updates
        if (event === "connection.update" || event === "CONNECTION_UPDATE") {
          const state = payload?.data?.state;
          const status = state === "open" ? "online" : state === "connecting" ? "connecting" : "offline";
          await supabaseAdmin.from("connections").update({
            status,
            last_sync: new Date().toISOString(),
            phone_number: payload?.data?.wuid?.split?.("@")?.[0] ?? undefined,
          }).eq("id", conn.id);
        }

        // Presence updates (typing/recording) — upsert into public.presence
        if (event === "presence.update" || event === "PRESENCE_UPDATE") {
          try {
            const d = payload?.data ?? {};
            const presences = d.presences ?? {};
            const jid = (d.id as string | undefined) ?? Object.keys(presences)[0];
            if (jid) {
              const p = presences[jid]?.lastKnownPresence ?? d.presence ?? "available";
              const now = new Date().toISOString();
              const rows = [jid, ...Object.keys(presences)].filter(Boolean).map((presenceJid) => ({
                user_id: conn.user_id,
                jid: presenceJid,
                presence: String(presences[presenceJid]?.lastKnownPresence ?? p),
                updated_at: now,
              }));
              await supabaseAdmin.from("presence").upsert(rows as never, { onConflict: "user_id,jid" });
            }
          } catch { /* ignore */ }
          return Response.json({ ok: true });
        }

        // Delivery / read receipts for outbound messages
        if (event === "messages.update" || event === "MESSAGES_UPDATE") {
          try {
            const arr = Array.isArray(payload?.data) ? payload.data : [payload?.data];
            for (const u of arr) {
              // --- Edit detection (Baileys protocolMessage type=14 / editedMessage) ---
              const editedText = extractEditedText(u);
              if (editedText !== null) {
                const originalEvoId = extractEditedTargetId(u) ?? findEvoId(u);
                if (originalEvoId) {
                  const { data: erows } = await supabaseAdmin.from("messages")
                    .select("id,metadata,content")
                    .eq("user_id", conn.user_id)
                    .eq("metadata->>evoId", originalEvoId)
                    .limit(1);
                  const erow = erows?.[0];
                  if (erow) {
                    const emeta = (erow.metadata && typeof erow.metadata === "object") ? erow.metadata as Record<string, unknown> : {};
                    await supabaseAdmin.from("messages").update({
                      content: editedText,
                      metadata: { ...emeta, edited: true, editedAt: new Date().toISOString() } as never,
                    }).eq("id", erow.id);
                  }
                }
                continue;
              }
              const evoId = findEvoId(u);
              const remoteJid = u?.key?.remoteJid ?? u?.remoteJid ?? u?.jid;
              const rawStatus =
                u?.status ?? u?.update?.status ?? u?.messageStatus ?? u?.ack ?? u?.update?.ack;
              if (!evoId || rawStatus === undefined || rawStatus === null) continue;
              // Evolution/Baileys sends either a string (SERVER_ACK/DELIVERY_ACK/READ/PLAYED)
              // or a numeric ack: 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED.
              const status = normalizeEvoStatus(rawStatus);
              if (!status) continue;
              let { data: rows } = await supabaseAdmin.from("messages")
                .select("id,metadata")
                .eq("user_id", conn.user_id)
                .eq("metadata->>evoId", evoId)
                .limit(1);
              if ((!rows || rows.length === 0) && remoteJid) {
                const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
                const fallback = await supabaseAdmin.from("messages")
                  .select("id,metadata")
                  .eq("user_id", conn.user_id)
                  .eq("direction", "outbound")
                  .in("metadata->>remoteJid", receiptRemoteJidCandidates(String(remoteJid)))
                  .gte("created_at", dayAgo)
                  .order("created_at", { ascending: false })
                  .limit(1);
                rows = fallback.data;
              }
              const row = rows?.[0];
              if (!row) continue;
              const meta = (row.metadata && typeof row.metadata === "object") ? row.metadata as Record<string, unknown> : {};
              const prev = String(meta.status ?? "");
              const rank = (v: string) => v === "read" ? 3 : v === "delivered" ? 2 : v === "sent" ? 1 : 0;
              if (rank(status) <= rank(prev)) continue;
              const now = new Date().toISOString();
              await supabaseAdmin.from("messages").update({
                metadata: {
                  ...meta,
                  status,
                  ...(status === "delivered" && !meta.delivered_at ? { delivered_at: now } : {}),
                  ...(status === "read" ? { delivered_at: meta.delivered_at ?? now, read_at: now } : {}),
                } as never,
              }).eq("id", row.id);
            }
          } catch { /* ignore */ }
          return Response.json({ ok: true });
        }

        // Incoming message → run agent → reply
        if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
          try {
            const msg = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
            // Edit arriving as upsert (protocolMessage type=14)
            const upsertEditedText = extractEditedText(msg);
            if (upsertEditedText !== null) {
              const originalEvoId = extractEditedTargetId(msg);
              if (originalEvoId) {
                const { data: erows } = await supabaseAdmin.from("messages")
                  .select("id,metadata")
                  .eq("user_id", conn.user_id)
                  .eq("metadata->>evoId", originalEvoId)
                  .limit(1);
                const erow = erows?.[0];
                if (erow) {
                  const emeta = (erow.metadata && typeof erow.metadata === "object") ? erow.metadata as Record<string, unknown> : {};
                  await supabaseAdmin.from("messages").update({
                    content: upsertEditedText,
                    metadata: { ...emeta, edited: true, editedAt: new Date().toISOString() } as never,
                  }).eq("id", erow.id);
                }
              }
              return Response.json({ ok: true, edited: true });
            }
            const fromMe = msg?.key?.fromMe;
            const remoteJid = msg?.key?.remoteJid as string | undefined;
            const bodyMsg = unwrapMessage(msg?.message);
            let text: string | undefined =
              bodyMsg?.conversation ??
              bodyMsg?.extendedTextMessage?.text ??
              bodyMsg?.imageMessage?.caption ??
              bodyMsg?.videoMessage?.caption ??
              bodyMsg?.documentMessage?.caption ??
              bodyMsg?.documentWithCaptionMessage?.message?.documentMessage?.caption;
            const audioMsg = bodyMsg?.audioMessage;
            const stickerMsg = bodyMsg?.stickerMessage;
            let transcribedAudioBase64: string | null = null;
            let inputWasAudio = false;
            if (!remoteJid) return Response.json({ ok: true, skipped: true });
            // Ignore broadcasts, newsletters and groups (safe default)
            if (
              remoteJid.endsWith("@broadcast") ||
              remoteJid.endsWith("@newsletter") ||
              remoteJid.endsWith("@g.us")
            ) {
              return Response.json({ ok: true, skippedJid: remoteJid });
            }
            // Normalize recipient. Evolution accepts digits or full jid;
            // full jid is safest (handles @lid and @s.whatsapp.net).
            const recipient = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;

            // Auto-save contact from incoming message
            try {
              const phone = remoteJid.split("@")[0]?.replace(/\D/g, "");
              // Ignore LIDs (WhatsApp internal IDs, not phone numbers) and
              // implausibly short numbers — they produce fake contacts like "93".
              const isLid = remoteJid.includes("@lid");
              const isValidPhone = !!phone && phone.length >= 8 && !isLid;
              // When fromMe, pushName is the operator's own WhatsApp profile name,
              // NOT the recipient — never save it as the contact's name.
              const pushName = fromMe
                ? undefined
                : ((msg?.pushName ?? msg?.notifyName) as string | undefined);
              if (isValidPhone) {
                const variants = phoneVariants(phone);
                const { data: existingContact } = await supabaseAdmin.from("contacts")
                  .select("id,name")
                  .eq("user_id", conn.user_id)
                  .in("phone", variants)
                  .limit(1)
                  .maybeSingle();
                if (existingContact?.id) {
                  // Never overwrite an existing name here — pushName can be the
                  // operator's own profile name when fromMe is misreported.
                  const patch: Record<string, unknown> = {
                    status: "active",
                    updated_at: new Date().toISOString(),
                  };
                  if (!existingContact.name && pushName && !fromMe) {
                    patch.name = pushName;
                  }
                  await supabaseAdmin.from("contacts").update(patch as never).eq("id", existingContact.id);
                } else {
                  await supabaseAdmin.from("contacts").insert({
                    user_id: conn.user_id,
                    phone,
                    name: fromMe ? null : (pushName ?? null),
                    source: "whatsapp",
                    status: "active",
                  } as never);
                }
              }
            } catch { /* non-blocking */ }

            const { data: agent } = await supabaseAdmin
              .from("agents")
              .select("id,system_prompt,temperature,max_tokens,is_active,tools,timezone,memory,knowledge")
              .eq("connection_id", conn.id).eq("is_active", true)
              .maybeSingle();
            const ext = ((agent?.tools ?? {}) as Ext);

            // Speech-to-text on inbound audio (always attempt so the agent can understand voice notes)
            if (!fromMe && !text && audioMsg) {
              try {
                const b64 = await evolutionGetBase64(commandConn, msg, true);
                if (b64) {
                  transcribedAudioBase64 = b64;
                  const transcript = await sttViaLovable(b64);
                  if (transcript) { text = transcript; inputWasAudio = true; }
                }
              } catch (e) {
                await supabaseAdmin.from("logs").insert({
                  user_id: conn.user_id, level: "warn", source: `evolution:${instance}`,
                  message: "stt failed", metadata: { err: e instanceof Error ? e.message : String(e) } as never,
                } as never);
              }
            }
            // Always persist inbound so the operator can chat manually,
            // even when there is no agent bound to this connection.
            const convo = await getOrCreateConversation(supabaseAdmin, conn, agent?.id ?? null, remoteJid);
            const cmeta: ConvMeta = (convo?.metadata ?? {}) as ConvMeta;
            const imageMsg = bodyMsg?.imageMessage;
            const videoMsg = bodyMsg?.videoMessage;
            const docMsg = bodyMsg?.documentMessage ?? bodyMsg?.documentWithCaptionMessage?.message?.documentMessage;

            // Outbound-from-operator (fromMe): mark manual takeover & pause agent
            if (fromMe) {
              if (agent && convo && (ext.conversation?.stopAfterManual || ext.timing?.humanIntervention)) {
                const reactHrs = Math.max(0, Number(ext.timing?.reactivation ?? 0));
                const until = reactHrs > 0
                  ? new Date(Date.now() + reactHrs * 3600_000).toISOString()
                  : new Date(Date.now() + 24 * 3600_000).toISOString();
                await supabaseAdmin.from("conversations").update({
                  metadata: { ...cmeta, last_manual_at: new Date().toISOString(), agent_paused_until: until },
                  follow_up_paused: true,
                } as never).eq("id", convo.id);
              }
              let mediaKind: "image" | "video" | "audio" | "document" | "sticker" | null = null;
              let mediaCaption: string | null = null;
              if (imageMsg) { mediaKind = "image"; mediaCaption = imageMsg.caption ?? null; }
              else if (videoMsg) { mediaKind = "video"; mediaCaption = videoMsg.caption ?? null; }
              else if (audioMsg) { mediaKind = "audio"; }
              else if (docMsg) { mediaKind = "document"; mediaCaption = docMsg.caption ?? docMsg.fileName ?? null; }
              else if (stickerMsg) { mediaKind = "sticker"; }
              const evoId = msg?.key?.id ?? null;
              let alreadySaved = false;
              if (evoId) {
                const { data: existing } = await supabaseAdmin.from("messages")
                  .select("id")
                  .eq("user_id", conn.user_id)
                  .eq("metadata->>evoId", evoId)
                  .limit(1);
                alreadySaved = !!existing?.length;
              }
              if (convo && !alreadySaved && mediaKind) {
                let mediaUrl: string | null = null;
                let mediaPath: string | null = null;
                let mediaMime: string | null = null;
                try {
                  mediaMime = imageMsg?.mimetype ?? videoMsg?.mimetype ?? audioMsg?.mimetype ?? docMsg?.mimetype ?? stickerMsg?.mimetype ?? (mediaKind === "sticker" ? "image/webp" : mediaKind === "audio" ? "audio/mpeg" : "application/octet-stream");
                  const mediaObject = imageMsg ?? videoMsg ?? audioMsg ?? docMsg ?? stickerMsg;
                  const fileName = docMsg?.fileName ?? `${mediaKind}-${evoId ?? Date.now()}`;
                  const externalUrl = findPlayableMediaUrl(msg) ?? findPlayableMediaUrl(payload);
                  const declaredBytes = mediaFileLength(mediaObject);
                  if (externalUrl) {
                    mediaUrl = externalUrl;
                  } else if (mediaKind === "video" || (declaredBytes ?? 0) > MAX_INLINE_MEDIA_BYTES) {
                    const streamed = await downloadEvolutionMediaToStorage(supabaseAdmin, commandConn, conn.user_id, convo.id, msg, mediaMime, fileName, declaredBytes);
                    if (streamed) {
                      mediaUrl = streamed.url;
                      mediaPath = streamed.path;
                      mediaMime = streamed.mime;
                    }
                  } else {
                    const b64 = findBase64(msg) ?? await evolutionGetBase64(commandConn, msg, false) ?? (mediaKind === "audio" ? transcribedAudioBase64 : null);
                    if (b64) {
                      const saved = await saveMediaToStorage(supabaseAdmin, conn.user_id, convo.id, b64, mediaMime ?? "application/octet-stream", fileName);
                      mediaUrl = saved.url;
                      mediaPath = saved.path;
                    }
                  }
                } catch (e) {
                  if (e instanceof MediaTooLargeError) {
                    await supabaseAdmin.from("logs").insert({
                      user_id: conn.user_id,
                      level: "warn",
                      source: "evolution:outbound-media",
                      message: e.message,
                      metadata: { remoteJid, kind: mediaKind, bytes: e.bytes, limit: MAX_INBOUND_MEDIA_BYTES } as never,
                    } as never);
                    mediaCaption = `⚠️ ${mediaLabel(mediaKind)} excede o limite de 200 MB e não foi salvo.`;
                  }
                }
                await supabaseAdmin.from("messages").insert({
                  user_id: conn.user_id, conversation_id: convo.id,
                  direction: "outbound", type: mediaKind,
                  content: mediaCaption ?? mediaLabel(mediaKind),
                  media_url: mediaUrl,
                  metadata: { remoteJid, instance: conn.instance_name, storagePath: mediaPath, mime: mediaMime, evoId, fromMe: true, manual: true, pending: false, sent: true, status: "sent" } as never,
                } as never);
                await supabaseAdmin.from("conversations").update({ last_message_at: new Date().toISOString() } as never).eq("id", convo.id);
              } else if (convo && !alreadySaved && text) {
                await supabaseAdmin.from("messages").insert({
                  user_id: conn.user_id, conversation_id: convo.id,
                  direction: "outbound", type: "text", content: text,
                  metadata: { remoteJid, agent_id: agent?.id ?? null, manual: true, evoId, fromMe: true, pending: false, sent: true, status: "sent" },
                } as never);
                await supabaseAdmin.from("conversations").update({ last_message_at: new Date().toISOString() } as never).eq("id", convo.id);
              }
              return Response.json({ ok: true, manualOutbound: true });
            }
            // Detect and persist inbound media (image/video/audio/document)
            let mediaKind: "image" | "video" | "audio" | "document" | "sticker" | null = null;
            let mediaUrl: string | null = null;
            let mediaCaption: string | null = null;
            let mediaPath: string | null = null;
            let mediaMime: string | null = null;
            let mediaB64: string | null = null;
            let mediaName: string | null = null;
            if (imageMsg) { mediaKind = "image"; mediaCaption = imageMsg.caption ?? null; }
            else if (videoMsg) { mediaKind = "video"; mediaCaption = videoMsg.caption ?? null; }
            else if (audioMsg) { mediaKind = "audio"; }
            else if (docMsg) { mediaKind = "document"; mediaCaption = docMsg.fileName ?? null; }
            else if (stickerMsg) { mediaKind = "sticker"; }
            const inboundEvoId = msg?.key?.id ?? null;
            let alreadySavedInbound = false;
            if (inboundEvoId) {
              const { data: existingInbound } = await supabaseAdmin.from("messages")
                .select("id")
                .eq("user_id", conn.user_id)
                .eq("metadata->>evoId", inboundEvoId)
                .limit(1);
              alreadySavedInbound = !!existingInbound?.length;
            }
            if (mediaKind && convo && !alreadySavedInbound) {
              try {
                mediaMime = imageMsg?.mimetype ?? videoMsg?.mimetype ?? audioMsg?.mimetype ?? docMsg?.mimetype ?? stickerMsg?.mimetype ?? (mediaKind === "sticker" ? "image/webp" : mediaKind === "audio" ? "audio/mpeg" : "application/octet-stream");
                mediaName = docMsg?.fileName ?? `${mediaKind}-${msg?.key?.id ?? Date.now()}`;
                const mediaObject = imageMsg ?? videoMsg ?? audioMsg ?? docMsg ?? stickerMsg;
                const externalUrl = findPlayableMediaUrl(msg) ?? findPlayableMediaUrl(payload);
                const declaredBytes = mediaFileLength(mediaObject);
                if (externalUrl) {
                  mediaUrl = externalUrl;
                } else if (mediaKind === "video" || (declaredBytes ?? 0) > MAX_INLINE_MEDIA_BYTES) {
                  const streamed = await downloadEvolutionMediaToStorage(supabaseAdmin, commandConn, conn.user_id, convo.id, msg, mediaMime, mediaName, declaredBytes);
                  if (streamed) {
                    mediaUrl = streamed.url;
                    mediaPath = streamed.path;
                    mediaMime = streamed.mime;
                  }
                } else {
                  const b64 = findBase64(msg) ?? await evolutionGetBase64(commandConn, msg, false) ?? (mediaKind === "audio" ? transcribedAudioBase64 : null);
                  if (b64) {
                    mediaB64 = b64;
                    const saved = await saveMediaToStorage(supabaseAdmin, conn.user_id, convo.id, b64, mediaMime ?? "application/octet-stream", mediaName);
                    mediaUrl = saved.url;
                    mediaPath = saved.path;
                  }
                }
              } catch (e) {
                if (e instanceof MediaTooLargeError) {
                  await supabaseAdmin.from("logs").insert({
                    user_id: conn.user_id,
                    level: "warn",
                    source: "evolution:inbound-media",
                    message: e.message,
                    metadata: { remoteJid, kind: mediaKind, bytes: e.bytes, limit: MAX_INBOUND_MEDIA_BYTES } as never,
                  } as never);
                  mediaCaption = `⚠️ ${mediaLabel(mediaKind)} recebido excede o limite de 200 MB e não foi salvo.`;
                }
              }
              await supabaseAdmin.from("messages").insert({
                user_id: conn.user_id, conversation_id: convo.id,
                direction: "inbound", type: mediaKind,
                content: inputWasAudio && text ? text : (mediaCaption ?? mediaLabel(mediaKind)),
                media_url: mediaUrl,
                metadata: { remoteJid, instance: conn.instance_name, storagePath: mediaPath, mime: mediaMime, evoId: inboundEvoId, fromMe: false, transcribed: inputWasAudio } as never,
              } as never);
              await supabaseAdmin.from("conversations").update({
                last_message_at: new Date().toISOString(),
                unread_count: (convo.unread_count ?? 0) + 1,
              } as never).eq("id", convo.id);
            }
            if (alreadySavedInbound) return Response.json({ ok: true, duplicate: true });
            // Allow AI to process pure media (image/pdf) without caption
            if (!text && !mediaB64) return Response.json({ ok: true, skipped: "no-text" });
            if (!text) text = mediaCaption ?? "";

            // Persist inbound message (only when we have a conversation — conversation_id is NOT NULL)
            if (convo && !mediaKind && !alreadySavedInbound) {
              await supabaseAdmin.from("messages").insert({
                user_id: conn.user_id,
                conversation_id: convo.id,
                direction: "inbound",
                type: inputWasAudio ? "audio" : "text",
                content: text,
                metadata: { remoteJid, instance: conn.instance_name, transcribed: inputWasAudio, evoId: inboundEvoId, fromMe: false },
              } as never);
            }
            if (convo) {
              await supabaseAdmin.from("conversations").update({
                last_message_at: new Date().toISOString(),
                unread_count: (convo.unread_count ?? 0) + 1,
                follow_up_step: 0, next_follow_up_at: null, follow_up_paused: false,
              } as never).eq("id", convo.id);
            }
            if (!agent) return Response.json({ ok: true, noAgent: true });

            // Agent paused by human intervention window?
            if (cmeta.agent_paused_until && new Date(cmeta.agent_paused_until).getTime() > Date.now()) {
              return Response.json({ ok: true, paused: true });
            }

            // ------- FLOW ENGINE -------
            // If this connection has an active flow (with a valid START node), run it
            // instead of going straight to the AI. QUESTION/YESNO/CAPTURE_NAME pause
            // the flow and the next inbound resumes it via `flow_state` on the conversation.
            {
              const { data: flows } = await supabaseAdmin
                .from("flows")
                .select("id,definition,is_active,trigger,trigger_keywords,connection_id")
                .eq("user_id", conn.user_id)
                .eq("is_active", true);
              const candidates = (flows ?? []) as Array<{ id: string; definition: any; trigger: string | null; trigger_keywords: string[] | null; connection_id: string | null }>;
              // Prefer flow already in progress; else match by connection + keyword; else first for this connection.
              const st = ((convo?.flow_state ?? {}) as { flow_id?: string; finished?: boolean });
              let active = st.flow_id && !st.finished ? candidates.find((f) => f.id === st.flow_id) : null;
              if (!active) {
                const forConn = candidates.filter((f) => !f.connection_id || f.connection_id === conn.id);
                const kwList = (f: typeof forConn[number]) => [
                  ...(f.trigger_keywords ?? []),
                  ...(f.trigger ?? "").split(",").map((s) => s.trim()).filter(Boolean),
                ];
                active = forConn.find((f) => kwList(f).some((k) => k && text!.toLowerCase().includes(k.toLowerCase())))
                  ?? forConn.find((f) => kwList(f).length === 0)
                  ?? null;
              }
              if (active && convo) {
                try {
                  const def = active.definition as { nodes?: any[]; edges?: any[] };
                  if (Array.isArray(def?.nodes) && Array.isArray(def?.edges)) {
                    const { runFlow } = await import("@/lib/flow-runner.server");
                    const result = await runFlow({
                      db: supabaseAdmin,
                      conn: { id: conn.id, user_id: conn.user_id, url_api: conn.url_api, api_key: commandConn.api_key, instance_name: conn.instance_name },
                      recipient,
                      userText: text,
                      def: { nodes: def.nodes, edges: def.edges },
                      state: st,
                      flowId: active.id,
                    });
                    await supabaseAdmin.from("conversations").update({
                      flow_state: result.state as never,
                      last_message_at: new Date().toISOString(),
                    } as never).eq("id", convo.id);
                    return Response.json({ ok: true, flow: active.id, waiting: !!result.waitingForUser, finished: !!result.finished, handedOff: !!result.handedOff });
                  }
                } catch (e) {
                  await supabaseAdmin.from("logs").insert({
                    user_id: conn.user_id, level: "error", source: `flow:${active.id}`,
                    message: e instanceof Error ? e.message : "flow runtime error", metadata: {} as never,
                  } as never);
                  // fall through to AI as safety net
                }
              }
            }
            // ------- /FLOW ENGINE -------

            // Keyword activation gate (allow/block/regex)
            if (ext.keywords?.enabled && Array.isArray(ext.keywords.list) && ext.keywords.list.length) {
              const mode = (ext.keywords.mode ?? "allow").toLowerCase();
              const matched = ext.keywords.list.some((k) => {
                if (!k) return false;
                if (mode === "regex") { try { return new RegExp(k, "i").test(text); } catch { return false; } }
                return text.toLowerCase().includes(k.toLowerCase());
              });
              if ((mode === "allow" && !matched) || (mode === "activate" && !matched) || (mode === "block" && matched) || (mode === "ignore" && matched)) {
                await supabaseAdmin.from("logs").insert({
                  user_id: conn.user_id, level: "info", source: `evolution:${instance}`,
                  message: "blocked by keyword rule", metadata: { remoteJid, mode } as never,
                } as never);
                return Response.json({ ok: true, skippedByKeyword: true });
              }
            }

            // Working hours gate (weekday + window + optional lunch + blockedDates)
            if (ext.hours?.enabled && ext.hours.start && ext.hours.end) {
              const tz = agent.timezone || "America/Sao_Paulo";
              const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour12: false });
              const parts = fmt.formatToParts(new Date());
              const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
              const nowMin = Number(get("hour")) * 60 + Number(get("minute"));
              const wd = get("weekday").toLowerCase();
              const iso = `${get("year")}-${get("month")}-${get("day")}`;
              const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
              const inHours = nowMin >= toMin(ext.hours.start) && nowMin <= toMin(ext.hours.end);
              const daysOk = !ext.hours.days?.length || ext.hours.days.map((d) => d.toLowerCase().slice(0, 3)).includes(wd);
              const inLunch = !!(ext.hours.lunch && ext.hours.lunchStart && ext.hours.lunchEnd &&
                nowMin >= toMin(ext.hours.lunchStart) && nowMin <= toMin(ext.hours.lunchEnd));
              const blocked = (ext.hours.blockedDates ?? []).includes(iso);
              if (!inHours || !daysOk || inLunch || blocked) {
                const away = ext.timing?.unknownMsg || "Estamos fora do horário de atendimento. Retornaremos em breve.";
                await sendText(commandConn, recipient, away);
                return Response.json({ ok: true, offHours: true });
              }
            }

            // Debounce (wait): join rapid-fire messages into a single reply
            const waitSec = Math.max(0, Number(ext.timing?.wait ?? 0));
            const singleMessage = !!ext.conversation?.singleMessage;
            if (convo && (waitSec > 0 || singleMessage)) {
              const pendingUntil = new Date(Date.now() + Math.max(waitSec, 3) * 1000).toISOString();
              const pending = Array.isArray(cmeta.pending_texts) ? cmeta.pending_texts.slice(-10) : [];
              pending.push(text);
              await supabaseAdmin.from("conversations").update({
                metadata: { ...cmeta, pending_until: pendingUntil, pending_texts: pending },
              } as never).eq("id", convo.id);

              await sleep(Math.min(Math.max(waitSec, 3), 20) * 1000);

              const { data: fresh } = await supabaseAdmin.from("conversations")
                .select("id,metadata").eq("id", convo.id).maybeSingle();
              const fm = (fresh?.metadata ?? {}) as ConvMeta;
              // If another message came in after us (pending_until moved forward), let that one respond
              if (fm.pending_until && new Date(fm.pending_until).getTime() > new Date(pendingUntil).getTime() + 500) {
                return Response.json({ ok: true, debounced: true });
              }
              // cancelOnNew: if newer inbound arrived while we waited, abort
              if (ext.conversation?.cancelOnNew && (fm.pending_texts?.length ?? 0) > pending.length) {
                return Response.json({ ok: true, cancelledByNewer: true });
              }
            }

            // Compose full inbound text (single-message merge)
            const { data: convFull } = convo
              ? await supabaseAdmin.from("conversations").select("metadata").eq("id", convo.id).maybeSingle()
              : { data: null };
            const meta2 = (convFull?.metadata ?? {}) as ConvMeta;
            const mergedInbound = singleMessage && meta2.pending_texts?.length
              ? meta2.pending_texts.join("\n")
              : text;

            // Memory: last N messages of this conversation
            const memN = Math.max(0, Math.min(100, Number((agent.memory as { messages?: number } | null)?.messages ?? 20)));
            let history: Array<{ role: "user" | "assistant"; content: string }> = [];
            if (convo && memN > 0) {
              const { data: prev } = await supabaseAdmin
                .from("messages")
                .select("direction,content,created_at")
                .eq("conversation_id", convo.id)
                .order("created_at", { ascending: false })
                .limit(memN);
              history = ((prev ?? []) as Array<{ direction: string; content: string }>)
                .reverse()
                .filter((r) => r.content)
                .map((r) => ({ role: r.direction === "outbound" ? "assistant" : "user", content: r.content }));
            }

            // Build endpoint + key from Configurações Globais (ai_providers ativo do dono da conexão).
            const { resolveAIConfig } = await import("@/lib/ai-resolver.server");
            const { checkAiBalance, consumeAiTokens, InsufficientCreditsError } = await import("@/lib/ai-credits.server");
            const { endpoint, apiKey, model: modelId } = await resolveAIConfig(supabaseAdmin, conn.user_id);

            // Pre-check AI credit wallet — block gracefully if empty.
            const bal = await checkAiBalance(supabaseAdmin, conn.user_id);
            if (!bal.ok) {
              await supabaseAdmin.from("logs").insert({
                user_id: conn.user_id, level: "warn", source: `evolution:${instance}`,
                message: "AI credits exhausted", metadata: { remaining: bal.remaining } as never,
              } as never);
              await maybeAlert(supabaseAdmin, commandConn, agent, ext, "Créditos de IA esgotados. Compre créditos para o agente voltar a responder.");
              return Response.json({ ok: true, creditsBlocked: true });
            }

            const aiRes = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: modelId,
                temperature: Number(agent.temperature ?? 0.7),
                max_tokens: agent.max_tokens ?? 2048,
                messages: [
                  ...(() => {
                    const kbEnabled = ((agent.memory as { knowledgeEnabled?: boolean } | null)?.knowledgeEnabled ?? true);
                    const items = (agent.knowledge as Array<{ title?: string; content?: string; enabled?: boolean }> | null) ?? [];
                    const kb = kbEnabled ? items.filter((k) => (k.enabled ?? true) && (k.content ?? "").trim()) : [];
                    const kbText = kb.length
                      ? "\n\n## Base de Conhecimento\n" + kb.map((k) => `### ${k.title ?? "Item"}\n${k.content}`).join("\n\n")
                      : "";
                    const sys = (agent.system_prompt ?? "") + kbText;
                    return sys.trim() ? [{ role: "system", content: sys }] : [];
                  })(),
                  ...history,
                  (() => {
                    if (mediaB64 && (mediaKind === "image" || mediaKind === "document" || mediaKind === "video")) {
                      const dataUri = `data:${mediaMime ?? "application/octet-stream"};base64,${mediaB64}`;
                      const parts: Array<Record<string, unknown>> = [];
                      const textPart = (mergedInbound ?? "").trim() || (mediaKind === "image" ? "Analise esta imagem." : mediaKind === "video" ? "Analise este vídeo." : "Analise este arquivo.");
                      parts.push({ type: "text", text: textPart });
                      if (mediaKind === "image") {
                        parts.push({ type: "image_url", image_url: { url: dataUri } });
                      } else {
                        parts.push({ type: "file", file: { filename: mediaName ?? "arquivo", file_data: dataUri } });
                      }
                      return { role: "user", content: parts };
                    }
                    return { role: "user", content: mergedInbound };
                  })(),
                ],
              }),
            });
            const aiJson = await aiRes.json().catch(() => ({} as any));
            let reply: string = aiJson?.choices?.[0]?.message?.content ?? "";
            // Debit tokens consumed from the wallet. Block on 402/insufficient.
            try {
              await consumeAiTokens(supabaseAdmin, {
                userId: conn.user_id,
                agentId: agent.id,
                model: modelId,
                inputTokens: Number(aiJson?.usage?.prompt_tokens ?? 0),
                outputTokens: Number(aiJson?.usage?.completion_tokens ?? 0),
              });
            } catch (e) {
              if (e instanceof InsufficientCreditsError) {
                await supabaseAdmin.from("logs").insert({
                  user_id: conn.user_id, level: "warn", source: `evolution:${instance}`,
                  message: "AI credits insufficient on debit", metadata: { remaining: e.remaining } as never,
                } as never);
                await maybeAlert(supabaseAdmin, commandConn, agent, ext, "Créditos de IA esgotados. Compre créditos para o agente voltar a responder.");
                return Response.json({ ok: true, creditsBlocked: true });
              }
              throw e;
            }
            if (!reply) reply = ext.timing?.unknownMsg ?? "";
            if (!reply) return Response.json({ ok: true, empty: true });

            // Enforce plan send quota (daily/monthly) before dispatch
            const { data: quota } = await supabaseAdmin.rpc("consume_send_quota" as never, { _user_id: conn.user_id } as never);
            const q = (quota ?? {}) as { allowed?: boolean; reason?: string; limit?: number; used?: number };
            if (q && q.allowed === false) {
              await supabaseAdmin.from("logs").insert({
                user_id: conn.user_id, level: "warn", source: `evolution:${instance}`,
                message: `quota exceeded: ${q.reason}`, metadata: q as never,
              } as never);
              await maybeAlert(supabaseAdmin, commandConn, agent, ext, `Cota atingida: ${q.reason}`);
              return Response.json({ ok: true, quotaBlocked: true, reason: q.reason });
            }

            // Artificial "typing" delay: delayChar (ms/char) capped at delayMax (s), max 20s
            const perChar = Math.max(0, Number(ext.timing?.delayChar ?? 0));
            // delayMax is stored/displayed in milliseconds (label "Delay Máximo (ms)")
            const maxDelayMs = Math.max(0, Number(ext.timing?.delayMax ?? 0));
            if (perChar > 0) {
              const ms = Math.min(reply.length * perChar, maxDelayMs || 20_000, 20_000);
              if (ms > 0) await sleep(ms);
            }

            // Media attachments (keyword-triggered) sent before/instead of text
            let mediaSent = false;
            if (ext.media?.enabled && Array.isArray(ext.media.items)) {
              for (const it of ext.media.items) {
                if (!it.storage_path) continue;
                const shouldSend =
                  it.mode === "all" ||
                  (it.mode === "keyword" && (it.keywords ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => text!.toLowerCase().includes(k))) ||
                  (it.mode === "ai" && (it.description ?? "") && reply.toLowerCase().includes((it.description ?? "").toLowerCase().slice(0, 20)));
                if (!shouldSend) continue;
                const url = await signedMediaUrl(supabaseAdmin, it.storage_path);
                if (!url) continue;
                await sendMedia(commandConn, recipient, url, it.mime ?? "", it.name);
                mediaSent = true;
              }
            }

            // Decide audio vs text reply
            const wantsAudio = !!ext.audio?.enabled && (
              (ext.audio.mirrorFormat && inputWasAudio) ||
              (ext.audio.smartAudio && reply.length >= Math.max(30, Number(ext.audio.smartAudioChars ?? 120)))
            );
            let sendRes: Response | null = null;
            if (wantsAudio) {
              try {
                const audioB64 = await ttsViaLovable(reply, ext.audio?.voice);
                if (audioB64) {
                  sendRes = await sendAudio(commandConn, recipient, audioB64);
                }
              } catch (e) {
                await supabaseAdmin.from("logs").insert({
                  user_id: conn.user_id, level: "warn", source: `evolution:${instance}`,
                  message: "tts failed", metadata: { err: e instanceof Error ? e.message : String(e) } as never,
                } as never);
              }
            }
            if (!wantsAudio || !ext.audio?.replaceText) {
              if (!sendRes || !wantsAudio) sendRes = await sendText(commandConn, recipient, reply);
            }
            let sendJson: any = null;
            let sendBody = "";
            if (sendRes) {
              sendBody = await sendRes.text().catch(() => "");
              try { sendJson = sendBody ? JSON.parse(sendBody) : null; } catch { sendJson = null; }
            }
            if (sendRes && !sendRes.ok) {
              await supabaseAdmin.from("logs").insert({
                user_id: conn.user_id, level: "error", source: `evolution:${instance}`,
                message: `send failed ${sendRes.status}`, metadata: { recipient, body: sendBody.slice(0, 500) },
              } as never);
              await maybeAlert(supabaseAdmin, commandConn, agent, ext, `Falha ao enviar (${sendRes.status})`);
            }
            void mediaSent;

            if (convo) {
              const evoId = findEvoId(sendJson);
              const status = normalizeEvoStatus(sendJson?.status ?? sendJson?.ack ?? sendJson?.messageStatus) ?? (sendRes?.ok ? "sent" : null);
              await supabaseAdmin.from("messages").insert({
                user_id: conn.user_id,
                conversation_id: convo.id,
                direction: "outbound",
                type: wantsAudio ? "audio" : "text",
                content: reply,
                metadata: {
                  remoteJid,
                  agent_id: agent.id,
                  audio: wantsAudio,
                  media_sent: mediaSent,
                  pending: false,
                  sent: !!sendRes?.ok,
                  ...(evoId ? { evoId } : {}),
                  ...(status ? { status } : {}),
                },
              } as never);
            }

            // Clear debounce buffer and (optionally) unread badge
            if (convo) {
              const clearMeta: ConvMeta = { ...meta2, pending_texts: [], pending_until: undefined };
              const patch: Record<string, unknown> = { metadata: clearMeta, last_message_at: new Date().toISOString() };
              if (!ext.conversation?.keepUnread) patch.unread_count = 0;
              await supabaseAdmin.from("conversations").update(patch as never).eq("id", convo.id);
            }
          } catch (e) {
            await supabaseAdmin.from("logs").insert({
              user_id: conn.user_id, level: "error", source: `evolution:${instance}`,
              message: e instanceof Error ? e.message : "agent runtime error", metadata: {},
            } as never);
          }
        }

        return Response.json({ ok: true });
      },
      GET: async ({ params }) =>
        Response.json({ ok: true, instance: params.instance, hint: "POST events here" }),
    },
  },
});

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function sendText(conn: { url_api: string | null; api_key: string | null; instance_name: string | null }, number: string, text: string) {
  return fetch(`${normalizeBaseUrl(conn.url_api ?? "")}/message/sendText/${conn.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
    body: JSON.stringify({ number, text }),
  });
}

async function sendAudio(conn: { url_api: string | null; api_key: string | null; instance_name: string | null }, number: string, audioBase64: string) {
  return fetch(`${normalizeBaseUrl(conn.url_api ?? "")}/message/sendWhatsAppAudio/${conn.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
    body: JSON.stringify({ number, audio: audioBase64 }),
  });
}

async function sendMedia(
  conn: { url_api: string | null; api_key: string | null; instance_name: string | null },
  number: string, url: string, mime: string, fileName: string,
) {
  const mediatype = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
  return fetch(`${normalizeBaseUrl(conn.url_api ?? "")}/message/sendMedia/${conn.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
    body: JSON.stringify({ number, mediatype, media: url, fileName, mimetype: mime }),
  });
}

async function signedMediaUrl(db: { storage: { from: (b: string) => { createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null }> } } }, path: string) {
  const { data } = await db.storage.from("agent-media").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

async function evolutionGetBase64(conn: { url_api: string | null; api_key: string | null; instance_name: string | null }, message: unknown, convertToMp3 = false): Promise<string | null> {
  const r = await fetch(`${normalizeBaseUrl(conn.url_api ?? "")}/chat/getBase64FromMediaMessage/${conn.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
    body: JSON.stringify({ message, convertToMp3 }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null) as unknown;
  return findBase64(j);
}

function mediaLabel(kind: "image" | "video" | "audio" | "document" | "sticker") {
  return kind === "audio" ? "[áudio]"
    : kind === "video" ? "[vídeo]"
      : kind === "image" ? "[imagem]"
        : kind === "sticker" ? "[figurinha]"
          : "[arquivo]";
}

function normalizeBaseUrl(url: string) {
  let u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
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
  db: { storage: { from: (bucket: string) => any } },
  userId: string,
  conversationId: string,
  base64: string,
  mime: string,
  fileName: string,
) {
  const clean = stripDataUri(base64).replace(/\s/g, "");
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "media";
  const ext = safeName.includes(".") ? "" : `.${(mime.split("/")[1] || "bin").split(";")[0]}`;
  const path = `${userId}/${conversationId}/${Date.now()}-${crypto.randomUUID()}-${safeName}${ext}`;
  const bytes = Buffer.from(clean, "base64");
  if (bytes.byteLength > MAX_INBOUND_MEDIA_BYTES) {
    throw new MediaTooLargeError(bytes.byteLength);
  }
  const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, bytes, {
    contentType: mime || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
  return { path, url: data?.signedUrl ?? null };
}

function unwrapMessage(message: any): any {
  let current = message;
  for (let i = 0; i < 5; i++) {
    const next =
      current?.ephemeralMessage?.message ??
      current?.viewOnceMessage?.message ??
      current?.viewOnceMessageV2?.message ??
      current?.documentWithCaptionMessage?.message;
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

function stripDataUri(value: string) {
  return value.replace(/^data:[^;]+;base64,/, "");
}

function findBase64(value: unknown, depth = 0): string | null {
  if (!value || depth > 6) return null;
  if (typeof value === "string") {
    const clean = stripDataUri(value.trim());
    if (clean.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(clean)) return clean.replace(/\s/g, "");
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBase64(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["base64", "media", "file", "buffer"]) {
      const found = findBase64(record[key], depth + 1);
      if (found) return found;
    }
    for (const nested of Object.values(record)) {
      const found = findBase64(nested, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function sttViaLovable(audioBase64: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY ?? "";
  if (!key) return null;
  const bin = Buffer.from(audioBase64, "base64");
  const blob = new Blob([new Uint8Array(bin)], { type: "audio/mpeg" });
  const fd = new FormData();
  fd.append("file", blob, "audio.mp3");
  fd.append("model", "openai/gpt-4o-mini-transcribe");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd,
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null) as { text?: string } | null;
  return j?.text ?? null;
}

async function ttsViaLovable(text: string, voice?: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY ?? "";
  if (!key) return null;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "openai/gpt-4o-mini-tts", input: text.slice(0, 3000), voice: voice || "alloy", response_format: "mp3" }),
  });
  if (!r.ok) return null;
  const buf = await r.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

async function getOrCreateConversation(
  db: { from: (t: string) => any },
  conn: { id: string; user_id: string },
  agentId: string | null,
  remoteJid: string,
) {
  const variants = jidVariants(remoteJid);
  const { data: rows } = await db.from("conversations")
    .select("id,unread_count,metadata,follow_up_step,next_follow_up_at,follow_up_paused,flow_state")
    .eq("user_id", conn.user_id).eq("connection_id", conn.id);
  const existing = (rows ?? []).find((row: { metadata?: { remoteJid?: string } }) => variants.includes(row?.metadata?.remoteJid ?? ""));
  if (existing) return existing;
  const { data: created } = await db.from("conversations").insert({
    user_id: conn.user_id, connection_id: conn.id, agent_id: agentId, status: "open",
    unread_count: 0, last_message_at: new Date().toISOString(),
    metadata: { remoteJid } as never,
  }).select("id,unread_count,metadata,follow_up_step,next_follow_up_at,follow_up_paused,flow_state").maybeSingle();
  return created;
}

async function maybeAlert(
  db: { from: (t: string) => any },
  conn: { user_id: string; url_api: string | null; api_key: string | null; instance_name: string | null },
  agent: { id: string } | null,
  ext: Ext,
  message: string,
) {
  if (!ext.alerts?.whatsapp || !agent) return;
  const { data: prof } = await db.from("profiles").select("alert_phone").eq("id", conn.user_id).maybeSingle();
  const to = prof?.alert_phone;
  if (!to) return;
  const number = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
  await sendText(conn, number, `⚠️ ${message}`);
  await db.from("logs").insert({
    user_id: conn.user_id, level: "warn", source: "alerts",
    message, metadata: { agent_id: agent.id } as never,
  });
}