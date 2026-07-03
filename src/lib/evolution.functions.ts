import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const IdInput = z.object({ connectionId: z.string().uuid() });

async function loadConnection(supabase: any, userId: string, id: string) {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Conexão não encontrada");
  return data;
}

function baseUrl(url: string) {
  let u = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
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

export const testConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
    const r = await evoFetch(`${baseUrl(c.url_api)}/instance/connectionState/${c.instance_name}`, c.api_key);
    const state = r.json?.instance?.state ?? r.json?.state ?? (r.ok ? "unknown" : "error");
    const status = state === "open" ? "online" : state === "connecting" ? "connecting" : "offline";
    await context.supabase.from("connections").update({ status, last_sync: new Date().toISOString() }).eq("id", c.id);
    return { ok: r.ok, status, state, raw: r.json };
  });

export const connectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
    const r = await evoFetch(`${baseUrl(c.url_api)}/instance/connect/${c.instance_name}`, c.api_key);
    const j = r.json ?? {};
    const qr =
      j.base64 ||
      j.qrcode?.base64 ||
      j.qrcode?.code ||
      j.qr?.base64 ||
      j.qr ||
      j.code ||
      null;
    await context.supabase.from("connections").update({ status: "connecting", last_sync: new Date().toISOString() }).eq("id", c.id);
    return { ok: r.ok, qr, pairingCode: j.pairingCode ?? null, raw: r.json };
  });

export const disconnectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
    const r = await evoFetch(`${baseUrl(c.url_api)}/instance/logout/${c.instance_name}`, c.api_key, { method: "DELETE" });
    await context.supabase.from("connections").update({ status: "offline", last_sync: new Date().toISOString() }).eq("id", c.id);
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
    const raw = (data.number ?? c.phone_number ?? "").toString().replace(/\D+/g, "");
    if (!raw) throw new Error("Informe um número de destino (a instância ainda não tem número conectado).");
    const text = data.text ?? "oi";
    const r = await evoFetch(`${baseUrl(c.url_api)}/message/sendText/${c.instance_name}`, c.api_key, {
      method: "POST",
      body: JSON.stringify({ number: raw, text, delay: 500 }),
    });
    if (!r.ok) {
      const msg =
        (Array.isArray(r.json?.response?.message) ? r.json.response.message[0] : r.json?.response?.message) ||
        (Array.isArray(r.json?.message) ? r.json.message[0] : r.json?.message) ||
        JSON.stringify(r.json).slice(0, 300);
      throw new Error(`Evolution ${r.status}: ${msg}`);
    }
    return { ok: true, to: raw, text, raw: r.json };
  });

export const deleteInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
    // Best-effort: logout then delete on Evolution before dropping the local row
    try { await evoFetch(`${baseUrl(c.url_api)}/instance/logout/${c.instance_name}`, c.api_key, { method: "DELETE" }); } catch { /* ignore */ }
    try { await evoFetch(`${baseUrl(c.url_api)}/instance/delete/${c.instance_name}`, c.api_key, { method: "DELETE" }); } catch { /* ignore */ }
    const { error } = await context.supabase.from("connections").delete().eq("id", c.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const c = await loadConnection(context.supabase, context.userId, data.connectionId);
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
    // Load global Evolution config from settings
    const { data: setting } = await context.supabase
      .from("settings").select("value").eq("key", "evolution_api").maybeSingle();
    if (!setting?.value) throw new Error("Configure a Evolution API em Configurações antes de criar instâncias.");
    let cfg: { url_api?: string; api_key?: string; webhook_base_url?: string } = {};
    try { cfg = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value; } catch { throw new Error("Configuração da Evolution API inválida (JSON)."); }
    if (!cfg.url_api || !cfg.api_key) throw new Error("URL da API e API Key são obrigatórias em Configurações.");

    const webhookBase = cfg.webhook_base_url || data.webhookBaseUrl;
    const webhookUrl = webhookBase ? `${webhookBase.replace(/\/+$/, "")}/api/public/evolution/${data.instanceName}` : undefined;

    // Insert local connection row
    const { data: conn, error: insErr } = await context.supabase.from("connections").insert({
      user_id: context.userId,
      name: data.name,
      instance_name: data.instanceName,
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
        instanceName: data.instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        ...(webhookUrl ? {
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: true,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
          },
        } : {}),
      }),
    });

    if (!createRes.ok) {
      // rollback
      await context.supabase.from("connections").delete().eq("id", conn.id);
      throw new Error(createRes.json?.response?.message?.[0] ?? createRes.json?.message ?? "Falha ao criar instância na Evolution API");
    }

    const cj = createRes.json ?? {};
    // Evolution returns a per-instance token in `hash.apikey` (or `hash`).
    // That is the key it sends in the `apikey` header of every webhook —
    // store it so our webhook signature check accepts inbound events.
    const instanceApiKey: string =
      cj.hash?.apikey || cj.hash?.apiKey || (typeof cj.hash === "string" ? cj.hash : "") || cfg.api_key;
    if (instanceApiKey && instanceApiKey !== cfg.api_key) {
      await context.supabase.from("connections").update({ api_key: instanceApiKey }).eq("id", conn.id);
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
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        is_active: true,
      });
    }

    return { connectionId: conn.id, qr, webhookUrl, raw: createRes.json };
  });