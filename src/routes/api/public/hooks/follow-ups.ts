import { createFileRoute } from "@tanstack/react-router";

type Ext = {
  followup?: {
    enabled?: boolean; aiGenerated?: boolean;
    count?: number; intervalHrs?: number; checkMin?: number;
    respectHours?: boolean; messages?: string[];
  };
  hours?: {
    enabled?: boolean; start?: string; end?: string;
    lunch?: boolean; lunchStart?: string; lunchEnd?: string;
    days?: string[]; blockedDates?: string[];
  };
};

export const Route = createFileRoute("/api/public/hooks/follow-ups")({
  server: {
    handlers: {
      POST: async ({ request }) => runFollowups(request),
      GET: async () => Response.json({ ok: true, hint: "POST with Authorization: Bearer <FOLLOWUP_TRIGGER_SECRET> to trigger runner" }),
    },
  },
});

async function runFollowups(request: Request | undefined) {
  const auth = request?.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return Response.json({ ok: false }, { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cfg } = await supabaseAdmin
    .from("internal_config" as never)
    .select("value")
    .eq("key", "followup_trigger_secret")
    .maybeSingle<{ value: string }>();
  const expected = cfg?.value ?? process.env.FOLLOWUP_TRIGGER_SECRET ?? "";
  if (!expected || token !== expected) return Response.json({ ok: false }, { status: 401 });

        // Conversations due for follow-up
        const { data: convs } = await supabaseAdmin
          .from("conversations")
          .select("id,user_id,connection_id,agent_id,last_message_at,metadata,follow_up_step,next_follow_up_at,follow_up_paused")
          .eq("follow_up_paused", false)
          .not("agent_id", "is", null)
          .not("connection_id", "is", null)
          .or(`next_follow_up_at.lte.${new Date().toISOString()},next_follow_up_at.is.null`)
          .limit(200);

        let processed = 0, sent = 0;

        for (const c of convs ?? []) {
          processed++;
          const { data: agent } = await supabaseAdmin
            .from("agents")
            .select("id,user_id,is_active,tools,timezone,system_prompt,model,category,temperature,max_tokens,ai_provider_id")
            .eq("id", c.agent_id!).eq("is_active", true).maybeSingle();
          if (!agent) continue;
          const ext = (agent.tools ?? {}) as Ext;
          const fu = ext.followup;
          if (!fu?.enabled) continue;
          const messages = Array.isArray(fu.messages) ? fu.messages : [];
          if (!fu.aiGenerated && !messages.length) continue;

          const maxCount = Math.max(1, fu.count ?? messages.length ?? 3);
          const step = c.follow_up_step ?? 0;
          if (step >= maxCount) continue;

          const intervalMs = Math.max(1, fu.intervalHrs ?? 24) * 3600_000;
          const checkMs = Math.max(1, fu.checkMin ?? 60) * 60_000;
          const lastAt = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
          const gap = step === 0 ? checkMs : intervalMs;
          if (Date.now() - lastAt < gap) continue;

          if (fu.respectHours && !inWorkingHours(ext.hours, agent.timezone)) continue;

          const { data: conn } = await supabaseAdmin
            .from("connections").select("id,url_api,api_key,instance_name,status")
            .eq("id", c.connection_id!).maybeSingle();
          if (!conn || conn.status !== "online") continue;

          const remoteJid = (c.metadata as { remoteJid?: string } | null)?.remoteJid;
          if (!remoteJid) continue;

          // Compose the follow-up text
          let text = messages[step] ?? messages[messages.length - 1] ?? "";
          if (fu.aiGenerated) {
            const generated = await generateFollowUp(supabaseAdmin, agent, c.id, step);
            if (generated) text = generated;
          }
          if (!text) continue;

          // Quota gate per plan
          const { data: quota } = await supabaseAdmin.rpc("consume_send_quota" as never, { _user_id: agent.user_id } as never);
          const q = (quota ?? {}) as { allowed?: boolean; reason?: string };
          if (q && q.allowed === false) {
            await supabaseAdmin.from("logs").insert({
              user_id: agent.user_id, level: "warn", source: "followups",
              message: `quota exceeded: ${q.reason}`, metadata: q as never,
            } as never);
            continue;
          }

          const send = await fetch(`${(conn.url_api ?? "").replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
            body: JSON.stringify({ number: remoteJid, text }),
          });
          if (!send.ok) {
            await supabaseAdmin.from("logs").insert({
              user_id: agent.user_id, level: "error", source: "followups",
              message: `sendText failed ${send.status}`, metadata: { remoteJid } as never,
            } as never);
            continue;
          }

          await supabaseAdmin.from("messages").insert({
            user_id: agent.user_id,
            conversation_id: c.id,
            direction: "outbound",
            type: "text",
            content: text,
            metadata: { remoteJid, agent_id: agent.id, followup: true, index: step + 1 } as never,
          } as never);

          const nextStep = step + 1;
          await supabaseAdmin.from("conversations").update({
            follow_up_step: nextStep,
            next_follow_up_at: nextStep >= maxCount ? null : new Date(Date.now() + intervalMs).toISOString(),
            follow_up_paused: nextStep >= maxCount,
            last_message_at: new Date().toISOString(),
          } as never).eq("id", c.id);
          sent++;
        }

        return Response.json({ ok: true, processed, sent });
}

function inWorkingHours(h: Ext["hours"], tz: string | null | undefined) {
  if (!h?.enabled || !h.start || !h.end) return true;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz || "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const nowMin = Number(get("hour")) * 60 + Number(get("minute"));
  const wd = get("weekday").toLowerCase();
  const iso = `${get("year")}-${get("month")}-${get("day")}`;
  const toMin = (s: string) => { const [hh, mm] = s.split(":").map(Number); return hh * 60 + (mm || 0); };
  const inWindow = nowMin >= toMin(h.start) && nowMin <= toMin(h.end);
  const daysOk = !h.days?.length || h.days.map((d) => d.toLowerCase().slice(0, 3)).includes(wd);
  const inLunch = !!(h.lunch && h.lunchStart && h.lunchEnd &&
    nowMin >= toMin(h.lunchStart) && nowMin <= toMin(h.lunchEnd));
  const blocked = (h.blockedDates ?? []).includes(iso);
  return inWindow && daysOk && !inLunch && !blocked;
}

async function generateFollowUp(
  db: { from: (t: string) => any; rpc?: unknown },
  agent: { system_prompt: string | null; model: string | null; category: string | null; temperature: number | null; max_tokens: number | null; ai_provider_id: string | null },
  convId: string, step: number,
): Promise<string | null> {
  const { data: prev } = await db.from("messages")
    .select("direction,content").eq("conversation_id", convId)
    .order("created_at", { ascending: false }).limit(20);
  const history = ((prev ?? []) as Array<{ direction: string; content: string }>)
    .reverse().filter((m) => m.content)
    .map((m) => ({ role: m.direction === "outbound" ? "assistant" : "user", content: m.content }));

  let endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
  let apiKey = process.env.LOVABLE_API_KEY ?? "";
  const PREFIX: Record<string, string> = { gemini: "google/", openai: "openai/", deepseek: "openai/", grok: "openai/" };
  let modelId = agent.model ?? "gemini-2.5-flash";
  if (!modelId.includes("/")) modelId = (PREFIX[(agent.category ?? "gemini").toLowerCase()] ?? "google/") + modelId;
  if (agent.ai_provider_id) {
    const { data: p } = await db.from("ai_providers").select("api_key,base_url,model").eq("id", agent.ai_provider_id).maybeSingle();
    if (p) {
      apiKey = p.api_key ?? apiKey;
      if (p.base_url) endpoint = p.base_url.replace(/\/+$/, "") + "/chat/completions";
      modelId = agent.model || p.model || modelId;
    }
  }
  const sysAdd = `\n\n[FOLLOW-UP] Este é o follow-up #${step + 1}. O cliente ficou em silêncio. Reengaje de forma humana, curta (1-2 frases) e leve, sem soar insistente. Faça UMA pergunta aberta.`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId,
      temperature: Number(agent.temperature ?? 0.7),
      max_tokens: Math.min(agent.max_tokens ?? 512, 512),
      messages: [
        ...(agent.system_prompt ? [{ role: "system", content: agent.system_prompt + sysAdd }] : [{ role: "system", content: sysAdd }]),
        ...history,
      ],
    }),
  });
  const j = await res.json().catch(() => ({} as any));
  return j?.choices?.[0]?.message?.content ?? null;
}