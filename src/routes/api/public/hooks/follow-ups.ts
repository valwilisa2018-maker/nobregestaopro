import { createFileRoute } from "@tanstack/react-router";
import { buildEvolutionTextPayload } from "@/lib/evolution-text-payload";

type Ext = {
  followup?: {
    enabled?: boolean;
    aiGenerated?: boolean;
    count?: number;
    intervalHrs?: number;
    checkMin?: number;
    respectHours?: boolean;
    messages?: string[];
  };
  hours?: {
    enabled?: boolean;
    start?: string;
    end?: string;
    lunch?: boolean;
    lunchStart?: string;
    lunchEnd?: string;
    days?: string[];
    blockedDates?: string[];
  };
};

export const Route = createFileRoute("/api/public/hooks/follow-ups")({
  server: {
    handlers: {
      POST: async ({ request }) => runFollowups(request),
      GET: async () =>
        Response.json({
          ok: true,
          hint: "POST with Authorization: Bearer <FOLLOWUP_TRIGGER_SECRET> to trigger runner",
        }),
    },
  },
});

async function loadEvolutionCommandKey(db: { from: (table: string) => any }, fallback: string) {
  const { data: setting } = await db
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
    .select(
      "id,user_id,connection_id,agent_id,last_message_at,metadata,follow_up_step,next_follow_up_at,follow_up_paused",
    )
    .eq("follow_up_paused", false)
    .not("agent_id", "is", null)
    .not("connection_id", "is", null)
    .not("last_message_at", "is", null)
    .or(`next_follow_up_at.lte.${new Date().toISOString()},next_follow_up_at.is.null`)
    .limit(200);

  let processed = 0,
    sent = 0;

  for (const c of convs ?? []) {
    processed++;
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id,user_id,is_active,tools,timezone,system_prompt,temperature,max_tokens")
      .eq("id", c.agent_id!)
      .eq("is_active", true)
      .maybeSingle();
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
      .from("connections")
      .select("id,url_api,api_key,instance_name,status")
      .eq("id", c.connection_id!)
      .maybeSingle();
    if (!conn || conn.status !== "online") continue;
    const commandKey = await loadEvolutionCommandKey(supabaseAdmin, conn.api_key ?? "");

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
    const { data: quota } = await supabaseAdmin.rpc(
      "consume_send_quota" as never,
      { _user_id: agent.user_id } as never,
    );
    const q = (quota ?? {}) as { allowed?: boolean; reason?: string };
    if (q && q.allowed === false) {
      await supabaseAdmin.from("logs").insert({
        user_id: agent.user_id,
        level: "warn",
        source: "followups",
        message: `quota exceeded: ${q.reason}`,
        metadata: q as never,
      } as never);
      continue;
    }

    const send = await fetch(
      `${/^https?:\/\//i.test((conn.url_api ?? "").trim()) ? (conn.url_api ?? "").trim().replace(/\/+$/, "") : "https://" + (conn.url_api ?? "").trim().replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: commandKey },
        body: JSON.stringify(buildEvolutionTextPayload(remoteJid, text)),
      },
    );
    if (!send.ok) {
      await supabaseAdmin.rpc(
        "release_send_quota" as never,
        { _user_id: agent.user_id } as never,
      );
      await supabaseAdmin.from("logs").insert({
        user_id: agent.user_id,
        level: "error",
        source: "followups",
        message: `sendText failed ${send.status}`,
        metadata: { remoteJid } as never,
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
    await supabaseAdmin
      .from("conversations")
      .update({
        follow_up_step: nextStep,
        next_follow_up_at:
          nextStep >= maxCount ? null : new Date(Date.now() + intervalMs).toISOString(),
        follow_up_paused: nextStep >= maxCount,
        last_message_at: new Date().toISOString(),
      } as never)
      .eq("id", c.id);
    sent++;
  }

  // === UI-based followup campaigns (public.followups + followup_steps) ===
  const campaign = await runCampaignFollowups(supabaseAdmin);

  return Response.json({ ok: true, processed, sent, campaign });
}

type Campaign = {
  id: string;
  user_id: string;
  connection_id: string | null;
  inactivity_value: number;
  inactivity_unit: "minutes" | "hours" | "days";
  is_active: boolean;
  stop_on_reply: boolean;
  total_sent: number;
  total_replied: number;
};
type CampaignStep = {
  step_order: number;
  delay_value: number;
  delay_unit: "minutes" | "hours" | "days";
  message: string;
  flow_id?: string | null;
};

function toMs(v: number, u: "minutes" | "hours" | "days") {
  const m = u === "minutes" ? 60_000 : u === "hours" ? 3_600_000 : 86_400_000;
  return Math.max(1, v) * m;
}

async function runCampaignFollowups(db: { from: (t: string) => any }) {
  const { data: campaigns } = await db
    .from("followups")
    .select("*")
    .eq("is_active", true)
    .limit(200);
  let enrolled = 0,
    sent = 0,
    stopped = 0;
  const now = Date.now();

  for (const c of (campaigns ?? []) as Campaign[]) {
    const { data: steps } = await db
      .from("followup_steps")
      .select("*")
      .eq("followup_id", c.id)
      .order("step_order");
    const stepList = (steps ?? []) as CampaignStep[];
    if (!stepList.length) continue;

    // Load connection(s) to send from
    let connectionIds: string[] = [];
    if (c.connection_id) {
      connectionIds = [c.connection_id];
    } else {
      const { data: conns } = await db
        .from("connections")
        .select("id")
        .eq("user_id", c.user_id)
        .eq("status", "online");
      connectionIds = ((conns ?? []) as Array<{ id: string }>).map((x) => x.id);
    }
    if (!connectionIds.length) continue;

    // Fetch candidate conversations
    const { data: convs } = await db
      .from("conversations")
      .select("id,user_id,connection_id,last_message_at,metadata")
      .eq("user_id", c.user_id)
      .in("connection_id", connectionIds)
      .not("last_message_at", "is", null)
      .limit(500);

    for (const conv of (convs ?? []) as Array<{
      id: string;
      user_id: string;
      connection_id: string;
      last_message_at: string;
      metadata: any;
    }>) {
      const meta = (conv.metadata ?? {}) as Record<string, any>;
      const camps = (meta.campaign_followups ?? {}) as Record<
        string,
        { step: number; next_at: string | null; sent_at: string | null; done?: boolean }
      >;
      const state = camps[c.id];
      const lastMsg = new Date(conv.last_message_at).getTime();

      // Stop-on-reply: if there's a state, sent_at exists, and last_message_at is newer than sent_at → user replied
      if (
        state &&
        state.sent_at &&
        !state.done &&
        c.stop_on_reply &&
        lastMsg > new Date(state.sent_at).getTime()
      ) {
        camps[c.id] = { ...state, done: true };
        await db
          .from("conversations")
          .update({ metadata: { ...meta, campaign_followups: camps } })
          .eq("id", conv.id);
        await db
          .from("followups")
          .update({ total_replied: (c.total_replied ?? 0) + 1 })
          .eq("id", c.id);
        c.total_replied = (c.total_replied ?? 0) + 1;
        stopped++;
        continue;
      }
      if (state?.done) continue;

      const stepIdx = state?.step ?? 0;
      if (stepIdx >= stepList.length) continue;

      // Determine when to fire this step
      const triggerAt =
        stepIdx === 0
          ? lastMsg + toMs(c.inactivity_value, c.inactivity_unit)
          : state?.next_at
            ? new Date(state.next_at).getTime()
            : lastMsg + toMs(stepList[stepIdx].delay_value, stepList[stepIdx].delay_unit);
      if (now < triggerAt) continue;

      // Load remoteJid + connection creds
      const remoteJid = (meta.remoteJid ?? meta.jid) as string | undefined;
      if (!remoteJid) continue;
      const { data: conn } = await db
        .from("connections")
        .select("url_api,api_key,instance_name,status")
        .eq("id", conv.connection_id)
        .maybeSingle();
      if (!conn || conn.status !== "online") continue;
      const apiKey = await loadEvolutionCommandKey(db, conn.api_key ?? "");
      const base = /^https?:\/\//i.test((conn.url_api ?? "").trim())
        ? (conn.url_api ?? "").trim().replace(/\/+$/, "")
        : "https://" + (conn.url_api ?? "").trim().replace(/\/+$/, "");

      const text = stepList[stepIdx].message;
      const stepFlowId = stepList[stepIdx].flow_id ?? null;
      if (stepFlowId) {
        const { data: fl } = await db
          .from("flows")
          .select("definition,is_active")
          .eq("id", stepFlowId)
          .eq("user_id", c.user_id)
          .maybeSingle();
        const def = (fl?.definition ?? null) as { nodes?: unknown[]; edges?: unknown[] } | null;
        if (!fl || !def || !Array.isArray(def.nodes) || !Array.isArray(def.edges)) {
          await db.from("logs").insert({
            user_id: c.user_id,
            level: "error",
            source: "followup_campaign",
            message: "Fluxo vinculado inválido ou removido",
            metadata: { followupId: c.id, convId: conv.id, flowId: stepFlowId },
          });
          continue;
        }
        try {
          const { runFlowTracked } = await import("@/lib/flow-tracking.server");
          const result = await runFlowTracked({
            db: db as never,
            conn: {
              id: conv.connection_id,
              user_id: c.user_id,
              url_api: conn.url_api,
              api_key: apiKey,
              instance_name: conn.instance_name,
            },
            recipient: remoteJid,
            userText: "",
            def: { nodes: def.nodes, edges: def.edges } as never,
            state: { variables: {} },
            flowId: stepFlowId,
            conversationId: conv.id,
            connectionId: conv.connection_id,
            userId: c.user_id,
            source: "manual",
          });
          await db
            .from("conversations")
            .update({
              flow_state: result.state as never,
              last_message_at: new Date().toISOString(),
            })
            .eq("id", conv.id);
        } catch (e) {
          await db.from("logs").insert({
            user_id: c.user_id,
            level: "error",
            source: "followup_campaign",
            message: `Falha ao executar fluxo: ${(e as Error).message}`,
            metadata: { followupId: c.id, convId: conv.id, flowId: stepFlowId },
          });
          continue;
        }
      } else {
        const r = await fetch(`${base}/message/sendText/${conn.instance_name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify(buildEvolutionTextPayload(remoteJid, text)),
        });
        if (!r.ok) {
          await db.from("logs").insert({
            user_id: c.user_id,
            level: "error",
            source: "followup_campaign",
            message: `sendText failed ${r.status}`,
            metadata: { followupId: c.id, convId: conv.id },
          });
          continue;
        }
        await db.from("messages").insert({
          user_id: c.user_id,
          conversation_id: conv.id,
          direction: "outbound",
          type: "text",
          content: text,
          metadata: { remoteJid, followup_campaign_id: c.id, step: stepIdx + 1 },
        });
      }

      const nextIdx = stepIdx + 1;
      const nextAt =
        nextIdx < stepList.length
          ? new Date(
              now + toMs(stepList[nextIdx].delay_value, stepList[nextIdx].delay_unit),
            ).toISOString()
          : null;
      camps[c.id] = {
        step: nextIdx,
        next_at: nextAt,
        sent_at: new Date(now).toISOString(),
        done: nextIdx >= stepList.length,
      };
      await db
        .from("conversations")
        .update({ metadata: { ...meta, campaign_followups: camps } })
        .eq("id", conv.id);
      await db
        .from("followups")
        .update({ total_sent: (c.total_sent ?? 0) + 1 })
        .eq("id", c.id);
      c.total_sent = (c.total_sent ?? 0) + 1;
      if (stepIdx === 0) enrolled++;
      sent++;
    }
  }

  return { enrolled, sent, stopped };
}

function inWorkingHours(h: Ext["hours"], tz: string | null | undefined) {
  if (!h?.enabled || !h.start || !h.end) return true;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz || "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const nowMin = Number(get("hour")) * 60 + Number(get("minute"));
  const wd = get("weekday").toLowerCase();
  const iso = `${get("year")}-${get("month")}-${get("day")}`;
  const toMin = (s: string) => {
    const [hh, mm] = s.split(":").map(Number);
    return hh * 60 + (mm || 0);
  };
  const inWindow = nowMin >= toMin(h.start) && nowMin <= toMin(h.end);
  const daysOk = !h.days?.length || h.days.map((d) => d.toLowerCase().slice(0, 3)).includes(wd);
  const inLunch = !!(
    h.lunch &&
    h.lunchStart &&
    h.lunchEnd &&
    nowMin >= toMin(h.lunchStart) &&
    nowMin <= toMin(h.lunchEnd)
  );
  const blocked = (h.blockedDates ?? []).includes(iso);
  return inWindow && daysOk && !inLunch && !blocked;
}

async function generateFollowUp(
  db: { from: (t: string) => any; rpc?: unknown },
  agent: {
    user_id: string;
    system_prompt: string | null;
    temperature: number | null;
    max_tokens: number | null;
  },
  convId: string,
  step: number,
): Promise<string | null> {
  const { data: prev } = await db
    .from("messages")
    .select("direction,content")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = ((prev ?? []) as Array<{ direction: string; content: string }>)
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({
      role: (m.direction === "outbound" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    }));

  const { resolveAIConfig } = await import("@/lib/ai-resolver.server");
  const { checkAiBalance, consumeAiTokens, InsufficientCreditsError } =
    await import("@/lib/ai-credits.server");
  const { callChatCompletions, extractAssistantText } =
    await import("@/lib/ai-chat-request.server");
  const { endpoint, apiKey, model: modelId } = await resolveAIConfig(db as never, agent.user_id);
  const bal = await checkAiBalance(db as never, agent.user_id);
  if (!bal.ok) return null;
  const sysAdd = `\n\n[FOLLOW-UP] Este é o follow-up #${step + 1}. O cliente ficou em silêncio. Reengaje de forma humana, curta (1-2 frases) e leve, sem soar insistente. Faça UMA pergunta aberta.`;
  const { json: j } = await callChatCompletions({
    endpoint,
    apiKey,
    model: modelId,
    temperature: Number(agent.temperature ?? 0.7),
    maxTokens: Math.min(agent.max_tokens ?? 512, 512),
    messages: [
      ...(agent.system_prompt
        ? [{ role: "system" as const, content: agent.system_prompt + sysAdd }]
        : [{ role: "system" as const, content: sysAdd }]),
      ...history,
    ],
  });
  try {
    await consumeAiTokens(db as never, {
      userId: agent.user_id,
      agentId: null,
      model: modelId,
      inputTokens: Number(j?.usage?.prompt_tokens ?? 0),
      outputTokens: Number(j?.usage?.completion_tokens ?? 0),
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return null;
    throw e;
  }
  return extractAssistantText(j) || null;
}
