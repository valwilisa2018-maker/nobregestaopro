import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateInput = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
  flow_id: z.string().uuid().nullable().optional(),
  media_url: z.string().nullable().optional(),
  media_type: z.string().nullable().optional(),
  connection_id: z.string().uuid().nullable().optional(),
  mode: z.enum(["quick", "sequential"]),
  delay_seconds: z.number().int().min(1).max(3600).default(5),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  contact_ids: z.array(z.string().uuid()).min(1),
});

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: contacts, error: cerr } = await context.supabase
      .from("contacts").select("id,phone,name")
      .eq("user_id", context.userId).in("id", data.contact_ids);
    if (cerr) throw new Error(cerr.message);
    const list = contacts ?? [];
    if (list.length === 0) throw new Error("Nenhum contato válido");

    const { data: b, error: berr } = await context.supabase.from("broadcasts").insert({
      user_id: context.userId,
      connection_id: data.connection_id ?? null,
      flow_id: data.flow_id ?? null,
      name: data.name, message: data.message,
      media_url: data.media_url ?? null, media_type: data.media_type ?? null,
      mode: data.mode, delay_seconds: data.delay_seconds,
      weekdays: data.weekdays,
      status: data.mode === "quick" ? "running" : "scheduled",
      total: list.length,
      started_at: data.mode === "quick" ? new Date().toISOString() : null,
    } as never).select("id").single();
    if (berr) throw new Error(berr.message);
    const broadcastId = b.id as string;

    const recipients = list.map((c) => ({
      broadcast_id: broadcastId, user_id: context.userId,
      contact_id: c.id, phone: c.phone, status: "pending",
    }));
    const { error: rerr } = await context.supabase.from("broadcast_recipients").insert(recipients as never);
    if (rerr) throw new Error(rerr.message);

    return { id: broadcastId, total: list.length };
  });

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("broadcasts")
      .select("id,name,mode,status,total,sent_count,error_count,delay_seconds,created_at,started_at,finished_at")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

/** Process up to `batch` pending recipients for one broadcast. */
export const runBroadcastBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid(), batch: z.number().int().min(1).max(20).default(5) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: b, error: berr } = await context.supabase.from("broadcasts")
      .select("id,message,media_url,media_type,delay_seconds,connection_id,total,sent_count,error_count,status")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (berr || !b) throw new Error(berr?.message ?? "Não encontrado");

    const { data: conn } = await context.supabase.from("connections")
      .select("url_api,api_key,instance_name")
      .eq("id", b.connection_id ?? "").maybeSingle();

    const { data: pending } = await context.supabase.from("broadcast_recipients")
      .select("id,phone,contact_id")
      .eq("broadcast_id", b.id).eq("status", "pending")
      .limit(data.batch);
    const list = pending ?? [];
    if (list.length === 0) {
      await context.supabase.from("broadcasts").update({
        status: "done", finished_at: new Date().toISOString(),
      } as never).eq("id", b.id);
      return { done: true, sent: b.sent_count, error: b.error_count, total: b.total };
    }

    let sent = b.sent_count as number;
    let errored = b.error_count as number;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      // Fetch contact name for variable substitution
      let contactName = "";
      if (r.contact_id) {
        const { data: c } = await context.supabase.from("contacts").select("name").eq("id", r.contact_id).maybeSingle();
        contactName = (c?.name as string | null) ?? "";
      }
      const text = (b.message as string)
        .replaceAll("{nome}", contactName || "cliente")
        .replaceAll("{telefone}", r.phone as string);
      try {
        if (!conn?.url_api || !conn?.instance_name) throw new Error("Instância inválida");
        const number = `${(r.phone as string).replace(/\D/g, "")}@s.whatsapp.net`;
        const url = `${conn.url_api.replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
          body: JSON.stringify({ number, text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await context.supabase.from("broadcast_recipients").update({
          status: "sent", sent_at: new Date().toISOString(),
        } as never).eq("id", r.id);
        sent++;
      } catch (e) {
        await context.supabase.from("broadcast_recipients").update({
          status: "error", error: e instanceof Error ? e.message : String(e),
        } as never).eq("id", r.id);
        errored++;
      }
      // Delay between messages (skip after last in batch)
      if (i < list.length - 1) {
        await new Promise((res) => setTimeout(res, Math.max(1, b.delay_seconds as number) * 1000));
      }
    }
    await context.supabase.from("broadcasts").update({
      sent_count: sent, error_count: errored,
    } as never).eq("id", b.id);
    return { done: false, sent, error: errored, total: b.total };
  });

export const getBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: b, error } = await context.supabase.from("broadcasts")
      .select("id,name,status,total,sent_count,error_count,mode,delay_seconds")
      .eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return b;
  });