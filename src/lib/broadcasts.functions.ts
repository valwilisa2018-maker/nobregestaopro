import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildEvolutionTextPayload } from "@/lib/evolution-text-payload";

async function loadEvolutionCommandKey(supabase: any, fallback: string) {
  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "evolution_api")
    .maybeSingle();
  try {
    const cfg = typeof setting?.value === "string" ? JSON.parse(setting.value) : setting?.value;
    return cfg?.api_key || fallback;
  } catch {
    return fallback;
  }
}

const SourceType = z.enum(["list", "tag", "segment", "all"]);

const CreateInput = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  message: z.string().default(""),
  flow_id: z.string().uuid().nullable().optional(),
  media_url: z.string().nullable().optional(),
  media_type: z.string().nullable().optional(),
  connection_id: z.string().uuid().nullable().optional(),
  mode: z.enum(["quick", "sequential"]).default("quick"),
  // Source
  source_type: SourceType.default("list"),
  source_value: z.array(z.string()).default([]),
  contact_ids: z.array(z.string().uuid()).default([]),
  // Rate + humanization
  rate_per_min: z.number().int().min(1).max(600).default(20),
  humanize_min: z.number().int().min(0).max(600).default(5),
  humanize_max: z.number().int().min(0).max(600).default(18),
  // Window
  window_start: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  window_end: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  ignore_holidays: z.boolean().default(false),
  continue_next_day: z.boolean().default(true),
  // Behavior
  dedupe: z.boolean().default(true),
  ignore_responded: z.boolean().default(false),
  stop_on_reply: z.boolean().default(false),
  daily_limit: z.number().int().min(0).nullable().optional(),
  delay_seconds: z.number().int().min(1).max(3600).default(5),
  // Segmentation (only used when source_type === 'segment')
  segment_created_days: z.number().int().min(0).max(3650).default(0),
  segment_exclude_tags: z.array(z.string()).default([]),
});

export const listContactTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contacts")
      .select("tags")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const r of data ?? []) for (const t of (r.tags as string[]) ?? []) if (t) set.add(t);
    return { tags: [...set].sort() };
  });

async function resolveContacts(
  supabase: any,
  userId: string,
  sourceType: string,
  sourceValue: string[],
  contactIds: string[],
  dedupe: boolean,
  segment?: { created_days?: number; exclude_tags?: string[] },
): Promise<Array<{ id: string; phone: string; name: string | null }>> {
  let q = supabase
    .from("contacts")
    .select("id,phone,name,tags,created_at")
    .eq("user_id", userId)
    .eq("status", "active");
  if (sourceType === "list")
    q = q.in("id", contactIds.length ? contactIds : ["00000000-0000-0000-0000-000000000000"]);
  else if (sourceType === "tag")
    q = q.overlaps("tags", sourceValue.length ? sourceValue : ["__none__"]);
  else if (sourceType === "segment" && segment?.created_days && segment.created_days > 0) {
    const since = new Date(Date.now() - segment.created_days * 86400_000).toISOString();
    q = q.gte("created_at", since);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as Array<{
    id: string;
    phone: string;
    name: string | null;
    tags?: string[];
  }>;
  if (sourceType === "segment" && segment?.exclude_tags && segment.exclude_tags.length > 0) {
    const ex = new Set(segment.exclude_tags);
    rows = rows.filter((r) => !(r.tags ?? []).some((t) => ex.has(t)));
  }
  if (dedupe) {
    const seen = new Set<string>();
    rows = rows.filter((r) => {
      const k = r.phone.replace(/\D/g, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return rows;
}

export const previewBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        source_type: SourceType,
        source_value: z.array(z.string()).default([]),
        contact_ids: z.array(z.string().uuid()).default([]),
        dedupe: z.boolean().default(true),
        rate_per_min: z.number().int().min(1).default(20),
        daily_limit: z.number().int().min(0).nullable().optional(),
        segment_created_days: z.number().int().min(0).default(0),
        segment_exclude_tags: z.array(z.string()).default([]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const rows = await resolveContacts(
      context.supabase,
      context.userId,
      data.source_type,
      data.source_value,
      data.contact_ids,
      data.dedupe,
      { created_days: data.segment_created_days, exclude_tags: data.segment_exclude_tags },
    );
    const total = rows.length;
    const perHour = data.rate_per_min * 60;
    const perDay =
      data.daily_limit && data.daily_limit > 0
        ? Math.min(data.daily_limit, perHour * 24)
        : perHour * 24;
    const days = perDay > 0 ? Math.ceil(total / perDay) : 0;
    const finish = new Date(Date.now() + (total / Math.max(1, data.rate_per_min)) * 60000);
    return { total, per_hour: perHour, per_day: perDay, days, finish_at: finish.toISOString() };
  });

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateInput.parse(raw))
  .handler(async ({ data, context }) => {
    const rows = await resolveContacts(
      context.supabase,
      context.userId,
      data.source_type,
      data.source_value,
      data.contact_ids,
      data.dedupe,
      { created_days: data.segment_created_days, exclude_tags: data.segment_exclude_tags },
    );
    if (rows.length === 0) throw new Error("Nenhum contato válido para a origem selecionada");

    const delay = Math.max(1, Math.round(60 / Math.max(1, data.rate_per_min)));
    const estMs = rows.length * delay * 1000;
    const finish = new Date(Date.now() + estMs).toISOString();

    const { data: b, error: berr } = await context.supabase
      .from("broadcasts")
      .insert({
        user_id: context.userId,
        connection_id: data.connection_id ?? null,
        flow_id: data.flow_id ?? null,
        name: data.name,
        description: data.description ?? null,
        message: data.message,
        media_url: data.media_url ?? null,
        media_type: data.media_type ?? null,
        mode: data.mode,
        delay_seconds: delay,
        weekdays: data.weekdays,
        source_type: data.source_type,
        source_value: data.source_value,
        rate_per_min: data.rate_per_min,
        humanize_min: data.humanize_min,
        humanize_max: Math.max(data.humanize_min, data.humanize_max),
        window_start: data.window_start ?? null,
        window_end: data.window_end ?? null,
        ignore_holidays: data.ignore_holidays,
        continue_next_day: data.continue_next_day,
        dedupe: data.dedupe,
        ignore_responded: data.ignore_responded,
        stop_on_reply: data.stop_on_reply,
        daily_limit: data.daily_limit ?? null,
        status: data.mode === "quick" ? "running" : "scheduled",
        total: rows.length,
        started_at: data.mode === "quick" ? new Date().toISOString() : null,
        estimated_finish_at: finish,
      } as never)
      .select("id")
      .single();
    if (berr) throw new Error(berr.message);
    const broadcastId = b.id as string;

    const recipients = rows.map((c) => ({
      broadcast_id: broadcastId,
      user_id: context.userId,
      contact_id: c.id,
      phone: c.phone,
      status: "pending",
    }));
    // batch insert
    for (let i = 0; i < recipients.length; i += 500) {
      const chunk = recipients.slice(i, i + 500);
      const { error } = await context.supabase.from("broadcast_recipients").insert(chunk as never);
      if (error) throw new Error(error.message);
    }
    return { id: broadcastId, total: rows.length };
  });

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("broadcasts")
      .select(
        "id,name,description,mode,status,total,sent_count,error_count,responded_count,delay_seconds,rate_per_min,estimated_finish_at,created_at,started_at,finished_at,paused_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

function inWindow(now: Date, ws: string | null, we: string | null, weekdays: number[]): boolean {
  if (weekdays.length > 0 && !weekdays.includes(now.getDay())) return false;
  if (!ws || !we) return true;
  const [sh, sm] = ws.split(":").map(Number);
  const [eh, em] = we.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= sh * 60 + sm && mins <= eh * 60 + em;
}

async function getOrCreateBroadcastConversation(
  supabase: any,
  userId: string,
  connectionId: string,
  remoteJid: string,
) {
  const { data: existingRows } = await supabase
    .from("conversations")
    .select("id,metadata")
    .eq("user_id", userId)
    .eq("connection_id", connectionId);
  const existing = (existingRows ?? []).find(
    (row: { metadata?: { remoteJid?: string } }) => row?.metadata?.remoteJid === remoteJid,
  );
  if (existing) return existing.id as string;
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      connection_id: connectionId,
      status: "open",
      unread_count: 0,
      last_message_at: new Date().toISOString(),
      metadata: { remoteJid } as never,
    } as never)
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Falha ao criar conversa do fluxo");
  return created.id as string;
}

export const runBroadcastBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ id: z.string().uuid(), batch: z.number().int().min(1).max(20).default(5) })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: b, error: berr } = await context.supabase
      .from("broadcasts")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (berr || !b) throw new Error(berr?.message ?? "Não encontrado");

    // Status gates
    if (b.status === "paused")
      return {
        done: false,
        paused: true,
        sent: b.sent_count,
        error: b.error_count,
        responded: b.responded_count,
        total: b.total,
      };
    if (b.status === "canceled" || b.status === "done")
      return {
        done: true,
        sent: b.sent_count,
        error: b.error_count,
        responded: b.responded_count,
        total: b.total,
      };

    const now = new Date();
    const hasWindow = Boolean(b.window_start && b.window_end);
    const scheduleWeekdays = hasWindow ? ((b.weekdays as number[]) ?? []) : [];
    if (
      !inWindow(
        now,
        b.window_start as string | null,
        b.window_end as string | null,
        scheduleWeekdays,
      )
    ) {
      if (!b.continue_next_day) {
        await context.supabase
          .from("broadcasts")
          .update({ status: "paused", paused_at: now.toISOString() } as never)
          .eq("id", b.id)
          .eq("user_id", context.userId);
      }
      return {
        done: false,
        waiting: true,
        sent: b.sent_count,
        error: b.error_count,
        responded: b.responded_count,
        total: b.total,
      };
    }

    // Daily reset
    const today = now.toISOString().slice(0, 10);
    let sentToday = b.sent_today as number;
    if (b.day_marker !== today) {
      sentToday = 0;
    }
    const dLimit = (b.daily_limit as number | null) ?? 0;
    if (dLimit > 0 && sentToday >= dLimit) {
      return {
        done: false,
        dailyLimit: true,
        sent: b.sent_count,
        error: b.error_count,
        responded: b.responded_count,
        total: b.total,
      };
    }

    const batchSize = dLimit > 0 ? Math.min(data.batch, dLimit - sentToday) : data.batch;
    const { data: pending } = await context.supabase
      .from("broadcast_recipients")
      .select("id,phone,contact_id")
      .eq("broadcast_id", b.id)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .limit(batchSize);
    const list = pending ?? [];
    if (list.length === 0) {
      await context.supabase
        .from("broadcasts")
        .update({ status: "done", finished_at: now.toISOString() } as never)
        .eq("id", b.id)
        .eq("user_id", context.userId);
      return {
        done: true,
        sent: b.sent_count,
        error: b.error_count,
        responded: b.responded_count,
        total: b.total,
      };
    }

    const { data: conn } = await context.supabase
      .from("connections")
      .select("id,user_id,url_api,api_key,instance_name")
      .eq("id", b.connection_id ?? "")
      .eq("user_id", context.userId)
      .maybeSingle();
    const commandKey = await loadEvolutionCommandKey(context.supabase, conn?.api_key ?? "");

    // If broadcast uses a flow, load its definition once.
    let flowDef: { nodes: unknown[]; edges: unknown[] } | null = null;
    if (b.flow_id) {
      const { data: fl } = await context.supabase
        .from("flows")
        .select("definition")
        .eq("id", b.flow_id as string)
        .eq("user_id", context.userId)
        .maybeSingle();
      const def = (fl?.definition ?? null) as { nodes?: unknown[]; edges?: unknown[] } | null;
      if (def && Array.isArray(def.nodes) && Array.isArray(def.edges)) {
        flowDef = { nodes: def.nodes, edges: def.edges };
      }
    }
    const { runFlowTracked } = flowDef
      ? await import("@/lib/flow-tracking.server")
      : { runFlowTracked: null as never };

    let sent = b.sent_count as number;
    let errored = b.error_count as number;
    const hmin = Math.max(0, b.humanize_min as number);
    const hmax = Math.max(hmin, b.humanize_max as number);

    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      let contactName = "";
      if (r.contact_id) {
        const { data: c } = await context.supabase
          .from("contacts")
          .select("name")
          .eq("id", r.contact_id)
          .eq("user_id", context.userId)
          .maybeSingle();
        contactName = (c?.name as string | null) ?? "";
      }
      try {
        if (!conn?.url_api || !conn?.instance_name) throw new Error("Instância inválida");
        const number = `${(r.phone as string).replace(/\D/g, "")}@s.whatsapp.net`;
        if (b.flow_id && (!flowDef || !runFlowTracked))
          throw new Error("Fluxo inválido ou sem início configurado");
        if (flowDef && runFlowTracked) {
          const conversationId = await getOrCreateBroadcastConversation(
            context.supabase,
            context.userId,
            conn.id as string,
            number,
          );
          const result = await runFlowTracked({
            db: context.supabase as never,
            conn: {
              id: (conn.id as string) ?? "",
              user_id: (conn.user_id as string) ?? context.userId,
              url_api: conn.url_api,
              api_key: commandKey,
              instance_name: conn.instance_name,
            },
            recipient: number,
            userText: "",
            def: flowDef as never,
            state: { variables: { nome: contactName || "cliente", telefone: r.phone as string } },
            flowId: b.flow_id as string,
            conversationId,
            connectionId: (conn.id as string) ?? null,
            userId: context.userId,
            source: "broadcast",
          });
          await context.supabase
            .from("conversations")
            .update({
              flow_state: result.state as never,
              last_message_at: new Date().toISOString(),
            } as never)
            .eq("id", conversationId)
            .eq("user_id", context.userId);
        } else {
          const text = (b.message as string)
            .replaceAll("{nome}", contactName || "cliente")
            .replaceAll("{telefone}", r.phone as string);
          if (!text.trim()) throw new Error("Mensagem vazia");
          const url = `${/^https?:\/\//i.test((conn.url_api ?? "").trim()) ? (conn.url_api ?? "").trim().replace(/\/+$/, "") : "https://" + (conn.url_api ?? "").trim().replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: commandKey },
            body: JSON.stringify(buildEvolutionTextPayload(number, text)),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
        await context.supabase
          .from("broadcast_recipients")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          } as never)
          .eq("id", r.id)
          .eq("user_id", context.userId);
        sent++;
        sentToday++;
      } catch (e) {
        await context.supabase
          .from("broadcast_recipients")
          .update({
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          } as never)
          .eq("id", r.id)
          .eq("user_id", context.userId);
        errored++;
      }
      if (i < list.length - 1) {
        const wait =
          hmax > 0
            ? hmin + Math.floor(Math.random() * (hmax - hmin + 1))
            : (b.delay_seconds as number);
        await new Promise((res) => setTimeout(res, Math.max(1, wait) * 1000));
      }
    }
    await context.supabase
      .from("broadcasts")
      .update({
        sent_count: sent,
        error_count: errored,
        sent_today: sentToday,
        day_marker: today,
      } as never)
      .eq("id", b.id)
      .eq("user_id", context.userId);
    return { done: false, sent, error: errored, responded: b.responded_count, total: b.total };
  });

const IdInput = z.object({ id: z.string().uuid() });

// ============ Sequential broadcasts ============
const StepInput = z.object({
  step_order: z.number().int().min(0),
  delay_hours: z
    .number()
    .int()
    .min(0)
    .max(24 * 90),
  message: z.string().min(1),
  media_url: z.string().nullable().optional(),
  media_type: z.string().nullable().optional(),
});

export const saveBroadcastSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        broadcast_id: z.string().uuid(),
        steps: z.array(StepInput).min(1),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error: derr } = await context.supabase
      .from("broadcast_steps")
      .delete()
      .eq("broadcast_id", data.broadcast_id)
      .eq("user_id", context.userId);
    if (derr) throw new Error(derr.message);
    const rows = data.steps.map((s, i) => ({
      broadcast_id: data.broadcast_id,
      user_id: context.userId,
      step_order: i,
      delay_hours: s.delay_hours,
      message: s.message,
      media_url: s.media_url ?? null,
      media_type: s.media_type ?? null,
    }));
    const { error } = await context.supabase.from("broadcast_steps").insert(rows as never);
    if (error) throw new Error(error.message);
    // recipients: set current_step=0, next_action_at=now for first step
    const now = new Date().toISOString();
    await context.supabase
      .from("broadcast_recipients")
      .update({
        current_step: 0,
        next_action_at: now,
      } as never)
      .eq("broadcast_id", data.broadcast_id)
      .eq("user_id", context.userId)
      .eq("status", "pending");
    return { ok: true, count: rows.length };
  });

export const listBroadcastSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("broadcast_steps")
      .select("id,step_order,delay_hours,message,media_url,media_type")
      .eq("broadcast_id", data.id)
      .eq("user_id", context.userId)
      .order("step_order");
    if (error) throw new Error(error.message);
    return { steps: rows ?? [] };
  });

export const runSequentialBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ id: z.string().uuid(), batch: z.number().int().min(1).max(20).default(5) })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: b, error: berr } = await context.supabase
      .from("broadcasts")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (berr || !b) throw new Error(berr?.message ?? "Não encontrado");
    if (b.status === "paused" || b.status === "canceled" || b.status === "done") {
      return {
        done: b.status === "done",
        paused: b.status === "paused",
        sent: b.sent_count,
        error: b.error_count,
        total: b.total,
      };
    }
    const now = new Date();
    if (
      !inWindow(
        now,
        b.window_start as string | null,
        b.window_end as string | null,
        (b.weekdays as number[]) ?? [],
      )
    ) {
      return {
        done: false,
        waiting: true,
        sent: b.sent_count,
        error: b.error_count,
        total: b.total,
      };
    }

    const { data: steps } = await context.supabase
      .from("broadcast_steps")
      .select("step_order,delay_hours,message,media_url,media_type")
      .eq("broadcast_id", b.id)
      .eq("user_id", context.userId)
      .order("step_order");
    const stepList = steps ?? [];
    if (stepList.length === 0) throw new Error("Sequência sem etapas");

    // pending recipients whose next_action_at <= now
    const { data: due } = await context.supabase
      .from("broadcast_recipients")
      .select("id,phone,contact_id,current_step,timeline")
      .eq("broadcast_id", b.id)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .lte("next_action_at", now.toISOString())
      .limit(data.batch);
    const list = due ?? [];
    if (list.length === 0) {
      // check if any recipients still pending (with future next_action_at)
      const { count } = await context.supabase
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", b.id)
        .eq("user_id", context.userId)
        .eq("status", "pending");
      if (!count) {
        await context.supabase
          .from("broadcasts")
          .update({ status: "done", finished_at: now.toISOString() } as never)
          .eq("id", b.id)
          .eq("user_id", context.userId);
        return { done: true, sent: b.sent_count, error: b.error_count, total: b.total };
      }
      return {
        done: false,
        waiting: true,
        sent: b.sent_count,
        error: b.error_count,
        total: b.total,
      };
    }

    const { data: conn } = await context.supabase
      .from("connections")
      .select("url_api,api_key,instance_name")
      .eq("id", b.connection_id ?? "")
      .eq("user_id", context.userId)
      .maybeSingle();
    const commandKey = await loadEvolutionCommandKey(context.supabase, conn?.api_key ?? "");

    let sent = b.sent_count as number;
    let errored = b.error_count as number;

    for (const r of list) {
      const idx = r.current_step as number;
      const step = stepList[idx];
      if (!step) continue;
      let contactName = "";
      if (r.contact_id) {
        const { data: c } = await context.supabase
          .from("contacts")
          .select("name")
          .eq("id", r.contact_id)
          .eq("user_id", context.userId)
          .maybeSingle();
        contactName = (c?.name as string | null) ?? "";
      }
      const text = (step.message as string)
        .replaceAll("{nome}", contactName || "cliente")
        .replaceAll("{telefone}", r.phone as string);
      const tl = Array.isArray(r.timeline) ? (r.timeline as any[]) : [];
      try {
        if (!conn?.url_api || !conn?.instance_name) throw new Error("Instância inválida");
        const number = `${(r.phone as string).replace(/\D/g, "")}@s.whatsapp.net`;
        const url = `${/^https?:\/\//i.test((conn.url_api ?? "").trim()) ? (conn.url_api ?? "").trim().replace(/\/+$/, "") : "https://" + (conn.url_api ?? "").trim().replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: commandKey },
          body: JSON.stringify(buildEvolutionTextPayload(number, text)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        tl.push({ step: idx, at: new Date().toISOString(), status: "sent", message: text });
        const nextIdx = idx + 1;
        const finished = nextIdx >= stepList.length;
        const nextAt = finished
          ? null
          : new Date(
              Date.now() + (stepList[nextIdx].delay_hours as number) * 3600_000,
            ).toISOString();
        await context.supabase
          .from("broadcast_recipients")
          .update({
            current_step: finished ? idx : nextIdx,
            status: finished ? "sent" : "pending",
            sent_at: finished ? new Date().toISOString() : null,
            next_action_at: nextAt,
            last_step_at: new Date().toISOString(),
            timeline: tl as never,
          } as never)
          .eq("id", r.id)
          .eq("user_id", context.userId);
        if (finished) sent++;
      } catch (e) {
        tl.push({
          step: idx,
          at: new Date().toISOString(),
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
        await context.supabase
          .from("broadcast_recipients")
          .update({
            status: "error",
            error: e instanceof Error ? e.message : String(e),
            timeline: tl as never,
            last_step_at: new Date().toISOString(),
          } as never)
          .eq("id", r.id)
          .eq("user_id", context.userId);
        errored++;
      }
    }
    await context.supabase
      .from("broadcasts")
      .update({
        sent_count: sent,
        error_count: errored,
      } as never)
      .eq("id", b.id)
      .eq("user_id", context.userId);
    return { done: false, sent, error: errored, total: b.total };
  });

export const listRecipientsTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("broadcast_recipients")
      .select("id,phone,status,current_step,next_action_at,last_step_at,error,timeline,contact_id")
      .eq("broadcast_id", data.id)
      .eq("user_id", context.userId)
      .order("last_step_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const pauseBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("broadcasts")
      .update({ status: "paused", paused_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resumeBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("broadcasts")
      .update({ status: "running", paused_at: null } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("broadcasts")
      .update({ status: "canceled", finished_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("broadcasts")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !src) throw new Error(error?.message ?? "Não encontrado");
    const clone = { ...src };
    delete (clone as any).id;
    delete (clone as any).created_at;
    delete (clone as any).updated_at;
    clone.name = `${src.name} (cópia)`;
    clone.status = "draft";
    clone.sent_count = 0;
    clone.error_count = 0;
    clone.responded_count = 0;
    clone.sent_today = 0;
    clone.day_marker = null;
    clone.started_at = null;
    clone.finished_at = null;
    clone.paused_at = null;
    clone.total = 0;
    const { data: dup, error: derr } = await context.supabase
      .from("broadcasts")
      .insert(clone as never)
      .select("id")
      .single();
    if (derr) throw new Error(derr.message);
    return { id: dup.id as string };
  });

export const getBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: b, error } = await context.supabase
      .from("broadcasts")
      .select(
        "id,name,status,total,sent_count,error_count,responded_count,mode,delay_seconds,rate_per_min",
      )
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return b;
  });
