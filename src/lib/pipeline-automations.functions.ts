import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildEvolutionTextPayload } from "@/lib/evolution-text-payload";
import { getStageAutomation, renderTemplate } from "./pipeline-automations";

const Input = z.object({
  dealId: z.string().uuid(),
  fromStageId: z.string().uuid().nullable().optional(),
  toStageId: z.string().uuid(),
});

const EVO_TIMEOUT_MS = 15000;

function baseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

async function evoSendText(
  url: string,
  apiKey: string,
  instance: string,
  number: string,
  text: string,
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), EVO_TIMEOUT_MS);
  try {
    const r = await fetch(`${baseUrl(url)}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(buildEvolutionTextPayload(number, text, { delay: 500 })),
      signal: controller.signal,
    });
    const body = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, body };
  } finally {
    clearTimeout(t);
  }
}

export const runStageAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: deal, error: dErr } = await supabase
      .from("pipeline_deals")
      .select("*")
      .eq("id", data.dealId)
      .eq("user_id", userId)
      .maybeSingle();
    if (dErr || !deal) return { ok: false, reason: "deal_not_found" };

    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id,name")
      .eq("id", data.toStageId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!stage) return { ok: false, reason: "stage_not_found" };

    const auto = getStageAutomation(stage.name);
    if (!auto) return { ok: true, ran: [] };

    const vars = {
      name: (deal.title as string | null) ?? null,
      company: (deal.company as string | null) ?? null,
      product: (deal.product as string | null) ?? null,
      value: null,
    };
    const ran: string[] = [];
    const patch: Record<string, unknown> = { last_interaction_at: new Date().toISOString() };

    // Reminder — sets next_contact_at if not already set
    if (auto.reminderDays && !deal.next_contact_at) {
      const dt = new Date();
      dt.setDate(dt.getDate() + auto.reminderDays);
      patch.next_contact_at = dt.toISOString();
      ran.push("reminder");
      await supabase.from("pipeline_activities").insert({
        user_id: userId,
        deal_id: deal.id,
        type: "reminder_set",
        from_stage: data.fromStageId ?? null,
        to_stage: data.toStageId,
        payload: { days: auto.reminderDays, next_contact_at: patch.next_contact_at },
      } as never);
    }

    // WhatsApp
    const wpp = String(deal.whatsapp || deal.phone || "").replace(/\D+/g, "");
    if (auto.whatsapp && wpp) {
      const text = renderTemplate(auto.whatsapp, vars);
      const { data: conn } = await supabase
        .from("connections")
        .select("id,url_api,instance_name,api_key,status")
        .eq("user_id", userId)
        .in("status", ["connected", "open", "active"])
        .limit(1)
        .maybeSingle();
      let sent = false;
      let error: string | null = null;
      let stack: string | null = null;
      if (conn && conn.url_api && conn.instance_name && conn.api_key) {
        try {
          const r = await evoSendText(conn.url_api, conn.api_key, conn.instance_name, wpp, text);
          sent = r.ok;
          if (!r.ok) error = `HTTP ${r.status}: ${r.body.slice(0, 200)}`;
        } catch (e) {
          error = e instanceof Error ? e.message : "erro desconhecido";
          stack = e instanceof Error ? (e.stack ?? null) : null;
        }
      } else {
        error = "sem conexão WhatsApp ativa";
      }
      ran.push(sent ? "whatsapp_sent" : "whatsapp_failed");
      await supabase.from("pipeline_activities").insert({
        user_id: userId,
        deal_id: deal.id,
        type: sent ? "whatsapp_sent" : "whatsapp_failed",
        from_stage: data.fromStageId ?? null,
        to_stage: data.toStageId,
        payload: { to: wpp, text, error, stack },
      } as never);
    }

    // Email — infra não configurada; registra intenção no histórico
    if (auto.email && deal.email) {
      const subject = renderTemplate(auto.email.subject, vars);
      const body = renderTemplate(auto.email.body, vars);
      ran.push("email_queued");
      await supabase.from("pipeline_activities").insert({
        user_id: userId,
        deal_id: deal.id,
        type: "email_queued",
        from_stage: data.fromStageId ?? null,
        to_stage: data.toStageId,
        payload: { to: deal.email, subject, body, note: "requer domínio de e-mail configurado" },
      } as never);
    }

    // Task — registra no histórico para o cliente ver / usar no calendário
    if (auto.task) {
      const title = renderTemplate(auto.task, vars);
      ran.push("task_created");
      await supabase.from("pipeline_activities").insert({
        user_id: userId,
        deal_id: deal.id,
        type: "task_created",
        from_stage: data.fromStageId ?? null,
        to_stage: data.toStageId,
        payload: {
          title,
          due_at: patch.next_contact_at ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          duration_min: auto.taskDurationMin ?? 30,
        },
      } as never);
    }

    if (Object.keys(patch).length > 0) {
      await supabase
        .from("pipeline_deals")
        .update(patch as never)
        .eq("id", deal.id)
        .eq("user_id", userId);
    }

    return { ok: true, ran };
  });
