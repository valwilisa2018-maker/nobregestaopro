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
  return url.replace(/\/+$/, "");
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
    const qr = r.json?.base64 || r.json?.qrcode?.base64 || r.json?.code || null;
    await context.supabase.from("connections").update({ status: "connecting", last_sync: new Date().toISOString() }).eq("id", c.id);
    return { ok: r.ok, qr, raw: r.json };
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