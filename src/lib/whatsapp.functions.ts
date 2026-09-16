import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  userId: string;
  claims: Record<string, unknown>;
};

async function assertPermission(context: Ctx, module: string, action: string) {
  const { data } = await context.supabase.rpc("has_permission", {
    _user_id: context.userId,
    _module: module,
    _action: action,
  });
  if (data === true) return;
  const roles = await Promise.all(
    ["admin", "super_admin"].map(async (role) => {
      const res = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: role,
      });
      return res.data === true;
    }),
  );
  if (!roles.some(Boolean)) throw new Error("Sem permissão para esta ação.");
}

function email(context: Ctx) {
  const value = context.claims?.email;
  return typeof value === "string" ? value : null;
}

/* ============================ Configurações ============================ */

export const whatsappGetSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context as unknown as Ctx, "whatsapp", "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { maskKey, webhookUrlForDisplay, loadEvolutionConfig } = await import(
      "@/lib/whatsapp.server"
    );
    const { data } = await supabaseAdmin
      .from("evolution_settings")
      .select("api_url, api_key, integration_name, last_test_at, last_test_ok, last_test_message")
      .eq("id", true)
      .maybeSingle();
    const config = await loadEvolutionConfig();
    const { data: lastEvent } = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .select("event_type, instance_name, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count } = await supabaseAdmin
      .from("whatsapp_webhook_events")
      .select("id", { count: "exact", head: true });
    return {
      apiUrl: data?.api_url ?? process.env.EVOLUTION_API_URL ?? "",
      apiKeyMasked: maskKey(data?.api_key ?? process.env.EVOLUTION_API_KEY ?? null),
      hasApiKey: Boolean(config?.key),
      integrationName: data?.integration_name ?? "",
      configured: Boolean(config),
      lastTestAt: data?.last_test_at ?? null,
      lastTestOk: data?.last_test_ok ?? null,
      lastTestMessage: data?.last_test_message ?? null,
      webhookUrl: webhookUrlForDisplay(),
      webhookEventCount: count ?? 0,
      lastEvent: lastEvent ?? null,
    };
  });

export const whatsappSaveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { apiUrl: string; apiKey?: string; integrationName?: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "whatsapp", "edit");
    const url = (data.apiUrl ?? "").trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(url)) throw new Error("Informe uma URL válida (http:// ou https://).");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/whatsapp.server");
    const patch: Record<string, unknown> = {
      id: true,
      api_url: url,
      integration_name: (data.integrationName ?? "").trim() || null,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    };
    const key = (data.apiKey ?? "").trim();
    if (key) patch.api_key = key;
    const { error } = await supabaseAdmin
      .from("evolution_settings")
      .upsert(patch, { onConflict: "id" });
    if (error) throw new Error(error.message);
    await logAudit("evolution_settings_updated", { api_url: url }, email(ctx), ctx.userId);
    return { ok: true };
  });

export const whatsappTestConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "whatsapp", "view");
    const { loadEvolutionConfig, evoCall } = await import("@/lib/whatsapp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config = await loadEvolutionConfig();
    if (!config) {
      return { status: "not_configured" as const, message: "Evolution API não configurada." };
    }
    const result = await evoCall("/instance/fetchInstances", { timeoutMs: 20000, config });
    let status: "connected" | "auth_error" | "unavailable" = "connected";
    let message = "API conectada.";
    if (!result.ok) {
      status = result.status === 401 || result.status === 403 ? "auth_error" : "unavailable";
      message = result.message ?? "Não foi possível conectar.";
    }
    await supabaseAdmin.from("evolution_settings").upsert(
      {
        id: true,
        api_url: config.url,
        last_test_at: new Date().toISOString(),
        last_test_ok: result.ok,
        last_test_message: message,
      },
      { onConflict: "id" },
    );
    return { status, message };
  });

export const whatsappTestWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "whatsapp", "edit");
    const { webhookUrl } = await import("@/lib/whatsapp.server");
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "WEBHOOK_TEST",
        instance: "teste-plataforma",
        data: { state: null },
      }),
    }).catch(() => null);
    if (!res || !res.ok) {
      return { ok: false, message: "O webhook não respondeu corretamente." };
    }
    return { ok: true, message: "Webhook funcionando corretamente." };
  });

export const whatsappSendTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; phone: string; message: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "whatsapp", "edit");
    const { sendWhatsappText, normalizePhone } = await import("@/lib/whatsapp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!normalizePhone(data.phone)) throw new Error("Número inválido. Use DDD + número.");
    let instance = data.instanceName;
    if (!instance) {
      const { data: conn } = await supabaseAdmin
        .from("whatsapp_connections")
        .select("instance_name")
        .eq("state", "connected")
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      instance = conn?.instance_name;
    }
    if (!instance) throw new Error("Nenhum WhatsApp conectado para enviar o teste.");
    const result = await sendWhatsappText(instance, data.phone, data.message);
    if (result.ok) {
      await supabaseAdmin.from("whatsapp_messages").insert({
        instance_name: instance,
        phone: normalizePhone(data.phone)!,
        direction: "out",
        body: data.message,
        origin: "test",
        external_id: result.externalId ?? null,
        sent_by: ctx.userId,
      });
    }
    return { ok: result.ok, message: result.ok ? "Mensagem enviada." : (result.message ?? "Falha no envio.") };
  });

/* ============================ Conexões ============================ */

export const whatsappListConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context as unknown as Ctx, "whatsapp", "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadEvolutionConfig } = await import("@/lib/whatsapp.server");
    const [{ data: connections }, { data: sellers }, config] = await Promise.all([
      supabaseAdmin
        .from("whatsapp_connections")
        .select(
          "id, name, instance_name, responsible_name, seller_id, notes, phone_number, profile_pic_url, state, last_event, connected_at, is_default, active, created_at",
        )
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("sellers").select("id, name").eq("active", true).order("name"),
      loadEvolutionConfig(),
    ]);
    return {
      configured: Boolean(config),
      connections: connections ?? [],
      sellers: sellers ?? [],
    };
  });

export const whatsappCreateConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      name: string;
      responsibleName?: string;
      sellerId?: string | null;
      instanceName?: string;
      notes?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "whatsapp", "edit");
    const {
      requireEvolutionConfig,
      evoCall,
      slugifyInstance,
      setInstanceWebhook,
      webhookUrl,
      WEBHOOK_EVENTS,
      extractQr,
      logAudit,
    } = await import("@/lib/whatsapp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const name = (data.name ?? "").trim();
    if (!name) throw new Error("Informe o nome da conexão.");
    const config = await requireEvolutionConfig();
    const instanceName = slugifyInstance(data.instanceName?.trim() || name);

    const { data: existing } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id")
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (existing) throw new Error("Já existe uma conexão com esse nome interno.");

    const created = await evoCall("/instance/create", {
      method: "POST",
      timeoutMs: 45000,
      config,
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          enabled: true,
          url: webhookUrl(),
          webhookByEvents: false,
          webhookBase64: true,
          byEvents: false,
          base64: true,
          events: WEBHOOK_EVENTS,
        },
      }),
    });
    if (!created.ok && created.status !== 409 && !/exists|already|in use/i.test(String(created.body))) {
      throw new Error(created.message ?? "Não foi possível criar a conexão na Evolution API.");
    }
    await setInstanceWebhook(instanceName, config);

    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_connections")
      .insert({
        name,
        instance_name: instanceName,
        responsible_name: (data.responsibleName ?? "").trim() || null,
        seller_id: data.sellerId || null,
        notes: (data.notes ?? "").trim() || null,
        state: extractQr(created.body) ? "qrcode" : "connecting",
        last_event: "CONNECT_REQUESTED",
        created_by: ctx.userId,
      })
      .select("id, instance_name")
      .single();
    if (error) throw new Error(error.message);
    await logAudit("whatsapp_connection_created", { instance_name: instanceName }, email(ctx), ctx.userId);
    return { id: row.id, instanceName, qr: extractQr(created.body) };
  });

export const whatsappGetQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data, context }) => {
    await assertPermission(context as unknown as Ctx, "whatsapp", "edit");
    const { evoCall, extractQr, normalizeState, extractState, requireEvolutionConfig } =
      await import("@/lib/whatsapp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config = await requireEvolutionConfig();
    let qr: string | null = null;
    let state: string | null = null;
    for (let attempt = 0; attempt < 3 && !qr; attempt += 1) {
      const result = await evoCall(`/instance/connect/${data.instanceName}`, {
        timeoutMs: 30000,
        config,
      });
      if (!result.ok && attempt === 2) {
        throw new Error(result.message ?? "Não foi possível gerar o QR Code.");
      }
      qr = extractQr(result.body);
      state = extractState(result.body);
      if (!qr) await new Promise((r) => setTimeout(r, 1500));
    }
    await supabaseAdmin
      .from("whatsapp_connections")
      .update({
        state: qr ? "qrcode" : normalizeState(state),
        last_event: qr ? "QRCODE_UPDATED" : "CONNECT_REQUESTED",
      })
      .eq("instance_name", data.instanceName);
    return { qr };
  });

export const whatsappRefreshStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertPermission(context as unknown as Ctx, "whatsapp", "view");
    const { refreshConnectionState, requireEvolutionConfig } = await import("@/lib/whatsapp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config = await requireEvolutionConfig();
    if (data.instanceName) {
      return { results: [await refreshConnectionState(data.instanceName, config)] };
    }
    const { data: rows } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("instance_name")
      .eq("active", true);
    const results = [];
    for (const row of rows ?? []) {
      results.push(await refreshConnectionState(row.instance_name, config));
    }
    return { results };
  });

export const whatsappUpdateConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      name?: string;
      responsibleName?: string | null;
      sellerId?: string | null;
      notes?: string | null;
      isDefault?: boolean;
      active?: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "whatsapp", "edit");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/whatsapp.server");
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.responsibleName !== undefined)
      patch.responsible_name = data.responsibleName?.trim() || null;
    if (data.sellerId !== undefined) patch.seller_id = data.sellerId || null;
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
    if (data.active !== undefined) patch.active = data.active;
    if (data.isDefault) {
      await supabaseAdmin.from("whatsapp_connections").update({ is_default: false }).neq("id", data.id);
      patch.is_default = true;
    } else if (data.isDefault === false) {
      patch.is_default = false;
    }
    const { error } = await supabaseAdmin
      .from("whatsapp_connections")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit("whatsapp_connection_updated", { id: data.id }, email(ctx), ctx.userId);
    return { ok: true };
  });

export const whatsappDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "whatsapp", "edit");
    const { evoCall, logAudit } = await import("@/lib/whatsapp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await evoCall(`/instance/logout/${data.instanceName}`, { method: "DELETE", timeoutMs: 20000 });
    await supabaseAdmin
      .from("whatsapp_connections")
      .update({ state: "disconnected", last_event: "LOGOUT_REQUESTED", phone_number: null })
      .eq("instance_name", data.instanceName);
    await logAudit("whatsapp_disconnected", { instance_name: data.instanceName }, email(ctx), ctx.userId);
    return { ok: true };
  });

export const whatsappDeleteConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; instanceName: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "whatsapp", "edit");
    const { evoCall, logAudit } = await import("@/lib/whatsapp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await evoCall(`/instance/logout/${data.instanceName}`, { method: "DELETE", timeoutMs: 20000 });
    await evoCall(`/instance/delete/${data.instanceName}`, { method: "DELETE", timeoutMs: 20000 });
    const { error } = await supabaseAdmin.from("whatsapp_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit("whatsapp_connection_deleted", { instance_name: data.instanceName }, email(ctx), ctx.userId);
    return { ok: true };
  });

/* ============================ Cliente ============================ */

export const whatsappSendToCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; connectionId: string; message: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "customers", "edit");
    const { sendWhatsappText, normalizePhone, logAudit } = await import("@/lib/whatsapp.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: customer }, { data: connection }] = await Promise.all([
      supabaseAdmin.from("customers").select("id, name, phone").eq("id", data.customerId).maybeSingle(),
      supabaseAdmin
        .from("whatsapp_connections")
        .select("id, instance_name, state")
        .eq("id", data.connectionId)
        .maybeSingle(),
    ]);
    if (!customer) throw new Error("Cliente não encontrado.");
    if (!connection) throw new Error("Conexão de WhatsApp não encontrada.");
    if (connection.state !== "connected") throw new Error("Este WhatsApp está desconectado.");
    const phone = normalizePhone(customer.phone);
    if (!phone) throw new Error("Este cliente não tem um telefone válido cadastrado.");
    const message = (data.message ?? "").trim();
    if (!message) throw new Error("Escreva a mensagem.");
    const result = await sendWhatsappText(connection.instance_name, phone, message);
    await supabaseAdmin.from("whatsapp_messages").insert({
      connection_id: connection.id,
      instance_name: connection.instance_name,
      customer_id: customer.id,
      phone,
      direction: "out",
      body: message,
      origin: "manual",
      status: result.ok ? "sent" : "failed",
      external_id: result.ok ? (result.externalId ?? null) : null,
      sent_by: ctx.userId,
    });
    await logAudit(
      "whatsapp_manual_message",
      { customer_id: customer.id, ok: result.ok },
      email(ctx),
      ctx.userId,
    );
    if (!result.ok) throw new Error(result.message ?? "Falha no envio.");
    return { ok: true };
  });

export const whatsappCustomerHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertPermission(context as unknown as Ctx, "customers", "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      { data: messages },
      { data: queue },
      { data: history },
      { data: customer },
      { data: connections },
    ] = await Promise.all([
      supabaseAdmin
        .from("whatsapp_messages")
        .select("id, direction, body, created_at, status, origin")
        .eq("customer_id", data.customerId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("followup_queue")
        .select("id, status, scheduled_at, sent_at, message, reason, rule_id")
        .eq("customer_id", data.customerId)
        .order("scheduled_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("followup_history")
        .select("id, action, detail, created_at")
        .eq("customer_id", data.customerId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("customers")
        .select("followup_enabled, followup_paused_until, last_interaction_at")
        .eq("id", data.customerId)
        .maybeSingle(),
      supabaseAdmin
        .from("whatsapp_connections")
        .select("id, name, state")
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("name"),
    ]);
    const rows = queue ?? [];
    const next =
      rows
        .filter((item) => ["SCHEDULED", "PENDING", "WAITING_CONNECTION"].includes(item.status))
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null;
    return {
      messages: messages ?? [],
      queue: rows,
      history: history ?? [],
      customer: customer ?? null,
      connections: connections ?? [],
      next,
      counts: {
        sent: rows.filter((item) => item.status === "SENT").length,
        cancelled: rows.filter((item) => item.status === "CANCELLED").length,
      },
    };
  });

export const whatsappSetCustomerFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; enabled?: boolean; pausedUntil?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "customers", "edit");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch.followup_enabled = data.enabled;
    if (data.pausedUntil !== undefined) patch.followup_paused_until = data.pausedUntil;
    const { error } = await supabaseAdmin.from("customers").update(patch as never).eq("id", data.customerId);
    if (error) throw new Error(error.message);
    if (data.enabled === false) {
      await supabaseAdmin
        .from("followup_queue")
        .update({ status: "CANCELLED", reason: "Follow-up desativado para o cliente" })
        .eq("customer_id", data.customerId)
        .in("status", ["SCHEDULED", "PENDING", "WAITING_CONNECTION"]);
    }
    return { ok: true };
  });
