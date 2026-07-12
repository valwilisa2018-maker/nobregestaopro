import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = (v: string) => `https://graph.facebook.com/${v || "v21.0"}`;

async function graph<T = unknown>(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown; version?: string; qs?: Record<string, string> },
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const url = new URL(`${GRAPH(init?.version || "v21.0")}${path}`);
  if (init?.qs) for (const [k, v] of Object.entries(init.qs)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    method: init?.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ||
      `HTTP ${r.status}`;
    return { ok: false, status: r.status, data: null, error: msg };
  }
  return { ok: true, status: r.status, data: data as T };
}

/* ─────────── Verify credentials ─────────── */
export const verifyMetaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ configId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cfg } = await supabase
      .from("meta_wa_configs").select("*").eq("id", data.configId).eq("user_id", userId).maybeSingle();
    if (!cfg) return { ok: false, error: "config não encontrada" };
    if (!cfg.access_token || !cfg.phone_number_id) return { ok: false, error: "credenciais incompletas" };
    const r = await graph<{ display_phone_number?: string; verified_name?: string }>(
      `/${cfg.phone_number_id}`, cfg.access_token,
      { version: cfg.graph_version, qs: { fields: "display_phone_number,verified_name,quality_rating" } },
    );
    await supabase.from("meta_wa_configs").update({
      last_verified_at: new Date().toISOString(),
      last_status: r.ok ? "ok" : `erro: ${r.error}`,
      display_phone: r.data?.display_phone_number ?? null,
    }).eq("id", cfg.id);
    return r.ok ? { ok: true, phone: r.data?.display_phone_number, name: r.data?.verified_name } : { ok: false, error: r.error };
  });

/* ─────────── Sync templates from Meta ─────────── */
export const syncMetaTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ configId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cfg } = await supabase
      .from("meta_wa_configs").select("*").eq("id", data.configId).eq("user_id", userId).maybeSingle();
    if (!cfg?.business_account_id || !cfg.access_token) return { ok: false, error: "faltando WABA ID ou token" };
    const r = await graph<{ data: Array<{ id: string; name: string; language: string; status: string; category: string; components: unknown[] }> }>(
      `/${cfg.business_account_id}/message_templates`, cfg.access_token,
      { version: cfg.graph_version, qs: { limit: "200" } },
    );
    if (!r.ok || !r.data) return { ok: false, error: r.error };
    await supabase.from("meta_wa_templates").delete().eq("user_id", userId).eq("config_id", cfg.id);
    const rows = r.data.data.map((t) => ({
      user_id: userId, config_id: cfg.id, meta_template_id: t.id, name: t.name,
      language: t.language, status: t.status, category: t.category,
      components: t.components as never, last_synced_at: new Date().toISOString(),
    }));
    if (rows.length) await supabase.from("meta_wa_templates").insert(rows as never);
    return { ok: true, count: rows.length };
  });

/* ─────────── Create template on Meta ─────────── */
export const createMetaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    configId: z.string().uuid(),
    name: z.string().regex(/^[a-z0-9_]+$/, "somente minúsculas, números e _"),
    language: z.string().default("pt_BR"),
    category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
    bodyText: z.string().min(1),
    headerText: z.string().optional(),
    footerText: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cfg } = await supabase
      .from("meta_wa_configs").select("*").eq("id", data.configId).eq("user_id", userId).maybeSingle();
    if (!cfg?.business_account_id || !cfg.access_token) return { ok: false, error: "faltando WABA ID ou token" };
    const components: Array<Record<string, unknown>> = [];
    if (data.headerText) components.push({ type: "HEADER", format: "TEXT", text: data.headerText });
    components.push({ type: "BODY", text: data.bodyText });
    if (data.footerText) components.push({ type: "FOOTER", text: data.footerText });
    const r = await graph<{ id: string; status: string; category: string }>(
      `/${cfg.business_account_id}/message_templates`, cfg.access_token,
      { method: "POST", version: cfg.graph_version, body: { name: data.name, language: data.language, category: data.category, components } },
    );
    if (!r.ok || !r.data) return { ok: false, error: r.error };
    await supabase.from("meta_wa_templates").insert({
      user_id: userId, config_id: cfg.id, meta_template_id: r.data.id, name: data.name,
      language: data.language, category: r.data.category ?? data.category, status: r.data.status ?? "PENDING",
      components: components as never,
    } as never);
    return { ok: true, id: r.data.id, status: r.data.status };
  });

/* ─────────── Delete template ─────────── */
export const deleteMetaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ templateId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: t } = await supabase.from("meta_wa_templates").select("*, meta_wa_configs(access_token,business_account_id,graph_version)")
      .eq("id", data.templateId).eq("user_id", userId).maybeSingle();
    if (!t) return { ok: false, error: "não encontrado" };
    const cfg = (t as { meta_wa_configs?: { access_token: string; business_account_id: string; graph_version: string } }).meta_wa_configs;
    if (t.meta_template_id && cfg?.access_token && cfg.business_account_id) {
      await graph(`/${cfg.business_account_id}/message_templates`, cfg.access_token, {
        method: "DELETE", version: cfg.graph_version, qs: { name: t.name },
      });
    }
    await supabase.from("meta_wa_templates").delete().eq("id", data.templateId).eq("user_id", userId);
    return { ok: true };
  });

/* ─────────── Send a template message (broadcast-ready) ─────────── */
export const sendMetaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    configId: z.string().uuid(),
    to: z.string().min(6),
    templateName: z.string(),
    language: z.string().default("pt_BR"),
    bodyParams: z.array(z.string()).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cfg } = await supabase
      .from("meta_wa_configs").select("*").eq("id", data.configId).eq("user_id", userId).maybeSingle();
    if (!cfg?.phone_number_id || !cfg.access_token) return { ok: false, error: "credenciais incompletas" };
    const components = data.bodyParams?.length
      ? [{ type: "body", parameters: data.bodyParams.map((t) => ({ type: "text", text: t })) }]
      : undefined;
    const r = await graph<{ messages?: Array<{ id: string }> }>(
      `/${cfg.phone_number_id}/messages`, cfg.access_token,
      { method: "POST", version: cfg.graph_version, body: {
        messaging_product: "whatsapp", to: data.to.replace(/\D+/g, ""), type: "template",
        template: { name: data.templateName, language: { code: data.language }, components },
      } },
    );
    return r.ok ? { ok: true, messageId: r.data?.messages?.[0]?.id } : { ok: false, error: r.error };
  });

/* ─────────── Send free-form text (only inside 24h window) ─────────── */
export const sendMetaText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    configId: z.string().uuid(),
    to: z.string().min(6),
    text: z.string().min(1),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cfg } = await supabase
      .from("meta_wa_configs").select("*").eq("id", data.configId).eq("user_id", userId).maybeSingle();
    if (!cfg?.phone_number_id || !cfg.access_token) return { ok: false, error: "credenciais incompletas" };
    const r = await graph<{ messages?: Array<{ id: string }> }>(
      `/${cfg.phone_number_id}/messages`, cfg.access_token,
      { method: "POST", version: cfg.graph_version, body: {
        messaging_product: "whatsapp", to: data.to.replace(/\D+/g, ""), type: "text",
        text: { body: data.text, preview_url: true },
      } },
    );
    return r.ok
      ? { ok: true, messageId: r.data?.messages?.[0]?.id }
      : { ok: false, error: r.error, hint: "Se for erro 131047/24h, use um template aprovado." };
  });