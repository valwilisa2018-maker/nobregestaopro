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
  for (const role of ["admin", "super_admin"]) {
    const res = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: role });
    if (res.data === true) return;
  }
  throw new Error("Sem permissão para esta ação.");
}

export const followupOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context as unknown as Ctx, "followup", "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: queue }, { data: rules }, { data: connections }, { data: sellers }] =
      await Promise.all([
        supabaseAdmin
          .from("followup_queue")
          .select(
            "id, status, scheduled_at, sent_at, message, error, reason, attempts, customer_id, connection_id, seller_id, rule_id, customers(name), whatsapp_connections(name), sellers(name), followup_rules(name, trigger_event)",
          )
          .order("scheduled_at", { ascending: true })
          .limit(500),
        supabaseAdmin
          .from("followup_rules")
          .select("*, whatsapp_connections(name)")
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("whatsapp_connections")
          .select("id, name, state, seller_id, phone_number")
          .eq("active", true)
          .order("name"),
        supabaseAdmin.from("sellers").select("id, name").eq("active", true).order("name"),
      ]);
    return {
      queue: queue ?? [],
      rules: rules ?? [],
      connections: connections ?? [],
      sellers: sellers ?? [],
    };
  });

export const followupSaveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      name: string;
      triggerEvent: string;
      delayDays: number;
      whatsappMode: string;
      connectionId?: string | null;
      sellerId?: string | null;
      message: string;
      allowedStart: string;
      allowedEnd: string;
      allowedWeekdays: number[];
      active: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "followup", "edit");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/whatsapp.server");
    if (!data.name?.trim()) throw new Error("Informe o nome da regra.");
    if (!data.message?.trim()) throw new Error("Escreva a mensagem.");
    const row = {
      name: data.name.trim(),
      trigger_event: data.triggerEvent,
      delay_days: Math.max(0, Math.min(365, Number(data.delayDays) || 0)),
      whatsapp_mode: data.whatsappMode,
      connection_id: data.whatsappMode === "specific" ? data.connectionId || null : null,
      seller_id: data.sellerId || null,
      message: data.message.trim(),
      allowed_start: data.allowedStart || "08:00",
      allowed_end: data.allowedEnd || "18:00",
      allowed_weekdays: data.allowedWeekdays?.length ? data.allowedWeekdays : [1, 2, 3, 4, 5],
      active: data.active,
      created_by: ctx.userId,
    };
    const query = data.id
      ? supabaseAdmin.from("followup_rules").update(row).eq("id", data.id)
      : supabaseAdmin.from("followup_rules").insert(row);
    const { error } = await query;
    if (error) throw new Error(error.message);
    await logAudit(
      data.id ? "followup_rule_updated" : "followup_rule_created",
      { name: row.name, trigger: row.trigger_event },
      typeof ctx.claims.email === "string" ? ctx.claims.email : null,
      ctx.userId,
    );
    return { ok: true };
  });

export const followupDeleteRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertPermission(context as unknown as Ctx, "followup", "delete");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("followup_queue")
      .update({ status: "CANCELLED", reason: "Regra excluída" })
      .eq("rule_id", data.id)
      .in("status", ["SCHEDULED", "PENDING", "WAITING_CONNECTION"]);
    const { error } = await supabaseAdmin.from("followup_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const followupQueueAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id: string; action: "cancel" | "reschedule" | "send_now"; scheduledAt?: string }) => d,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "followup", "edit");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deliverQueueItem } = await import("@/lib/followup.server");

    if (data.action === "cancel") {
      const { error } = await supabaseAdmin
        .from("followup_queue")
        .update({ status: "CANCELLED", reason: "Cancelado manualmente" })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, message: "Follow-up cancelado." };
    }

    if (data.action === "reschedule") {
      if (!data.scheduledAt) throw new Error("Informe a nova data.");
      const { error } = await supabaseAdmin
        .from("followup_queue")
        .update({ scheduled_at: new Date(data.scheduledAt).toISOString(), status: "SCHEDULED", reason: null })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, message: "Data atualizada." };
    }

    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("followup_queue")
      .update({ status: "PROCESSING", locked_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["SCHEDULED", "PENDING", "WAITING_CONNECTION", "FAILED"])
      .select("id, customer_id, connection_id, rule_id, message, phone, attempts")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) throw new Error("Este follow-up já foi processado.");
    const status = await deliverQueueItem(claimed);
    return {
      ok: status === "SENT",
      message:
        status === "SENT"
          ? "Mensagem enviada."
          : status === "WAITING_CONNECTION"
            ? "WhatsApp desconectado. O envio ficou aguardando a reconexão."
            : `Não foi enviado (${status}).`,
    };
  });

export const followupScheduleManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; ruleId: string; scheduledAt?: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "followup", "edit");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueFollowup } = await import("@/lib/followup.server");
    const { data: rule } = await supabaseAdmin
      .from("followup_rules")
      .select("*")
      .eq("id", data.ruleId)
      .maybeSingle();
    if (!rule) throw new Error("Regra não encontrada.");
    const base = data.scheduledAt ? new Date(data.scheduledAt) : new Date();
    const ruleForRun = data.scheduledAt ? { ...rule, delay_days: 0 } : rule;
    const result = await enqueueFollowup({
      rule: ruleForRun,
      customerId: data.customerId,
      baseDate: base,
      createdBy: ctx.userId,
      idempotencySuffix: `manual:${Date.now()}`,
    });
    return result;
  });

export const followupRunNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context as unknown as Ctx, "followup", "edit");
    const { generateScheduledFollowups, processDueFollowups } = await import("@/lib/followup.server");
    const created = await generateScheduledFollowups();
    const processed = await processDueFollowups(20);
    return { created, ...processed };
  });
