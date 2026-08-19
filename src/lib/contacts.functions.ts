import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        q: z.string().optional().default(""),
        status: z.string().optional().default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(20),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("contacts")
      .select("id,name,phone,status,source,tags,created_at,updated_at", { count: "exact" })
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.q.trim()) {
      const term = `%${data.q.trim()}%`;
      q = q.or(`name.ilike.${term},phone.ilike.${term}`);
    }
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const upsertContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().nullable().optional(),
        phone: z.string().min(3),
        status: z.enum(["active", "blocked", "archived"]).default("active"),
        notes: z.string().nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const phone = data.phone.replace(/\D/g, "");
    const payload = {
      user_id: context.userId,
      name: data.name ?? null,
      phone,
      status: data.status,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("contacts")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("contacts")
      .upsert(payload as never, { onConflict: "user_id,phone" } as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: (row?.id as string) ?? "" };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("contacts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkImportContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              name: z.string().nullable().optional(),
              phone: z.string().min(3),
              status: z.enum(["active", "blocked", "archived"]).default("active"),
              notes: z.string().nullable().optional(),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const seen = new Set<string>();
    const payload = data.rows
      .map((r) => ({ ...r, phone: r.phone.replace(/\D/g, "") }))
      .filter((r) => r.phone.length >= 8 && !seen.has(r.phone) && (seen.add(r.phone), true))
      .map((r) => ({
        user_id: context.userId,
        name: r.name ?? null,
        phone: r.phone,
        status: r.status,
        notes: r.notes ?? null,
      }));
    if (payload.length === 0) return { inserted: 0 };
    const { error, count } = await context.supabase
      .from("contacts")
      .upsert(payload as never, { onConflict: "user_id,phone", count: "exact" } as never);
    if (error) throw new Error(error.message);
    return { inserted: count ?? payload.length };
  });

export const listAllContactsForExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contacts")
      .select("name,phone,status,notes,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50000);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });
