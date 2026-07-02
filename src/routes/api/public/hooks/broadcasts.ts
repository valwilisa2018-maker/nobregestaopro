import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/broadcasts")({
  server: {
    handlers: {
      POST: async ({ request }) => runBroadcasts(request),
      GET: async () => Response.json({ ok: true, hint: "POST with Authorization: Bearer <FOLLOWUP_TRIGGER_SECRET>" }),
    },
  },
});

function inWindow(now: Date, ws: string | null, we: string | null, weekdays: number[]): boolean {
  if (weekdays && weekdays.length > 0 && !weekdays.includes(now.getDay())) return false;
  if (!ws || !we) return true;
  const [sh, sm] = ws.split(":").map(Number);
  const [eh, em] = we.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= sh * 60 + sm && mins <= eh * 60 + em;
}

async function runBroadcasts(request: Request | undefined) {
  const auth = request?.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return Response.json({ ok: false }, { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cfg } = await supabaseAdmin
    .from("internal_config" as never)
    .select("value").eq("key", "followup_trigger_secret").maybeSingle<{ value: string }>();
  const expected = cfg?.value ?? process.env.FOLLOWUP_TRIGGER_SECRET ?? "";
  if (!expected || token !== expected) return Response.json({ ok: false }, { status: 401 });

  const now = new Date();
  const { data: broadcasts } = await supabaseAdmin
    .from("broadcasts")
    .select("*")
    .eq("status", "running")
    .limit(50);

  let totalSent = 0, totalErr = 0, processed = 0;

  for (const b of broadcasts ?? []) {
    processed++;
    if (!inWindow(now, b.window_start as string | null, b.window_end as string | null, (b.weekdays as number[]) ?? [])) continue;

    const { data: conn } = await supabaseAdmin.from("connections")
      .select("url_api,api_key,instance_name").eq("id", b.connection_id ?? "").maybeSingle();
    if (!conn?.url_api || !conn?.instance_name) continue;

    if (b.mode === "sequential") {
      const { data: steps } = await supabaseAdmin.from("broadcast_steps")
        .select("step_order,delay_hours,message").eq("broadcast_id", b.id).order("step_order");
      const stepList = steps ?? [];
      if (stepList.length === 0) continue;

      const { data: due } = await supabaseAdmin.from("broadcast_recipients")
        .select("id,phone,contact_id,current_step,timeline")
        .eq("broadcast_id", b.id).eq("status", "pending")
        .lte("next_action_at", now.toISOString()).limit(5);

      for (const r of due ?? []) {
        const idx = r.current_step as number;
        const step = stepList[idx];
        if (!step) continue;
        const text = (step.message as string).replaceAll("{telefone}", r.phone as string).replaceAll("{nome}", "cliente");
        const tl = Array.isArray(r.timeline) ? (r.timeline as any[]) : [];
        try {
          const number = `${(r.phone as string).replace(/\D/g, "")}@s.whatsapp.net`;
          const url = `${conn.url_api.replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
            body: JSON.stringify({ number, text }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          tl.push({ step: idx, at: new Date().toISOString(), status: "sent" });
          const nextIdx = idx + 1;
          const finished = nextIdx >= stepList.length;
          const nextAt = finished ? null : new Date(Date.now() + (stepList[nextIdx].delay_hours as number) * 3600_000).toISOString();
          await supabaseAdmin.from("broadcast_recipients").update({
            current_step: finished ? idx : nextIdx,
            status: finished ? "sent" : "pending",
            sent_at: finished ? new Date().toISOString() : null,
            next_action_at: nextAt, last_step_at: new Date().toISOString(),
            timeline: tl as never,
          } as never).eq("id", r.id);
          if (finished) totalSent++;
        } catch (e) {
          tl.push({ step: idx, at: new Date().toISOString(), status: "error", error: String(e) });
          await supabaseAdmin.from("broadcast_recipients").update({
            status: "error", error: String(e), timeline: tl as never, last_step_at: new Date().toISOString(),
          } as never).eq("id", r.id);
          totalErr++;
        }
      }
    } else {
      // quick / mass
      const today = now.toISOString().slice(0, 10);
      let sentToday = (b.sent_today as number) ?? 0;
      if (b.day_marker !== today) sentToday = 0;
      const dLimit = (b.daily_limit as number | null) ?? 0;
      if (dLimit > 0 && sentToday >= dLimit) continue;

      const batch = dLimit > 0 ? Math.min(5, dLimit - sentToday) : 5;
      const { data: pending } = await supabaseAdmin.from("broadcast_recipients")
        .select("id,phone,contact_id").eq("broadcast_id", b.id).eq("status", "pending").limit(batch);
      const list = pending ?? [];
      if (list.length === 0) {
        await supabaseAdmin.from("broadcasts").update({ status: "done", finished_at: now.toISOString() } as never).eq("id", b.id);
        continue;
      }
      let sent = b.sent_count as number;
      let errored = b.error_count as number;
      for (const r of list) {
        const text = (b.message as string).replaceAll("{telefone}", r.phone as string).replaceAll("{nome}", "cliente");
        try {
          const number = `${(r.phone as string).replace(/\D/g, "")}@s.whatsapp.net`;
          const url = `${conn.url_api.replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
            body: JSON.stringify({ number, text }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await supabaseAdmin.from("broadcast_recipients").update({
            status: "sent", sent_at: new Date().toISOString(),
          } as never).eq("id", r.id);
          sent++; sentToday++; totalSent++;
        } catch (e) {
          await supabaseAdmin.from("broadcast_recipients").update({
            status: "error", error: String(e),
          } as never).eq("id", r.id);
          errored++; totalErr++;
        }
      }
      await supabaseAdmin.from("broadcasts").update({
        sent_count: sent, error_count: errored, sent_today: sentToday, day_marker: today,
      } as never).eq("id", b.id);
    }
  }

  return Response.json({ ok: true, processed, sent: totalSent, error: totalErr });
}