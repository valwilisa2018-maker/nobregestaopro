import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getConfig() {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) throw new Error("Evolution API não configurada");
  return { url: url.replace(/\/$/, ""), key };
}

function getWebhookUrl() {
  const base =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://nobregestaopro.lovable.app";
  return `${base}/api/public/evolution-webhook`;
}

const WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
];

type EvoFetchInit = RequestInit & { timeoutMs?: number };

type LooseRecord = Record<string, unknown>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "erro";
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" ? (value as LooseRecord) : {};
}

function nestedString(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return typeof current === "string" ? current : null;
}

function hasQr(result: unknown) {
  return Boolean(nestedString(result, ["base64"]) || nestedString(result, ["qrcode", "base64"]));
}

async function setInstanceWebhook(instanceName: string) {
  const webhookUrl = getWebhookUrl();
  // Evolution v2 shape
  try {
    return await evoFetch(`/webhook/set/${instanceName}`, {
      method: "POST",
      timeoutMs: 8000,
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: WEBHOOK_EVENTS,
        },
      }),
    });
  } catch {
    // Fallback older shape
    return await evoFetch(`/webhook/set/${instanceName}`, {
      method: "POST",
      timeoutMs: 8000,
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: true,
        events: WEBHOOK_EVENTS,
      }),
    });
  }
}

async function evoFetch(path: string, init: EvoFetchInit = {}) {
  const { url, key } = getConfig();
  const controller = new AbortController();
  const { timeoutMs = 20000, ...fetchInit } = init;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      ...fetchInit,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        ...(fetchInit.headers ?? {}),
      },
    });
  } catch (e: any) {
    clearTimeout(timeout);
    console.error("[evolution] fetch failed", path, e?.message ?? e);
    throw new Error(
      `Evolution inacessível em ${url} (${e?.name ?? "erro"}: ${e?.message ?? "sem detalhes"})`,
    );
  }
  clearTimeout(timeout);
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    console.error("[evolution] http error", path, res.status, body);
    throw new Error(
      `Evolution ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }
  return body;
}

export const evolutionCreateInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    const webhookUrl = getWebhookUrl();
    let result: any;
    try {
      result = await evoFetch("/instance/create", {
        method: "POST",
        timeoutMs: 45000,
        body: JSON.stringify({
          instanceName: data.instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: true,
            events: WEBHOOK_EVENTS,
          },
        }),
      });
    } catch (e: any) {
      const msg = String(e?.message ?? "").toLowerCase();
      // Instance already exists → just connect and reuse it
      const canTryConnect =
        msg.includes("already") ||
        msg.includes("in use") ||
        msg.includes("exists") ||
        msg.includes("409") ||
        msg.includes("abort") ||
        msg.includes("inacessível");
      if (canTryConnect) {
        try {
          result = await evoFetch(`/instance/connect/${data.instanceName}`, { timeoutMs: 45000 });
        } catch {
          throw e;
        }
      } else {
        throw e;
      }
    }
    // Ensure webhook is set (idempotent) — covers older API versions that
    // ignore the inline webhook field on /instance/create.
    try {
      await setInstanceWebhook(data.instanceName);
    } catch {
      // non-fatal
    }
    // Always fetch the QR explicitly — some Evolution versions don't return
    // a base64 in /instance/create even when qrcode:true.
    if (!result?.qrcode?.base64 && !result?.base64) {
      try {
        const qr = await evoFetch(`/instance/connect/${data.instanceName}`, { timeoutMs: 45000 });
        result = { ...(result ?? {}), ...qr };
      } catch (e) {
        console.error("[evolution] connect after create failed", e);
      }
    }
    console.log("[evolution] create result keys", Object.keys(result ?? {}));
    return result;
  });

export const evolutionGetQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    return await evoFetch(`/instance/connect/${data.instanceName}`, { timeoutMs: 45000 });
  });

export const evolutionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    return await evoFetch(`/instance/connectionState/${data.instanceName}`, { timeoutMs: 12000 });
  });

export const evolutionLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    return await evoFetch(`/instance/logout/${data.instanceName}`, { method: "DELETE" });
  });

export const evolutionDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    // Logout first (ignore if already disconnected), then delete the instance
    try {
      await evoFetch(`/instance/logout/${data.instanceName}`, { method: "DELETE" });
    } catch {
      // ignore — likely already disconnected
    }
    try {
      return await evoFetch(`/instance/delete/${data.instanceName}`, { method: "DELETE" });
    } catch (e: any) {
      // If instance doesn't exist, treat as success
      if (String(e?.message ?? "").match(/not.?found|does not exist|404/i)) {
        return { deleted: true };
      }
      throw e;
    }
  });

export const evolutionFetchInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    try {
      const all = await evoFetch(
        `/instance/fetchInstances?instanceName=${encodeURIComponent(data.instanceName)}`,
      );
      const list = Array.isArray(all) ? all : [];
      const found = list.find((i: any) => {
        const n = i?.instance?.instanceName ?? i?.name ?? i?.instanceName;
        return n === data.instanceName;
      });
      return found ?? null;
    } catch {
      return null;
    }
  });