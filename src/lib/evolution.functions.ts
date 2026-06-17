import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getConfig() {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) throw new Error("Evolution API não configurada");
  return { url: url.replace(/\/$/, ""), key };
}

async function getWebhookUrl() {
  const configured = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return `${configured}/api/public/evolution-webhook`;

  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const host =
      getRequestHeader("x-forwarded-host")?.split(",")[0]?.trim() ??
      getRequestHeader("host")?.split(",")[0]?.trim();
    const proto = getRequestHeader("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
    if (host && !host.startsWith("id-preview--") && !host.includes("lovable.dev")) {
      return `${proto}://${host}/api/public/evolution-webhook`;
    }
  } catch {
    // Falls back below when there is no request context.
  }

  return "https://nobregestaopro.lovable.app/api/public/evolution-webhook";
}

const WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
];

type EvoFetchInit = RequestInit & { retry?: boolean; timeoutMs?: number };

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[];
type LooseRecord = { [key: string]: JsonValue | undefined };
type EvoResponse = JsonValue;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "erro";
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as LooseRecord) : {};
}

function nestedString(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return typeof current === "string" ? current : null;
}

function extractQr(result: unknown) {
  if (typeof result === "string" && result.length > 50) return result;
  const candidates = [
    nestedString(result, ["base64"]),
    nestedString(result, ["code"]),
    nestedString(result, ["qrcode", "base64"]),
    nestedString(result, ["qrcode", "code"]),
    nestedString(result, ["qrcode"]),
    nestedString(result, ["qr", "base64"]),
    nestedString(result, ["qr", "code"]),
    nestedString(result, ["data", "base64"]),
    nestedString(result, ["data", "code"]),
    nestedString(result, ["data", "qrcode", "base64"]),
    nestedString(result, ["data", "qrcode", "code"]),
    nestedString(result, ["instance", "qrcode", "base64"]),
  ];
  return candidates.find((c) => typeof c === "string" && c.length > 50) ?? null;
}

function hasQr(result: unknown) {
  return Boolean(extractQr(result));
}

function extractState(result: unknown) {
  return (
    nestedString(result, ["instance", "state"]) ??
    nestedString(result, ["instance", "connectionStatus"]) ??
    nestedString(result, ["state"]) ??
    nestedString(result, ["status"]) ??
    nestedString(result, ["connection"]) ??
    null
  );
}

function extractNumber(result: unknown) {
  return (
    nestedString(result, ["instance", "owner"]) ??
    nestedString(result, ["instance", "number"]) ??
    nestedString(result, ["owner"]) ??
    nestedString(result, ["number"]) ??
    null
  );
}

async function syncWhatsappStatus(
  instanceName: string,
  patch: { state?: string; number?: string | null; last_event?: string | null },
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_status").upsert(
      {
        instance_name: instanceName,
        updated_at: new Date().toISOString(),
        ...patch,
      },
      { onConflict: "instance_name" },
    );
    if (error) console.warn("[evolution] status sync failed", error.message);
  } catch (e) {
    console.warn("[evolution] status sync unavailable", errorMessage(e));
  }
}

async function setInstanceWebhook(instanceName: string) {
  const webhookUrl = await getWebhookUrl();
  // Evolution v2 documented shape
  try {
    return await evoFetch(`/webhook/set/${instanceName}`, {
      method: "POST",
      timeoutMs: 8000,
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: true,
          events: WEBHOOK_EVENTS,
        },
      }),
    });
  } catch {
    // Fallback common v2 inline shape
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
      // Fallback older flat shape
    }
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

async function evoFetch(path: string, init: EvoFetchInit = {}): Promise<EvoResponse> {
  const { url, key } = getConfig();
  const { retry = true, timeoutMs = 90000, ...fetchInit } = init;
  // Render free-tier cold starts can take 30-60s. Retry once after a warmup
  // attempt so the first call doesn't fail with AbortError.
  const attempt = async (ms: number): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(`${url}${path}`, {
        ...fetchInit,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          ...(fetchInit.headers ?? {}),
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  };
  let res: Response;
  try {
    res = await attempt(timeoutMs);
  } catch (e: unknown) {
    if (!retry) {
      throw new Error(
        `Evolution inacessível em ${url} (${errorName(e)}: ${errorMessage(e) || "sem detalhes"}).`,
      );
    }
    console.warn("[evolution] first attempt failed, retrying", path, errorMessage(e));
    try {
      res = await attempt(timeoutMs);
    } catch (e2: unknown) {
      console.error("[evolution] fetch failed", path, errorMessage(e2));
      throw new Error(
        `Evolution inacessível em ${url} (${errorName(e2)}: ${errorMessage(e2) || "sem detalhes"}). O servidor pode estar acordando — tente novamente em 30s.`,
      );
    }
  }
  const text = await res.text();
  let body: EvoResponse = null;
  try {
    body = text ? (JSON.parse(text) as EvoResponse) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error("[evolution] http error", path, res.status, body);
    throw new Error(
      `Evolution ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }
  return body;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectForQr(instanceName: string, attempts = 3): Promise<EvoResponse> {
  let last: EvoResponse = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await evoFetch(`/instance/connect/${instanceName}`, {
        retry: false,
        timeoutMs: 45000,
      });
      last = result;
      if (hasQr(result)) return result;
    } catch (e) {
      console.warn("[evolution] connect qr attempt failed", attempt, errorMessage(e));
      if (attempt === attempts) throw e;
    }
    await wait(1500 * attempt);
  }
  return last ?? {};
}

export const evolutionCreateInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    await syncWhatsappStatus(data.instanceName, { state: "connecting", last_event: "CONNECT_REQUESTED" });
    const webhookUrl = await getWebhookUrl();
    let result: EvoResponse;
    try {
      result = await evoFetch("/instance/create", {
        method: "POST",
        timeoutMs: 45000,
        body: JSON.stringify({
          instanceName: data.instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            webhookBase64: true,
            byEvents: false,
            base64: true,
            events: WEBHOOK_EVENTS,
          },
        }),
      });
    } catch (e: unknown) {
      const msg = errorMessage(e).toLowerCase();
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
          result = await connectForQr(data.instanceName, 2);
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
    if (!hasQr(result)) {
      try {
        const qr = await connectForQr(data.instanceName, 3);
        result =
          typeof qr === "string"
            ? { ...asRecord(result), code: qr }
            : { ...asRecord(result), ...asRecord(qr) };
      } catch (e) {
        console.error("[evolution] connect after create failed", e);
      }
    }
    const state = extractState(result);
    const number = extractNumber(result);
    await syncWhatsappStatus(data.instanceName, {
      state: hasQr(result) ? "qrcode" : state ?? "connecting",
      number,
      last_event: hasQr(result) ? "QRCODE_UPDATED" : "CONNECT_REQUESTED",
    });
    console.log("[evolution] create result keys", Object.keys(asRecord(result)));
    return result ?? {};
  });

export const evolutionGetQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    const result = await connectForQr(data.instanceName, 2);
    await syncWhatsappStatus(data.instanceName, {
      state: hasQr(result) ? "qrcode" : extractState(result) ?? "connecting",
      number: extractNumber(result),
      last_event: hasQr(result) ? "QRCODE_UPDATED" : "CONNECT_REQUESTED",
    });
    return result;
  });

export const evolutionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    try {
      const result = await evoFetch(`/instance/connectionState/${data.instanceName}`, {
        retry: false,
        timeoutMs: 6000,
      });
      await syncWhatsappStatus(data.instanceName, {
        state: extractState(result) ?? "unknown",
        number: extractNumber(result),
        last_event: "STATUS_CHECK",
      });
      return result;
    } catch (e) {
      await syncWhatsappStatus(data.instanceName, {
        state: "unreachable",
        last_event: "STATUS_UNREACHABLE",
      });
      throw e;
    }
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
    } catch (e: unknown) {
      // If instance doesn't exist, treat as success
      if (errorMessage(e).match(/not.?found|does not exist|404/i)) {
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
      const found = list.find((item) => {
        const n =
          nestedString(item, ["instance", "instanceName"]) ??
          nestedString(item, ["name"]) ??
          nestedString(item, ["instanceName"]);
        return n === data.instanceName;
      });
      return found ?? null;
    } catch {
      return null;
    }
  });
