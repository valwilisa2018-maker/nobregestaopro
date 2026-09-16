// Server-only Evolution API helpers. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EvolutionConfig = { url: string; key: string; integrationName: string | null };

export type ConnectionState =
  | "connected"
  | "connecting"
  | "qrcode"
  | "disconnected"
  | "error"
  | "disabled";

export const WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
];

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function maskKey(key?: string | null) {
  if (!key) return null;
  const tail = key.slice(-4);
  return `${"•".repeat(16)}${tail}`;
}

/** Reads the stored Evolution API settings, falling back to environment values. */
export async function loadEvolutionConfig(): Promise<EvolutionConfig | null> {
  const { data } = await supabaseAdmin
    .from("evolution_settings")
    .select("api_url, api_key, integration_name")
    .eq("id", true)
    .maybeSingle();

  const url = (data?.api_url || process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
  const key = data?.api_key || process.env.EVOLUTION_API_KEY || "";
  if (!url || !key) return null;
  return { url, key, integrationName: data?.integration_name ?? null };
}

export async function requireEvolutionConfig(): Promise<EvolutionConfig> {
  const config = await loadEvolutionConfig();
  if (!config) {
    throw new Error("Evolution API não configurada. Configure a URL e a API Key primeiro.");
  }
  return config;
}

export function publicAppUrl() {
  const configured = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  return configured || "https://nobregestaopro.lovable.app";
}

export function webhookUrl() {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
  const query = secret ? `?token=${encodeURIComponent(secret)}` : "";
  return `${publicAppUrl()}/api/public/evolution-webhook${query}`;
}

export function webhookUrlForDisplay() {
  return `${publicAppUrl()}/api/public/evolution-webhook`;
}

type JsonValue = unknown;

export type EvoResult = { ok: boolean; status: number; body: JsonValue; message?: string };

/** Raw call to the Evolution API. Never throws for HTTP errors — inspect `ok`. */
export async function evoCall(
  path: string,
  init: RequestInit & { timeoutMs?: number; config?: EvolutionConfig } = {},
): Promise<EvoResult> {
  const { timeoutMs = 45000, config, ...rest } = init;
  const cfg = config ?? (await requireEvolutionConfig());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.key,
        ...(rest.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: JsonValue = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        body,
        message:
          res.status === 401 || res.status === 403
            ? "Erro de autenticação: verifique a API Key."
            : `A Evolution API respondeu com erro ${res.status}.`,
      };
    }
    return { ok: true, status: res.status, body };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: null,
      message: "Não foi possível falar com a Evolution API. Verifique a URL e se o servidor está no ar.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Throwing variant for internal flows. */
export async function evoFetch(path: string, init: Parameters<typeof evoCall>[1] = {}) {
  const result = await evoCall(path, init);
  if (!result.ok) throw new Error(result.message ?? "Falha na Evolution API");
  return result.body;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nested(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return typeof current === "string" ? current : null;
}

export function extractQr(result: unknown): string | null {
  if (typeof result === "string" && result.length > 50) return result;
  const candidates = [
    nested(result, ["base64"]),
    nested(result, ["code"]),
    nested(result, ["qrcode", "base64"]),
    nested(result, ["qrcode", "code"]),
    nested(result, ["qrcode"]),
    nested(result, ["qr", "base64"]),
    nested(result, ["qr", "code"]),
    nested(result, ["data", "base64"]),
    nested(result, ["data", "code"]),
    nested(result, ["data", "qrcode", "base64"]),
    nested(result, ["instance", "qrcode", "base64"]),
  ];
  return candidates.find((c) => typeof c === "string" && c.length > 50) ?? null;
}

export function normalizeState(raw?: string | null): ConnectionState {
  const value = (raw ?? "").toLowerCase();
  if (!value) return "disconnected";
  if (["open", "connected", "online"].includes(value)) return "connected";
  if (value.includes("qr")) return "qrcode";
  if (["connecting", "start", "starting", "syncing"].includes(value)) return "connecting";
  if (["close", "closed", "disconnected", "logout"].includes(value)) return "disconnected";
  if (value.includes("error") || value.includes("unreachable")) return "error";
  return "connecting";
}

export function extractState(result: unknown) {
  return (
    nested(result, ["instance", "state"]) ??
    nested(result, ["instance", "connectionStatus"]) ??
    nested(result, ["state"]) ??
    nested(result, ["status"]) ??
    nested(result, ["connection"]) ??
    null
  );
}

export function extractNumber(result: unknown) {
  const raw =
    nested(result, ["instance", "owner"]) ??
    nested(result, ["instance", "number"]) ??
    nested(result, ["owner"]) ??
    nested(result, ["number"]) ??
    null;
  return raw ? raw.replace(/@.*/, "") : null;
}

export function extractProfilePic(result: unknown) {
  return (
    nested(result, ["instance", "profilePictureUrl"]) ??
    nested(result, ["profilePictureUrl"]) ??
    nested(result, ["profilePicUrl"]) ??
    null
  );
}

/** Normalizes a Brazilian phone number to the Evolution/WhatsApp format (with DDI 55). */
export function normalizePhone(raw?: string | null): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length <= 11) {
    if (digits.length < 10) return null;
    digits = `55${digits}`;
  }
  if (digits.startsWith("55") && (digits.length < 12 || digits.length > 13)) return null;
  return digits;
}

export function slugifyInstance(raw: string) {
  return (
    raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `wpp-${Date.now()}`
  );
}

export async function setInstanceWebhook(instanceName: string, config?: EvolutionConfig) {
  const url = webhookUrl();
  const payloads = [
    {
      webhook: {
        enabled: true,
        url,
        webhookByEvents: false,
        webhookBase64: true,
        byEvents: false,
        base64: true,
        events: WEBHOOK_EVENTS,
      },
    },
    {
      enabled: true,
      url,
      webhook_by_events: false,
      webhook_base64: true,
      events: WEBHOOK_EVENTS,
    },
  ];
  for (const body of payloads) {
    const result = await evoCall(`/webhook/set/${instanceName}`, {
      method: "POST",
      timeoutMs: 10000,
      body: JSON.stringify(body),
      ...(config ? { config } : {}),
    });
    if (result.ok) return true;
  }
  return false;
}

export async function sendWhatsappText(
  instanceName: string,
  phone: string,
  text: string,
  config?: EvolutionConfig,
) {
  const number = normalizePhone(phone);
  if (!number) return { ok: false, message: "Número de telefone inválido." };
  const result = await evoCall(`/message/sendText/${instanceName}`, {
    method: "POST",
    timeoutMs: 30000,
    body: JSON.stringify({ number, text, textMessage: { text } }),
    ...(config ? { config } : {}),
  });
  if (!result.ok) {
    return { ok: false, message: result.message ?? "Falha no envio." };
  }
  const id =
    nested(result.body, ["key", "id"]) ?? nested(result.body, ["messageId"]) ?? null;
  return { ok: true, externalId: id, body: result.body };
}

export async function refreshConnectionState(instanceName: string, config?: EvolutionConfig) {
  const result = await evoCall(`/instance/connectionState/${instanceName}`, {
    timeoutMs: 12000,
    ...(config ? { config } : {}),
  });
  if (!result.ok) {
    await supabaseAdmin
      .from("whatsapp_connections")
      .update({ state: "error", last_event: "STATUS_UNREACHABLE" })
      .eq("instance_name", instanceName);
    return { state: "error" as ConnectionState, message: result.message };
  }
  const state = normalizeState(extractState(result.body));
  const number = extractNumber(result.body);
  const patch: Record<string, unknown> = { state, last_event: "STATUS_CHECK" };
  if (number) patch.phone_number = number;
  if (state === "connected") patch.connected_at = new Date().toISOString();
  await supabaseAdmin.from("whatsapp_connections").update(patch as never).eq("instance_name", instanceName);
  return { state, number };
}

export async function logAudit(action: string, details: Record<string, unknown>, userEmail?: string | null, userId?: string | null) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      action,
      details: details as never,
      performed_by: userId ?? null,
      performed_by_email: userEmail ?? null,
    });
  } catch (e) {
    console.warn("[whatsapp] audit failed", errorMessage(e));
  }
}

/** Envia imagem ou vídeo por URL. */
export async function sendWhatsappMedia(
  instanceName: string,
  phone: string,
  input: { mediatype: "image" | "video" | "document"; url: string; caption?: string | null },
  config?: EvolutionConfig,
) {
  const number = normalizePhone(phone);
  if (!number) return { ok: false, message: "Número de telefone inválido." };
  if (!input.url) return { ok: false, message: "Informe o endereço do arquivo." };
  const payload = {
    number,
    mediatype: input.mediatype,
    media: input.url,
    caption: input.caption ?? "",
    mediaMessage: { mediatype: input.mediatype, media: input.url, caption: input.caption ?? "" },
  };
  const result = await evoCall(`/message/sendMedia/${instanceName}`, {
    method: "POST",
    timeoutMs: 45000,
    body: JSON.stringify(payload),
    ...(config ? { config } : {}),
  });
  if (!result.ok) return { ok: false, message: result.message ?? "Falha no envio do arquivo." };
  return { ok: true, body: result.body };
}

/** Envia áudio (mensagem de voz) por URL. */
export async function sendWhatsappAudio(
  instanceName: string,
  phone: string,
  url: string,
  config?: EvolutionConfig,
) {
  const number = normalizePhone(phone);
  if (!number) return { ok: false, message: "Número de telefone inválido." };
  if (!url) return { ok: false, message: "Informe o endereço do áudio." };
  const result = await evoCall(`/message/sendWhatsAppAudio/${instanceName}`, {
    method: "POST",
    timeoutMs: 45000,
    body: JSON.stringify({ number, audio: url, audioMessage: { audio: url } }),
    ...(config ? { config } : {}),
  });
  if (!result.ok) return { ok: false, message: result.message ?? "Falha no envio do áudio." };
  return { ok: true, body: result.body };
}

/** Mostra "digitando..." ou "gravando áudio..." na conversa do cliente. */
export async function sendWhatsappPresence(
  instanceName: string,
  phone: string,
  presence: "composing" | "recording",
  seconds: number,
  config?: EvolutionConfig,
) {
  const number = normalizePhone(phone);
  if (!number) return { ok: false, message: "Número de telefone inválido." };
  const delay = Math.max(1, Math.min(20, Math.round(seconds || 3))) * 1000;
  const result = await evoCall(`/chat/sendPresence/${instanceName}`, {
    method: "POST",
    timeoutMs: 15000,
    body: JSON.stringify({ number, presence, delay }),
    ...(config ? { config } : {}),
  });
  return { ok: result.ok, message: result.message, delay };
}
