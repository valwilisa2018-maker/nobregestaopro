// Server-only runner for the Sequences module. Called by the cron endpoint
// /api/public/hooks/sequences (or piggy-backed by broadcasts cron). Processes
// due enrollments, respects send window, executes the linked flow, and
// schedules the next step.

type Db = { from: (t: string) => any };

type Seq = {
  id: string;
  user_id: string;
  connection_id: string | null;
  status: string;
  window_start: string | null;
  window_end: string | null;
  weekdays: number[];
  message_interval_seconds: number;
  starts_at: string | null;
  ends_at: string | null;
};

type Step = {
  id: string;
  sequence_id: string;
  position: number;
  flow_id: string | null;
  delay_value: number;
  delay_unit: "minute" | "hour" | "day" | "week" | "month";
  use_custom_window: boolean;
  window_start: string | null;
  window_end: string | null;
  weekdays: number[] | null;
  message_interval_seconds: number | null;
  max_retries: number;
  retry_interval_minutes: number;
  on_error: "retry" | "skip" | "pause" | "remove" | "notify";
  end_sequence: boolean;
};

type Enrollment = {
  id: string;
  sequence_id: string;
  user_id: string;
  contact_id: string | null;
  phone: string;
  status: string;
  current_step: number;
  next_run_at: string | null;
  retry_count: number;
  last_sent_at: string | null;
};

const UNIT_MS: Record<Step["delay_unit"], number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 30 * 86_400_000,
};

function parseHM(s: string | null): [number, number] | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return [h, mm];
}

function inWindow(
  now: Date,
  ws: string | null,
  we: string | null,
  weekdays: number[] | null | undefined,
): boolean {
  const wd = weekdays && weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6];
  if (!wd.includes(now.getDay())) return false;
  const s = parseHM(ws),
    e = parseHM(we);
  if (!s || !e) return true;
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= s[0] * 60 + s[1] && mins <= e[0] * 60 + e[1];
}

function nextAllowedSlot(
  from: Date,
  ws: string | null,
  we: string | null,
  weekdays: number[] | null | undefined,
): Date {
  const wd = weekdays && weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6];
  const start = parseHM(ws) ?? [0, 0];
  const end = parseHM(we) ?? [23, 59];
  const cur = new Date(from);
  for (let i = 0; i < 8; i++) {
    const day = new Date(cur);
    day.setDate(cur.getDate() + i);
    if (!wd.includes(day.getDay())) continue;
    const dayStart = new Date(day);
    dayStart.setHours(start[0], start[1], 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(end[0], end[1], 0, 0);
    if (i === 0 && cur > dayEnd) continue;
    if (i === 0 && cur >= dayStart) return cur;
    return dayStart;
  }
  const fallback = new Date(from);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}

async function logEvent(
  db: Db,
  en: Enrollment,
  step: Step | null,
  type: string,
  message?: string,
  data?: unknown,
) {
  try {
    await db.from("sequence_events").insert({
      enrollment_id: en.id,
      sequence_id: en.sequence_id,
      user_id: en.user_id,
      step_id: step?.id ?? null,
      step_position: step?.position ?? null,
      type,
      message: message ?? null,
      data: (data ?? {}) as never,
    } as never);
  } catch {
    /* best-effort */
  }
}

function computeDelayMs(step: Step) {
  return Math.max(0, step.delay_value * UNIT_MS[step.delay_unit]);
}

/**
 * Process a batch of due enrollments. Returns quick counters for observability.
 */
export async function processDueEnrollments(db: Db, limit = 25) {
  const now = new Date();
  const { data: due } = await db
    .from("sequence_enrollments")
    .select("*")
    .in("status", ["scheduled", "waiting", "out_of_window"])
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);
  const list = (due ?? []) as Enrollment[];
  let processed = 0,
    sent = 0,
    errors = 0,
    waiting = 0,
    completed = 0;

  for (const en of list) {
    processed++;
    const { data: seqRow } = await db
      .from("sequences")
      .select("*")
      .eq("id", en.sequence_id)
      .maybeSingle();
    const seq = seqRow as Seq | null;
    if (!seq || seq.status !== "active") continue;
    if (seq.ends_at && new Date(seq.ends_at) < now) {
      await db
        .from("sequence_enrollments")
        .update({
          status: "completed",
          completed_at: now.toISOString(),
        } as never)
        .eq("id", en.id);
      await logEvent(db, en, null, "completed", "Sequência encerrada (data final)");
      completed++;
      continue;
    }
    if (seq.starts_at && new Date(seq.starts_at) > now) {
      await db
        .from("sequence_enrollments")
        .update({
          next_run_at: seq.starts_at,
        } as never)
        .eq("id", en.id);
      waiting++;
      continue;
    }

    const { data: stepRow } = await db
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", en.sequence_id)
      .eq("position", en.current_step)
      .maybeSingle();
    const step = stepRow as Step | null;
    if (!step) {
      await db
        .from("sequence_enrollments")
        .update({
          status: "completed",
          completed_at: now.toISOString(),
        } as never)
        .eq("id", en.id);
      await logEvent(db, en, null, "completed", "Sem mais etapas");
      completed++;
      continue;
    }

    // Window check (step custom or sequence default)
    const winStart = step.use_custom_window ? step.window_start : seq.window_start;
    const winEnd = step.use_custom_window ? step.window_end : seq.window_end;
    const winDays = step.use_custom_window ? step.weekdays : seq.weekdays;
    if (!inWindow(now, winStart, winEnd, winDays)) {
      const nextSlot = nextAllowedSlot(now, winStart, winEnd, winDays);
      await db
        .from("sequence_enrollments")
        .update({
          status: "out_of_window",
          next_run_at: nextSlot.toISOString(),
        } as never)
        .eq("id", en.id);
      await logEvent(
        db,
        en,
        step,
        "out_of_window",
        `Fora da janela, reagendado para ${nextSlot.toISOString()}`,
      );
      waiting++;
      continue;
    }

    // Respect per-contact interval
    const interval = step.message_interval_seconds ?? seq.message_interval_seconds ?? 0;
    if (interval > 0 && en.last_sent_at) {
      const nextAllowed = new Date(en.last_sent_at).getTime() + interval * 1000;
      if (nextAllowed > now.getTime()) {
        await db
          .from("sequence_enrollments")
          .update({
            next_run_at: new Date(nextAllowed).toISOString(),
          } as never)
          .eq("id", en.id);
        waiting++;
        continue;
      }
    }

    // Load connection + flow
    let connId = seq.connection_id;
    if (!connId) {
      const { data: firstConn } = await db
        .from("connections")
        .select("id")
        .eq("user_id", en.user_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      connId = (firstConn as { id?: string } | null)?.id ?? null;
    }
    if (!connId || !step.flow_id) {
      await logEvent(
        db,
        en,
        step,
        "error",
        !connId ? "Sem instância WhatsApp" : "Etapa sem fluxo vinculado",
      );
      await db
        .from("sequence_enrollments")
        .update({
          status: step.on_error === "pause" ? "paused" : "error",
          last_error: !connId ? "no_connection" : "no_flow",
        } as never)
        .eq("id", en.id);
      errors++;
      continue;
    }
    const { data: conn } = await db
      .from("connections")
      .select("id,user_id,url_api,api_key,instance_name")
      .eq("id", connId)
      .maybeSingle();
    const { data: flow } = await db
      .from("flows")
      .select("id,definition")
      .eq("id", step.flow_id)
      .maybeSingle();
    if (!conn || !flow?.definition) {
      await logEvent(db, en, step, "error", "Fluxo ou conexão inválidos");
      await db
        .from("sequence_enrollments")
        .update({
          status: "error",
          last_error: "invalid_flow_or_conn",
        } as never)
        .eq("id", en.id);
      errors++;
      continue;
    }

    // Ensure conversation exists for this phone
    const recipient = `${en.phone}@s.whatsapp.net`;
    let convoId: string | null = null;
    {
      const { data: existing } = await db
        .from("conversations")
        .select("id")
        .eq("user_id", en.user_id)
        .eq("connection_id", connId)
        .eq("contact_wa_id", recipient)
        .maybeSingle();
      convoId = (existing as { id?: string } | null)?.id ?? null;
      if (!convoId) {
        const { data: created } = await db
          .from("conversations")
          .insert({
            user_id: en.user_id,
            connection_id: connId,
            contact_id: en.contact_id,
            contact_wa_id: recipient,
            contact_phone: en.phone,
            last_message_at: now.toISOString(),
          } as never)
          .select("id")
          .single();
        convoId = (created as { id?: string } | null)?.id ?? null;
      }
    }

    try {
      await db
        .from("sequence_enrollments")
        .update({ status: "running" } as never)
        .eq("id", en.id);
      const { runFlow } = await import("@/lib/flow-runner.server");
      const def = (flow as { definition: unknown }).definition as {
        nodes: unknown[];
        edges: unknown[];
      };
      await runFlow({
        db,
        conn: {
          id: (conn as { id: string }).id,
          user_id: en.user_id,
          url_api: (conn as { url_api: string | null }).url_api,
          api_key: (conn as { api_key: string | null }).api_key,
          instance_name: (conn as { instance_name: string | null }).instance_name,
        },
        recipient,
        userText: "",
        def: { nodes: def.nodes as never, edges: def.edges as never },
        state: {
          flow_id: step.flow_id,
          current_node: null,
          variables: { telefone: en.phone },
          awaiting: null,
        },
        flowId: step.flow_id,
        conversationId: convoId,
        userId: en.user_id,
      });
      const nextPos = en.current_step + 1;
      const { data: nextStep } = await db
        .from("sequence_steps")
        .select("id,delay_value,delay_unit,end_sequence")
        .eq("sequence_id", en.sequence_id)
        .eq("position", nextPos)
        .maybeSingle();
      if (!nextStep || step.end_sequence) {
        await db
          .from("sequence_enrollments")
          .update({
            status: "completed",
            completed_at: now.toISOString(),
            last_sent_at: now.toISOString(),
            retry_count: 0,
            last_error: null,
            current_step: nextPos,
          } as never)
          .eq("id", en.id);
        await logEvent(db, en, step, "sent", `Etapa ${step.position + 1} enviada`);
        await logEvent(db, en, null, "completed", "Sequência concluída");
        completed++;
      } else {
        const ns = nextStep as { delay_value: number; delay_unit: Step["delay_unit"] };
        const nextRun = new Date(now.getTime() + ns.delay_value * UNIT_MS[ns.delay_unit]);
        await db
          .from("sequence_enrollments")
          .update({
            status: "scheduled",
            current_step: nextPos,
            next_run_at: nextRun.toISOString(),
            last_sent_at: now.toISOString(),
            retry_count: 0,
            last_error: null,
          } as never)
          .eq("id", en.id);
        await logEvent(
          db,
          en,
          step,
          "sent",
          `Etapa ${step.position + 1} enviada; próxima em ${nextRun.toISOString()}`,
        );
      }
      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const nextRetry = en.retry_count + 1;
      if (nextRetry < step.max_retries && step.on_error === "retry") {
        const retryAt = new Date(now.getTime() + step.retry_interval_minutes * 60_000);
        await db
          .from("sequence_enrollments")
          .update({
            status: "scheduled",
            next_run_at: retryAt.toISOString(),
            retry_count: nextRetry,
            last_error: msg,
          } as never)
          .eq("id", en.id);
        await logEvent(db, en, step, "error_retry", `Erro (tentativa ${nextRetry}): ${msg}`);
      } else if (step.on_error === "skip") {
        await db
          .from("sequence_enrollments")
          .update({
            status: "scheduled",
            current_step: en.current_step + 1,
            next_run_at: now.toISOString(),
            retry_count: 0,
            last_error: msg,
          } as never)
          .eq("id", en.id);
        await logEvent(db, en, step, "skipped", `Etapa pulada por erro: ${msg}`);
      } else if (step.on_error === "remove") {
        await db
          .from("sequence_enrollments")
          .update({
            status: "cancelled",
            completed_at: now.toISOString(),
            last_error: msg,
          } as never)
          .eq("id", en.id);
        await logEvent(db, en, step, "removed", `Removido por erro: ${msg}`);
      } else {
        await db
          .from("sequence_enrollments")
          .update({
            status: "paused",
            last_error: msg,
            retry_count: nextRetry,
          } as never)
          .eq("id", en.id);
        await logEvent(db, en, step, "paused_error", `Pausado por erro: ${msg}`);
      }
      errors++;
    }
  }

  return { processed, sent, errors, waiting, completed };
}

/**
 * Try to enroll contacts triggered by an inbound WhatsApp text. Called from
 * the Evolution webhook handler.
 */
export async function tryKeywordEnroll(
  db: Db,
  args: {
    userId: string;
    phone: string;
    text: string;
  },
) {
  const { userId } = args;
  const phone = (args.phone ?? "").replace(/\D/g, "");
  if (!phone || !args.text) return { matched: 0 };
  const { data: seqs } = await db
    .from("sequences")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");
  const list = (seqs ?? []) as Array<
    Seq & {
      keywords: string[];
      keyword_match: string;
      keyword_ignore_case: boolean;
      keyword_ignore_accents: boolean;
    }
  >;
  const stripAcc = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let matched = 0;
  for (const s of list) {
    if (!s.keywords?.length) continue;
    let hay = args.text;
    if (s.keyword_ignore_case) hay = hay.toLowerCase();
    if (s.keyword_ignore_accents) hay = stripAcc(hay);
    const hit = s.keywords.some((kw) => {
      let needle = kw;
      if (s.keyword_ignore_case) needle = needle.toLowerCase();
      if (s.keyword_ignore_accents) needle = stripAcc(needle);
      return s.keyword_match === "exact" ? hay.trim() === needle.trim() : hay.includes(needle);
    });
    if (!hit) continue;
    const now = new Date().toISOString();
    const { data: contactRow } = await db
      .from("contacts")
      .select("id")
      .eq("user_id", userId)
      .eq("phone", phone)
      .maybeSingle();
    const contactId = (contactRow as { id?: string } | null)?.id ?? null;
    const { data: existing } = await db
      .from("sequence_enrollments")
      .select("id,status")
      .eq("sequence_id", s.id)
      .eq("phone", phone)
      .maybeSingle();
    if (existing) {
      const policy = (s as unknown as { reenroll_policy: string }).reenroll_policy;
      if (policy === "skip") continue;
      await db
        .from("sequence_enrollments")
        .update({
          status: "scheduled",
          current_step: 0,
          next_run_at: now,
          entry_source: "keyword",
          entry_at: now,
          retry_count: 0,
          last_error: null,
          completed_at: null,
        } as never)
        .eq("id", (existing as { id: string }).id);
      await db.from("sequence_events").insert({
        enrollment_id: (existing as { id: string }).id,
        sequence_id: s.id,
        user_id: userId,
        type: "keyword_enroll",
        message: "Reinscrição por palavra-chave",
      } as never);
    } else {
      const { data: ins } = await db
        .from("sequence_enrollments")
        .insert({
          sequence_id: s.id,
          user_id: userId,
          contact_id: contactId,
          phone,
          status: "scheduled",
          current_step: 0,
          next_run_at: now,
          entry_source: "keyword",
        } as never)
        .select("id")
        .single();
      if (ins) {
        await db.from("sequence_events").insert({
          enrollment_id: (ins as { id: string }).id,
          sequence_id: s.id,
          user_id: userId,
          type: "keyword_enroll",
          message: "Inscrito por palavra-chave",
        } as never);
      }
    }
    matched++;
  }
  return { matched };
}
