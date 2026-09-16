// Server-only follow-up engine: scheduling, window rules and sending.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderTemplate } from "@/lib/followup-shared";
import { normalizePhone, sendWhatsappText, requireEvolutionConfig } from "@/lib/whatsapp.server";

const DAY = 86400000;
const TZ_OFFSET_MIN = -180; // America/Sao_Paulo

type Rule = {
  id: string;
  name: string;
  trigger_event: string;
  delay_days: number;
  whatsapp_mode: string;
  connection_id: string | null;
  seller_id: string | null;
  message: string;
  allowed_start: string;
  allowed_end: string;
  allowed_weekdays: number[];
  active: boolean;
};

function localParts(date: Date) {
  const shifted = new Date(date.getTime() + TZ_OFFSET_MIN * 60000);
  return {
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    shifted,
  };
}

function toMinutes(time: string) {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

/** Moves a date into the rule's allowed weekdays/hours (Brasília time). */
export function adjustToWindow(date: Date, rule: Rule) {
  const start = toMinutes(rule.allowed_start ?? "08:00");
  const end = toMinutes(rule.allowed_end ?? "18:00");
  const weekdays = rule.allowed_weekdays?.length ? rule.allowed_weekdays : [1, 2, 3, 4, 5];
  let current = new Date(date.getTime());
  for (let i = 0; i < 14; i += 1) {
    const { weekday, minutes } = localParts(current);
    if (!weekdays.includes(weekday)) {
      current = new Date(current.getTime() + DAY);
      current = new Date(current.getTime() - (localParts(current).minutes - start) * 60000);
      continue;
    }
    if (minutes < start) {
      return new Date(current.getTime() + (start - minutes) * 60000);
    }
    if (minutes > end) {
      current = new Date(current.getTime() + DAY);
      current = new Date(current.getTime() - (localParts(current).minutes - start) * 60000);
      continue;
    }
    return current;
  }
  return current;
}

export function buildMessage(
  template: string,
  ctx: { customerName?: string | null; sellerName?: string | null; company?: string | null; product?: string | null; purchaseDate?: string | null },
) {
  const name = ctx.customerName ?? "";
  return renderTemplate(template, {
    nome: name,
    primeiro_nome: name.split(" ")[0] ?? "",
    vendedor: ctx.sellerName ?? "",
    empresa: ctx.company ?? "",
    produto: ctx.product ?? "",
    data_compra: ctx.purchaseDate
      ? new Date(ctx.purchaseDate).toLocaleDateString("pt-BR")
      : "",
  });
}

async function resolveConnectionId(rule: Rule, sellerId: string | null) {
  if (rule.whatsapp_mode === "specific" && rule.connection_id) return rule.connection_id;
  if (rule.whatsapp_mode === "seller" && sellerId) {
    const { data } = await supabaseAdmin
      .from("whatsapp_connections")
      .select("id")
      .eq("seller_id", sellerId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }
  const { data: fallback } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("id")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return fallback?.id ?? null;
}

export async function enqueueFollowup(params: {
  rule: Rule;
  customerId: string;
  baseDate: Date;
  saleId?: string | null;
  sellerId?: string | null;
  createdBy?: string | null;
  idempotencySuffix?: string;
}) {
  const { rule, customerId, baseDate } = params;
  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("id, name, company, phone, followup_enabled, followup_paused_until")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer || customer.followup_enabled === false) return { skipped: "cliente-bloqueado" };

  let sellerId = params.sellerId ?? null;
  let sellerName: string | null = null;
  let product: string | null = null;
  let purchaseDate: string | null = null;
  if (params.saleId) {
    const { data: sale } = await supabaseAdmin
      .from("sales")
      .select("seller_id, seller_name_snapshot, package_name, sale_date")
      .eq("id", params.saleId)
      .maybeSingle();
    sellerId = sellerId ?? sale?.seller_id ?? null;
    sellerName = sale?.seller_name_snapshot ?? null;
    product = sale?.package_name ?? null;
    purchaseDate = sale?.sale_date ?? null;
  }
  if (!sellerId) {
    const { data: lastSale } = await supabaseAdmin
      .from("sales")
      .select("seller_id, seller_name_snapshot")
      .eq("customer_id", customerId)
      .order("sale_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    sellerId = lastSale?.seller_id ?? null;
    sellerName = sellerName ?? lastSale?.seller_name_snapshot ?? null;
  }
  if (!sellerName && sellerId) {
    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("name")
      .eq("id", sellerId)
      .maybeSingle();
    sellerName = seller?.name ?? null;
  }

  const connectionId = await resolveConnectionId(rule, sellerId);
  const scheduledAt = adjustToWindow(
    new Date(baseDate.getTime() + (rule.delay_days ?? 0) * DAY),
    rule,
  );
  const message = buildMessage(rule.message, {
    customerName: customer.name,
    sellerName,
    company: customer.company,
    product,
    purchaseDate,
  });
  const idempotencyKey = [
    rule.id,
    customerId,
    params.saleId ?? "none",
    params.idempotencySuffix ?? scheduledAt.toISOString().slice(0, 10),
  ].join(":");

  const { error } = await supabaseAdmin.from("followup_queue").insert({
    rule_id: rule.id,
    customer_id: customerId,
    connection_id: connectionId,
    seller_id: sellerId,
    sale_id: params.saleId ?? null,
    message,
    phone: normalizePhone(customer.phone),
    scheduled_at: scheduledAt.toISOString(),
    status: "SCHEDULED",
    idempotency_key: idempotencyKey,
    created_by: params.createdBy ?? null,
  });
  if (error) {
    if (error.code === "23505" || error.code === "23503" || error.message.includes("duplicate")) {
      return { skipped: "já agendado" };
    }
    throw new Error(error.message);
  }
  await supabaseAdmin.from("followup_history").insert({
    customer_id: customerId,
    rule_id: rule.id,
    connection_id: connectionId,
    action: "AGENDADO",
    detail: `Regra "${rule.name}" agendada para ${scheduledAt.toLocaleString("pt-BR")}`,
    created_by: params.createdBy ?? null,
  });
  return { scheduledAt: scheduledAt.toISOString() };
}

async function activeRules(events: string[]) {
  const { data } = await supabaseAdmin
    .from("followup_rules")
    .select("*")
    .eq("active", true)
    .in("trigger_event", events);
  return (data ?? []) as Rule[];
}

/** Creates queue entries for every active automatic rule. Idempotent. */
export async function generateScheduledFollowups() {
  const rules = await activeRules([
    "customer_created",
    "customer_purchased",
    "sale_completed",
    "no_response",
    "days_since_conversation",
  ]);
  let created = 0;
  for (const rule of rules) {
    const lookbackDays = (rule.delay_days ?? 0) + 45;
    const since = new Date(Date.now() - lookbackDays * DAY).toISOString();

    if (rule.trigger_event === "customer_created") {
      const { data: customers } = await supabaseAdmin
        .from("customers")
        .select("id, created_at")
        .eq("followup_enabled", true)
        .gte("created_at", since)
        .limit(300);
      for (const customer of customers ?? []) {
        const result = await enqueueFollowup({
          rule,
          customerId: customer.id,
          baseDate: new Date(customer.created_at),
          idempotencySuffix: "created",
        });
        if ("scheduledAt" in result) created += 1;
      }
      continue;
    }

    if (rule.trigger_event === "customer_purchased" || rule.trigger_event === "sale_completed") {
      let query = supabaseAdmin
        .from("sales")
        .select("id, customer_id, sale_date, seller_id, payment_status")
        .gte("sale_date", since.slice(0, 10))
        .limit(300);
      if (rule.trigger_event === "sale_completed") query = query.eq("payment_status", "pago_total");
      const { data: sales } = await query;
      for (const sale of sales ?? []) {
        if (!sale.customer_id) continue;
        const result = await enqueueFollowup({
          rule,
          customerId: sale.customer_id,
          saleId: sale.id,
          sellerId: sale.seller_id,
          baseDate: new Date(`${sale.sale_date}T12:00:00Z`),
          idempotencySuffix: rule.trigger_event,
        });
        if ("scheduledAt" in result) created += 1;
      }
      continue;
    }

    // no_response / days_since_conversation: baseia-se na última mensagem enviada
    const { data: messages } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("customer_id, direction, created_at")
      .not("customer_id", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    const lastByCustomer = new Map<string, { direction: string; created_at: string }>();
    for (const message of messages ?? []) {
      if (!message.customer_id || lastByCustomer.has(message.customer_id)) continue;
      lastByCustomer.set(message.customer_id, message);
    }
    for (const [customerId, last] of lastByCustomer) {
      if (rule.trigger_event === "no_response" && last.direction !== "out") continue;
      const result = await enqueueFollowup({
        rule,
        customerId,
        baseDate: new Date(last.created_at),
        idempotencySuffix: `${rule.trigger_event}:${last.created_at.slice(0, 10)}`,
      });
      if ("scheduledAt" in result) created += 1;
    }
  }
  return created;
}

/** Cancels "cliente não respondeu" items when the customer answered. */
export async function cancelNoResponseFollowups(customerId: string) {
  const { data: pending } = await supabaseAdmin
    .from("followup_queue")
    .select("id, rule_id, followup_rules(trigger_event)")
    .eq("customer_id", customerId)
    .in("status", ["SCHEDULED", "PENDING", "WAITING_CONNECTION"]);
  const ids = (pending ?? [])
    .filter((item) => {
      const rule = item.followup_rules as { trigger_event?: string } | null;
      return rule?.trigger_event === "no_response";
    })
    .map((item) => item.id);
  if (!ids.length) return 0;
  await supabaseAdmin
    .from("followup_queue")
    .update({ status: "CANCELLED", reason: "Cliente respondeu antes do prazo" })
    .in("id", ids);
  await supabaseAdmin.from("followup_history").insert(
    ids.map((id) => ({
      queue_id: id,
      customer_id: customerId,
      action: "CANCELADO",
      detail: "Cancelado automaticamente porque o cliente respondeu.",
    })),
  );
  return ids.length;
}

type QueueItem = {
  id: string;
  customer_id: string | null;
  connection_id: string | null;
  rule_id: string | null;
  message: string;
  phone: string | null;
  attempts: number;
};

async function finish(item: QueueItem, status: string, patch: Record<string, unknown>, detail: string) {
  await supabaseAdmin.from("followup_queue").update({ status, locked_at: null, ...patch }).eq("id", item.id);
  await supabaseAdmin.from("followup_history").insert({
    queue_id: item.id,
    customer_id: item.customer_id,
    rule_id: item.rule_id,
    connection_id: item.connection_id,
    action: status,
    detail,
  });
}

/** Sends a single queue item. Assumes the row is already locked (PROCESSING). */
export async function deliverQueueItem(item: QueueItem) {
  const [{ data: customer }, { data: connection }, { data: rule }] = await Promise.all([
    item.customer_id
      ? supabaseAdmin
          .from("customers")
          .select("id, name, phone, followup_enabled, followup_paused_until")
          .eq("id", item.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    item.connection_id
      ? supabaseAdmin
          .from("whatsapp_connections")
          .select("id, instance_name, state, active")
          .eq("id", item.connection_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    item.rule_id
      ? supabaseAdmin
          .from("followup_rules")
          .select("id, active, trigger_event, start_workflow_id")
          .eq("id", item.rule_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!customer || customer.followup_enabled === false) {
    await finish(item, "SKIPPED", { reason: "Cliente não permite mensagens automáticas" }, "Cliente bloqueado para follow-up.");
    return "SKIPPED";
  }
  if (customer.followup_paused_until && new Date(customer.followup_paused_until) > new Date()) {
    await finish(item, "SKIPPED", { reason: "Follow-up pausado para o cliente" }, "Follow-up pausado.");
    return "SKIPPED";
  }
  if (item.rule_id && (!rule || rule.active === false)) {
    await finish(item, "CANCELLED", { reason: "Regra desativada" }, "Regra não está mais ativa.");
    return "CANCELLED";
  }
  if (rule?.trigger_event === "no_response") {
    const { data: reply } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("direction", "in")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reply) {
      await finish(item, "CANCELLED", { reason: "Cliente respondeu" }, "Cliente respondeu antes do envio.");
      return "CANCELLED";
    }
  }
  if (!connection || connection.active === false || connection.state !== "connected") {
    await supabaseAdmin
      .from("followup_queue")
      .update({
        status: "WAITING_CONNECTION",
        locked_at: null,
        reason: "WhatsApp desconectado.",
        scheduled_at: new Date(Date.now() + 30 * 60000).toISOString(),
        attempts: Math.max(0, item.attempts - 1),
      })
      .eq("id", item.id);
    return "WAITING_CONNECTION";
  }
  const phone = normalizePhone(item.phone ?? customer.phone);
  if (!phone) {
    await finish(item, "FAILED", { error: "Telefone inválido" }, "Telefone do cliente inválido.");
    return "FAILED";
  }
  try {
    await requireEvolutionConfig();
  } catch {
    await supabaseAdmin
      .from("followup_queue")
      .update({
        status: "WAITING_CONNECTION",
        locked_at: null,
        reason: "Evolution API não configurada.",
        scheduled_at: new Date(Date.now() + 60 * 60000).toISOString(),
        attempts: Math.max(0, item.attempts - 1),
      })
      .eq("id", item.id);
    return "WAITING_CONNECTION";
  }

  const result = await sendWhatsappText(connection.instance_name, phone, item.message);
  if (!result.ok) {
    const failed = item.attempts >= 5;
    await supabaseAdmin
      .from("followup_queue")
      .update({
        status: failed ? "FAILED" : "SCHEDULED",
        locked_at: null,
        error: result.message ?? "Falha no envio",
        scheduled_at: failed ? undefined : new Date(Date.now() + 15 * 60000).toISOString(),
      })
      .eq("id", item.id);
    await supabaseAdmin.from("followup_history").insert({
      queue_id: item.id,
      customer_id: customer.id,
      rule_id: item.rule_id,
      connection_id: connection.id,
      action: failed ? "FAILED" : "RETRY",
      detail: result.message ?? "Falha no envio",
    });
    return failed ? "FAILED" : "RETRY";
  }

  await supabaseAdmin.from("whatsapp_messages").insert({
    connection_id: connection.id,
    instance_name: connection.instance_name,
    customer_id: customer.id,
    phone,
    direction: "out",
    body: item.message,
    origin: "followup",
    status: "sent",
    external_id: result.externalId ?? null,
  });
  await finish(item, "SENT", { sent_at: new Date().toISOString(), error: null }, "Mensagem enviada.");
  return "SENT";
}

export async function processDueFollowups(limit = 20) {
  const { data, error } = await supabaseAdmin.rpc("followup_claim_due", { _limit: limit });
  if (error) throw new Error(error.message);
  const items = (data ?? []) as QueueItem[];
  const results: Record<string, number> = {};
  for (const item of items) {
    const status = await deliverQueueItem(item);
    results[status] = (results[status] ?? 0) + 1;
  }
  return { claimed: items.length, results };
}
