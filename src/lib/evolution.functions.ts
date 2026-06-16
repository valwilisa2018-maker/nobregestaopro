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

async function setInstanceWebhook(instanceName: string) {
  const webhookUrl = getWebhookUrl();
  // Evolution v2 shape
  try {
    return await evoFetch(`/webhook/set/${instanceName}`, {
      method: "POST",
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

async function evoFetch(path: string, init: RequestInit = {}) {
  const { url, key } = getConfig();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
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
      if (String(e?.message ?? "").includes("already")) {
        result = await evoFetch(`/instance/connect/${data.instanceName}`);
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
    return result;
  });

export const evolutionGetQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    return await evoFetch(`/instance/connect/${data.instanceName}`);
  });

export const evolutionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    return await evoFetch(`/instance/connectionState/${data.instanceName}`);
  });

export const evolutionLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    return await evoFetch(`/instance/logout/${data.instanceName}`, { method: "DELETE" });
  });