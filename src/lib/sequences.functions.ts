import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- helpers ----------
function normPhone(raw: string) {
  return (raw ?? "").replace(/\D/g, "");
}

// ---------- schemas ----------
const StepSchema = z.object({
  id: z.string().uuid().optional(),
  position: z.number().int().min(0),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  flow_id: z.string().uuid().nullable().optional(),
  delay_value: z.number().int().min(0).default(1),
  delay_unit: z.enum(["minute", "hour", "day", "week", "month"]).default("day"),
  use_custom_window: z.boolean().default(false),
  window_start: z.string().nullable().optional(),
  window_end: z.string().nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  message_interval_seconds: z.number().int().min(0).nullable().optional(),
  max_retries: z.number().int().min(0).max(20).default(3),
  retry_interval_minutes: z.number().int().min(1).max(1440).default(5),
  on_error: z.enum(["retry", "skip", "pause", "remove", "notify"]).default("retry"),
  end_sequence: z.boolean().default(false),
});

const SequenceSchema = z.object({
  id: z.string().uuid().optional(),
  connection_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(160),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(["draft", "active", "paused"]).default("draft"),
  window_start: z.string().nullable().optional(),
  window_end: z.string().nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  timezone: z.string().default("America/Sao_Paulo"),
  message_interval_seconds: z.number().int().min(0).max(3600).default(5),
  reenroll_policy: z
    .enum(["skip", "restart", "continue", "new_run", "remove_reenroll"])
    .default("skip"),
  keywords: z.array(z.string()).default([]),
  keyword_match: z.enum(["exact", "contains"]).default("contains"),
  keyword_ignore_case: z.boolean().default(true),
  keyword_ignore_accents: z.boolean().default(true),
  entry_sources: z.array(z.string()).default(["manual", "keyword", "workflow"]),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  steps: z.array(StepSchema).default([]),
});

// ---------- LIST ----------
export const listSequences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: seqs } = await supabase
      .from("sequences" as never)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const rows = (seqs ?? []) as Array<Record<string, unknown>>;
    if (!rows.length) return { rows: [] };
    const ids = rows.map((r) => r.id as string);
    const [{ data: stepCounts }, { data: enrolls }] = await Promise.all([
      supabase
        .from("sequence_steps" as never)
        .select("sequence_id")
        .in("sequence_id", ids),
      supabase
        .from("sequence_enrollments" as never)
        .select("sequence_id,status,next_run_at")
        .in("sequence_id", ids),
    ]);
    const stepMap = new Map<string, number>();
    for (const s of (stepCounts ?? []) as Array<{ sequence_id: string }>) {
      stepMap.set(s.sequence_id, (stepMap.get(s.sequence_id) ?? 0) + 1);
    }
    const enrollMap = new Map<
      string,
      { total: number; active: number; done: number; next: string | null }
    >();
    for (const e of (enrolls ?? []) as Array<{
      sequence_id: string;
      status: string;
      next_run_at: string | null;
    }>) {
      const cur = enrollMap.get(e.sequence_id) ?? {
        total: 0,
        active: 0,
        done: 0,
        next: null as string | null,
      };
      cur.total++;
      if (["scheduled", "waiting", "running", "out_of_window"].includes(e.status)) cur.active++;
      if (e.status === "completed") cur.done++;
      if (e.next_run_at && (!cur.next || e.next_run_at < cur.next)) cur.next = e.next_run_at;
      enrollMap.set(e.sequence_id, cur);
    }
    return {
      rows: rows.map((r) => ({
        ...r,
        steps_count: stepMap.get(r.id as string) ?? 0,
        enroll_stats: enrollMap.get(r.id as string) ?? { total: 0, active: 0, done: 0, next: null },
      })),
    };
  });

// ---------- GET ----------
export const getSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: seq } = await supabase
      .from("sequences" as never)
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!seq) throw new Error("Sequência não encontrada");
    const { data: steps } = await supabase
      .from("sequence_steps" as never)
      .select("*")
      .eq("sequence_id", data.id)
      .order("position");
    return { sequence: seq, steps: steps ?? [] };
  });

// ---------- UPSERT ----------
export const saveSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SequenceSchema.parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { steps, id, ...seqBody } = data;
    let seqId = id;
    if (seqId) {
      const { error } = await supabase
        .from("sequences" as never)
        .update({ ...seqBody } as never)
        .eq("id", seqId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("sequences" as never)
        .insert({ ...seqBody, user_id: userId } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      seqId = (created as { id: string }).id;
    }
    // replace steps
    await supabase
      .from("sequence_steps" as never)
      .delete()
      .eq("sequence_id", seqId!);
    if (steps.length) {
      const rows = steps.map((s, i) => {
        const { id: _omit, ...rest } = s;
        void _omit;
        return { ...rest, sequence_id: seqId!, user_id: userId, position: i };
      });
      const { error } = await supabase.from("sequence_steps" as never).insert(rows as never);
      if (error) throw new Error(`Erro ao salvar etapas da sequência: ${error.message}`);
    }
    return { id: seqId };
  });

// ---------- DELETE / DUPLICATE / STATUS ----------
export const deleteSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("sequences" as never)
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSequenceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "active", "paused"]),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("sequences" as never)
      .update({ status: data.status } as never)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: orig } = await supabase
      .from("sequences" as never)
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!orig) throw new Error("Sequência não encontrada");
    const src = orig as Record<string, unknown>;
    const clone = {
      ...src,
      id: undefined,
      created_at: undefined,
      updated_at: undefined,
      name: `${src.name as string} (cópia)`,
      status: "draft",
    };
    const { data: created, error } = await supabase
      .from("sequences" as never)
      .insert(clone as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const newId = (created as { id: string }).id;
    const { data: steps } = await supabase
      .from("sequence_steps" as never)
      .select("*")
      .eq("sequence_id", data.id)
      .order("position");
    if (steps?.length) {
      const rows = steps.map((s) => {
        const { id: _id, created_at: _c, updated_at: _u, ...rest } = s as Record<string, unknown>;
        void _id;
        void _c;
        void _u;
        return { ...rest, sequence_id: newId, user_id: userId };
      });
      await supabase.from("sequence_steps" as never).insert(rows as never);
    }
    return { id: newId };
  });

// ---------- ENROLL ----------
const EnrollInput = z.object({
  sequence_id: z.string().uuid(),
  phones: z.array(z.string()).min(1).max(500),
  source: z.string().default("manual"),
});
export const enrollContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => EnrollInput.parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: seq } = await supabase
      .from("sequences" as never)
      .select("*")
      .eq("id", data.sequence_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!seq) throw new Error("Sequência não encontrada");
    const s = seq as Record<string, unknown>;
    const now = new Date().toISOString();
    const uniquePhones = Array.from(
      new Set(data.phones.map(normPhone).filter((p) => p.length >= 8)),
    );
    let created = 0,
      skipped = 0,
      restarted = 0;
    for (const phone of uniquePhones) {
      const { data: contactRow } = await supabase
        .from("contacts" as never)
        .select("id")
        .eq("user_id", userId)
        .eq("phone", phone)
        .maybeSingle();
      const contactId = (contactRow as { id?: string } | null)?.id ?? null;
      const { data: existing } = await supabase
        .from("sequence_enrollments" as never)
        .select("id,status")
        .eq("sequence_id", data.sequence_id)
        .eq("phone", phone)
        .maybeSingle();
      if (existing) {
        const policy = s.reenroll_policy as string;
        if (policy === "skip") {
          skipped++;
          continue;
        }
        if (policy === "restart" || policy === "new_run" || policy === "remove_reenroll") {
          await supabase
            .from("sequence_enrollments" as never)
            .update({
              status: "scheduled",
              current_step: 0,
              next_run_at: now,
              entry_source: data.source,
              entry_at: now,
              retry_count: 0,
              last_error: null,
              completed_at: null,
            } as never)
            .eq("id", (existing as { id: string }).id);
          restarted++;
          await supabase.from("sequence_events" as never).insert({
            enrollment_id: (existing as { id: string }).id,
            sequence_id: data.sequence_id,
            user_id: userId,
            type: "restarted",
            message: `Reinscrição via ${data.source}`,
          } as never);
          continue;
        }
        skipped++;
        continue;
      }
      const { data: ins } = await supabase
        .from("sequence_enrollments" as never)
        .insert({
          sequence_id: data.sequence_id,
          user_id: userId,
          contact_id: contactId,
          phone,
          status: "scheduled",
          current_step: 0,
          next_run_at: now,
          entry_source: data.source,
        } as never)
        .select("id")
        .single();
      created++;
      if (ins) {
        await supabase.from("sequence_events" as never).insert({
          enrollment_id: (ins as { id: string }).id,
          sequence_id: data.sequence_id,
          user_id: userId,
          type: "enrolled",
          message: `Inscrito via ${data.source}`,
        } as never);
      }
    }
    return { created, skipped, restarted, total: uniquePhones.length };
  });

// ---------- Enrollment actions ----------
const EnrollActionInput = z.object({
  id: z.string().uuid(),
  action: z.enum(["pause", "resume", "cancel", "restart", "skip_step", "resend_step", "remove"]),
  step: z.number().int().min(0).optional(),
});
export const enrollmentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => EnrollActionInput.parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: en } = await supabase
      .from("sequence_enrollments" as never)
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!en) throw new Error("Contato não encontrado na sequência");
    const e = en as Record<string, unknown>;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    switch (data.action) {
      case "pause":
        patch.status = "paused";
        break;
      case "resume":
        patch.status = "scheduled";
        patch.next_run_at = now;
        break;
      case "cancel":
        patch.status = "cancelled";
        patch.completed_at = now;
        break;
      case "restart":
        patch.status = "scheduled";
        patch.current_step = 0;
        patch.next_run_at = now;
        patch.retry_count = 0;
        patch.last_error = null;
        patch.completed_at = null;
        break;
      case "skip_step":
        patch.current_step = (e.current_step as number) + 1;
        patch.next_run_at = now;
        patch.status = "scheduled";
        patch.retry_count = 0;
        break;
      case "resend_step":
        patch.status = "scheduled";
        patch.next_run_at = now;
        patch.retry_count = 0;
        break;
      case "remove":
        await supabase
          .from("sequence_enrollments" as never)
          .delete()
          .eq("id", data.id);
        return { ok: true, removed: true };
    }
    await supabase
      .from("sequence_enrollments" as never)
      .update(patch as never)
      .eq("id", data.id);
    await supabase.from("sequence_events" as never).insert({
      enrollment_id: data.id,
      sequence_id: e.sequence_id as string,
      user_id: userId,
      type: `action_${data.action}`,
      message: `Ação manual: ${data.action}`,
    } as never);
    return { ok: true };
  });

// ---------- List enrollments + events ----------
export const listEnrollments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        sequence_id: z.string().uuid(),
        status: z.string().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("sequence_enrollments" as never)
      .select("*")
      .eq("sequence_id", data.sequence_id)
      .eq("user_id", userId)
      .order("entry_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows } = await q;
    return { rows: rows ?? [] };
  });

export const listEnrollmentEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ enrollment_id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("sequence_events" as never)
      .select("*")
      .eq("enrollment_id", data.enrollment_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    return { rows: rows ?? [] };
  });
