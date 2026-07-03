import { createFileRoute } from "@tanstack/react-router";

type Ext = {
  keywords?: { enabled?: boolean; mode?: string; list?: string[] };
  hours?: {
    enabled?: boolean; start?: string; end?: string;
    lunch?: boolean; lunchStart?: string; lunchEnd?: string;
    days?: string[]; blockedDates?: string[];
  };
  timing?: {
    delayChar?: number; delayMax?: number; wait?: number;
    humanIntervention?: boolean; reactivation?: number; unknownMsg?: string;
  };
  conversation?: {
    keepUnread?: boolean; singleMessage?: boolean;
    cancelOnNew?: boolean; stopAfterManual?: boolean;
  };
  alerts?: {
    whatsapp?: boolean; stopAfterHandoff?: boolean;
    stopAfterHours?: number; includeSummary?: boolean;
  };
  audio?: {
    enabled?: boolean; replaceText?: boolean; autoReply?: boolean;
    mirrorFormat?: boolean; smartAudio?: boolean; smartAudioChars?: number;
    voice?: string;
  };
  media?: {
    enabled?: boolean;
    items?: Array<{ id: string; name: string; mode?: string; keywords?: string; description?: string; storage_path?: string; mime?: string }>;
  };
};
type ConvMeta = {
  remoteJid?: string;
  pending_until?: string;      // ISO
  pending_texts?: string[];
  agent_paused_until?: string; // ISO
  last_manual_at?: string;     // ISO
  handoff?: boolean;
};

export const Route = createFileRoute("/api/public/evolution/$instance")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const instance = params.instance;
        let payload: any = null;
        const rawBody = await request.text().catch(() => "");
        try { payload = rawBody ? JSON.parse(rawBody) : null; } catch { payload = null; }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find connection by instance_name
        const { data: conn } = await supabaseAdmin
          .from("connections").select("id,user_id,url_api,api_key,instance_name").eq("instance_name", instance).maybeSingle();

        if (!conn) return Response.json({ ok: false, reason: "instance not found" }, { status: 404 });

        // Verify caller: Evolution forwards its instance apikey in the `apikey` header.
        // Evolution v2 may send either the per-instance token (hash.apikey) or the
        // global AUTHENTICATION_API_KEY configured on the server — accept either.
        const providedKey = request.headers.get("apikey") ?? request.headers.get("x-evolution-apikey") ?? "";
        const instanceKey = conn.api_key ?? "";
        let globalKey = "";
        try {
          const { data: setting } = await supabaseAdmin
            .from("settings").select("value").eq("key", "evolution_api").maybeSingle();
          const cfg = (typeof setting?.value === "string" ? JSON.parse(setting.value) : setting?.value) as { api_key?: string } | null;
          if (cfg?.api_key) globalKey = cfg.api_key;
        } catch { /* ignore */ }
        const safeEq = (a: string, b: string) => {
          if (!a || !b || a.length !== b.length) return false;
          let diff = 0;
          for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
          return diff === 0;
        };
        const matchedInstance = !!instanceKey && safeEq(providedKey, instanceKey);
        const matchedGlobal = !!globalKey && safeEq(providedKey, globalKey);
        const matched: "instance" | "global" | "none" =
          matchedInstance ? "instance" : matchedGlobal ? "global" : "none";
        if (matched === "none") {
          const diag = {
            instance,
            matched,
            providedKeyLen: providedKey.length,
            providedKeyPrefix: providedKey ? providedKey.slice(0, 6) : "",
            instanceKeyLen: instanceKey.length,
            instanceKeyPrefix: instanceKey ? instanceKey.slice(0, 6) : "",
            globalKeyLen: globalKey.length,
            globalKeyPrefix: globalKey ? globalKey.slice(0, 6) : "",
          };
          try {
            await (supabaseAdmin.from("logs") as any).insert({
              user_id: conn.user_id,
              level: "warn",
              source: "evolution.webhook",
              message: "invalid signature: apikey did not match instance or global",
              metadata: { ...diag, headers: Object.fromEntries(request.headers) },
            });
          } catch { /* ignore */ }
          return Response.json(
            { ok: false, reason: "invalid signature", diag },
            { status: 401 },
          );
        }
        // Successful match — record which key type authenticated the call.
        try {
          await (supabaseAdmin.from("logs") as any).insert({
            user_id: conn.user_id,
            level: "info",
            source: "evolution.webhook",
            message: `apikey matched: ${matched}`,
            metadata: { instance, matched, providedKeyPrefix: providedKey.slice(0, 6) },
          });
        } catch { /* ignore */ }

        // Log the raw event
        await supabaseAdmin.from("logs").insert({
          user_id: conn.user_id,
          level: "info",
          source: `evolution:${instance}`,
          message: payload?.event ?? "webhook",
          metadata: payload ?? {},
        } as never);

        // Handle connection state updates
        const event = payload?.event;
        if (event === "connection.update" || event === "CONNECTION_UPDATE") {
          const state = payload?.data?.state;
          const status = state === "open" ? "online" : state === "connecting" ? "connecting" : "offline";
          await supabaseAdmin.from("connections").update({
            status,
            last_sync: new Date().toISOString(),
            phone_number: payload?.data?.wuid?.split?.("@")?.[0] ?? undefined,
          }).eq("id", conn.id);
        }

        // Incoming message → run agent → reply
        if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
          try {
            const msg = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
            const fromMe = msg?.key?.fromMe;
            const remoteJid = msg?.key?.remoteJid as string | undefined;
            let text: string | undefined =
              msg?.message?.conversation ??
              msg?.message?.extendedTextMessage?.text ??
              msg?.message?.imageMessage?.caption;
            const audioMsg = msg?.message?.audioMessage;
            let inputWasAudio = false;
            if (!remoteJid) return Response.json({ ok: true, skipped: true });
            // Ignore broadcasts, newsletters and groups (safe default)
            if (
              remoteJid.endsWith("@broadcast") ||
              remoteJid.endsWith("@newsletter") ||
              remoteJid.endsWith("@g.us")
            ) {
              return Response.json({ ok: true, skippedJid: remoteJid });
            }
            // Normalize recipient. Evolution accepts digits or full jid;
            // full jid is safest (handles @lid and @s.whatsapp.net).
            const recipient = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;

            // Auto-save contact from incoming message
            try {
              const phone = remoteJid.split("@")[0]?.replace(/\D/g, "");
              const pushName = (msg?.pushName ?? msg?.notifyName) as string | undefined;
              if (phone) {
                await supabaseAdmin.from("contacts").upsert({
                  user_id: conn.user_id,
                  phone,
                  name: pushName ?? null,
                  source: "whatsapp",
                  status: "active",
                } as never, { onConflict: "user_id,phone", ignoreDuplicates: false } as never);
              }
            } catch { /* non-blocking */ }

            const { data: agent } = await supabaseAdmin
              .from("agents")
              .select("id,system_prompt,temperature,max_tokens,model,category,ai_provider_id,is_active,tools,timezone,memory")
              .eq("connection_id", conn.id).eq("is_active", true)
              .maybeSingle();
            const ext = ((agent?.tools ?? {}) as Ext);

            // Speech-to-text on inbound audio
            if (!fromMe && !text && audioMsg && ext.audio?.enabled) {
              try {
                const b64 = await evolutionGetBase64(conn, msg);
                if (b64) {
                  const transcript = await sttViaLovable(b64);
                  if (transcript) { text = transcript; inputWasAudio = true; }
                }
              } catch (e) {
                await supabaseAdmin.from("logs").insert({
                  user_id: conn.user_id, level: "warn", source: `evolution:${instance}`,
                  message: "stt failed", metadata: { err: e instanceof Error ? e.message : String(e) } as never,
                } as never);
              }
            }
            const convo = agent
              ? await getOrCreateConversation(supabaseAdmin, conn, agent.id, remoteJid)
              : null;
            const cmeta: ConvMeta = (convo?.metadata ?? {}) as ConvMeta;

            // Outbound-from-operator (fromMe): mark manual takeover & pause agent
            if (fromMe) {
              if (agent && convo && (ext.conversation?.stopAfterManual || ext.timing?.humanIntervention)) {
                const reactHrs = Math.max(0, Number(ext.timing?.reactivation ?? 0));
                const until = reactHrs > 0
                  ? new Date(Date.now() + reactHrs * 3600_000).toISOString()
                  : new Date(Date.now() + 24 * 3600_000).toISOString();
                await supabaseAdmin.from("conversations").update({
                  metadata: { ...cmeta, last_manual_at: new Date().toISOString(), agent_paused_until: until },
                  follow_up_paused: true,
                } as never).eq("id", convo.id);
              }
              if (agent && convo && text) {
                await supabaseAdmin.from("messages").insert({
                  user_id: conn.user_id, conversation_id: convo.id,
                  direction: "outbound", type: "text", content: text,
                  metadata: { remoteJid, agent_id: agent.id, manual: true },
                } as never);
              }
              return Response.json({ ok: true, manualOutbound: true });
            }
            if (!text) return Response.json({ ok: true, skipped: "no-text" });

            // Persist inbound message (only when we have a conversation — conversation_id is NOT NULL)
            if (convo) {
              await supabaseAdmin.from("messages").insert({
                user_id: conn.user_id,
                conversation_id: convo.id,
                direction: "inbound",
                type: inputWasAudio ? "audio" : "text",
                content: text,
                metadata: { remoteJid, instance: conn.instance_name, transcribed: inputWasAudio },
              } as never);
            }
            if (convo) {
              await supabaseAdmin.from("conversations").update({
                last_message_at: new Date().toISOString(),
                unread_count: (convo.unread_count ?? 0) + 1,
                follow_up_step: 0, next_follow_up_at: null, follow_up_paused: false,
              } as never).eq("id", convo.id);
            }
            if (!agent) return Response.json({ ok: true, noAgent: true });

            // Agent paused by human intervention window?
            if (cmeta.agent_paused_until && new Date(cmeta.agent_paused_until).getTime() > Date.now()) {
              return Response.json({ ok: true, paused: true });
            }

            // ------- FLOW ENGINE -------
            // If this connection has an active flow (with a valid START node), run it
            // instead of going straight to the AI. QUESTION/YESNO/CAPTURE_NAME pause
            // the flow and the next inbound resumes it via `flow_state` on the conversation.
            {
              const { data: flows } = await supabaseAdmin
                .from("flows")
                .select("id,definition,is_active,trigger,trigger_keywords,connection_id")
                .eq("user_id", conn.user_id)
                .eq("is_active", true);
              const candidates = (flows ?? []) as Array<{ id: string; definition: any; trigger: string | null; trigger_keywords: string[] | null; connection_id: string | null }>;
              // Prefer flow already in progress; else match by connection + keyword; else first for this connection.
              const st = ((convo?.flow_state ?? {}) as { flow_id?: string; finished?: boolean });
              let active = st.flow_id && !st.finished ? candidates.find((f) => f.id === st.flow_id) : null;
              if (!active) {
                const forConn = candidates.filter((f) => !f.connection_id || f.connection_id === conn.id);
                const kwList = (f: typeof forConn[number]) => [
                  ...(f.trigger_keywords ?? []),
                  ...(f.trigger ?? "").split(",").map((s) => s.trim()).filter(Boolean),
                ];
                active = forConn.find((f) => kwList(f).some((k) => k && text!.toLowerCase().includes(k.toLowerCase())))
                  ?? forConn.find((f) => kwList(f).length === 0)
                  ?? null;
              }
              if (active && convo) {
                try {
                  const def = active.definition as { nodes?: any[]; edges?: any[] };
                  if (Array.isArray(def?.nodes) && Array.isArray(def?.edges)) {
                    const { runFlow } = await import("@/lib/flow-runner.server");
                    const result = await runFlow({
                      db: supabaseAdmin,
                      conn: { id: conn.id, user_id: conn.user_id, url_api: conn.url_api, api_key: conn.api_key, instance_name: conn.instance_name },
                      recipient,
                      userText: text,
                      def: { nodes: def.nodes, edges: def.edges },
                      state: st,
                      flowId: active.id,
                    });
                    await supabaseAdmin.from("conversations").update({
                      flow_state: result.state as never,
                      last_message_at: new Date().toISOString(),
                    } as never).eq("id", convo.id);
                    return Response.json({ ok: true, flow: active.id, waiting: !!result.waitingForUser, finished: !!result.finished, handedOff: !!result.handedOff });
                  }
                } catch (e) {
                  await supabaseAdmin.from("logs").insert({
                    user_id: conn.user_id, level: "error", source: `flow:${active.id}`,
                    message: e instanceof Error ? e.message : "flow runtime error", metadata: {} as never,
                  } as never);
                  // fall through to AI as safety net
                }
              }
            }
            // ------- /FLOW ENGINE -------

            // Keyword activation gate (allow/block/regex)
            if (ext.keywords?.enabled && Array.isArray(ext.keywords.list) && ext.keywords.list.length) {
              const mode = (ext.keywords.mode ?? "allow").toLowerCase();
              const matched = ext.keywords.list.some((k) => {
                if (!k) return false;
                if (mode === "regex") { try { return new RegExp(k, "i").test(text); } catch { return false; } }
                return text.toLowerCase().includes(k.toLowerCase());
              });
              if ((mode === "allow" && !matched) || (mode === "activate" && !matched) || (mode === "block" && matched) || (mode === "ignore" && matched)) {
                await supabaseAdmin.from("logs").insert({
                  user_id: conn.user_id, level: "info", source: `evolution:${instance}`,
                  message: "blocked by keyword rule", metadata: { remoteJid, mode } as never,
                } as never);
                return Response.json({ ok: true, skippedByKeyword: true });
              }
            }

            // Working hours gate (weekday + window + optional lunch + blockedDates)
            if (ext.hours?.enabled && ext.hours.start && ext.hours.end) {
              const tz = agent.timezone || "America/Sao_Paulo";
              const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour12: false });
              const parts = fmt.formatToParts(new Date());
              const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
              const nowMin = Number(get("hour")) * 60 + Number(get("minute"));
              const wd = get("weekday").toLowerCase();
              const iso = `${get("year")}-${get("month")}-${get("day")}`;
              const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
              const inHours = nowMin >= toMin(ext.hours.start) && nowMin <= toMin(ext.hours.end);
              const daysOk = !ext.hours.days?.length || ext.hours.days.map((d) => d.toLowerCase().slice(0, 3)).includes(wd);
              const inLunch = !!(ext.hours.lunch && ext.hours.lunchStart && ext.hours.lunchEnd &&
                nowMin >= toMin(ext.hours.lunchStart) && nowMin <= toMin(ext.hours.lunchEnd));
              const blocked = (ext.hours.blockedDates ?? []).includes(iso);
              if (!inHours || !daysOk || inLunch || blocked) {
                const away = ext.timing?.unknownMsg || "Estamos fora do horário de atendimento. Retornaremos em breve.";
                await sendText(conn, recipient, away);
                return Response.json({ ok: true, offHours: true });
              }
            }

            // Debounce (wait): join rapid-fire messages into a single reply
            const waitSec = Math.max(0, Number(ext.timing?.wait ?? 0));
            const singleMessage = !!ext.conversation?.singleMessage;
            if (convo && (waitSec > 0 || singleMessage)) {
              const pendingUntil = new Date(Date.now() + Math.max(waitSec, 3) * 1000).toISOString();
              const pending = Array.isArray(cmeta.pending_texts) ? cmeta.pending_texts.slice(-10) : [];
              pending.push(text);
              await supabaseAdmin.from("conversations").update({
                metadata: { ...cmeta, pending_until: pendingUntil, pending_texts: pending },
              } as never).eq("id", convo.id);

              await sleep(Math.min(Math.max(waitSec, 3), 20) * 1000);

              const { data: fresh } = await supabaseAdmin.from("conversations")
                .select("id,metadata").eq("id", convo.id).maybeSingle();
              const fm = (fresh?.metadata ?? {}) as ConvMeta;
              // If another message came in after us (pending_until moved forward), let that one respond
              if (fm.pending_until && new Date(fm.pending_until).getTime() > new Date(pendingUntil).getTime() + 500) {
                return Response.json({ ok: true, debounced: true });
              }
              // cancelOnNew: if newer inbound arrived while we waited, abort
              if (ext.conversation?.cancelOnNew && (fm.pending_texts?.length ?? 0) > pending.length) {
                return Response.json({ ok: true, cancelledByNewer: true });
              }
            }

            // Compose full inbound text (single-message merge)
            const { data: convFull } = convo
              ? await supabaseAdmin.from("conversations").select("metadata").eq("id", convo.id).maybeSingle()
              : { data: null };
            const meta2 = (convFull?.metadata ?? {}) as ConvMeta;
            const mergedInbound = singleMessage && meta2.pending_texts?.length
              ? meta2.pending_texts.join("\n")
              : text;

            // Memory: last N messages of this conversation
            const memN = Math.max(0, Math.min(100, Number((agent.memory as { messages?: number } | null)?.messages ?? 20)));
            let history: Array<{ role: "user" | "assistant"; content: string }> = [];
            if (convo && memN > 0) {
              const { data: prev } = await supabaseAdmin
                .from("messages")
                .select("direction,content,created_at")
                .eq("conversation_id", convo.id)
                .order("created_at", { ascending: false })
                .limit(memN);
              history = ((prev ?? []) as Array<{ direction: string; content: string }>)
                .reverse()
                .filter((r) => r.content)
                .map((r) => ({ role: r.direction === "outbound" ? "assistant" : "user", content: r.content }));
            }

            // Build endpoint + key
            let endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
            let apiKey = process.env.LOVABLE_API_KEY ?? "";
            const PREFIX: Record<string, string> = { gemini: "google/", openai: "openai/", deepseek: "openai/", grok: "openai/" };
            let modelId = (agent.model ?? "gemini-2.5-flash");
            if (!modelId.includes("/")) modelId = (PREFIX[(agent.category ?? "gemini").toLowerCase()] ?? "google/") + modelId;
            if (agent.ai_provider_id) {
              const { data: p } = await supabaseAdmin
                .from("ai_providers").select("api_key,base_url,model")
                .eq("id", agent.ai_provider_id)
                .eq("user_id", conn.user_id)
                .maybeSingle();
              if (p) {
                apiKey = p.api_key ?? apiKey;
                if (p.base_url) endpoint = p.base_url.replace(/\/+$/, "") + "/chat/completions";
                modelId = agent.model || p.model || modelId;
              }
            }

            const aiRes = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: modelId,
                temperature: Number(agent.temperature ?? 0.7),
                max_tokens: agent.max_tokens ?? 2048,
                messages: [
                  ...(agent.system_prompt ? [{ role: "system", content: agent.system_prompt }] : []),
                  ...history,
                  { role: "user", content: mergedInbound },
                ],
              }),
            });
            const aiJson = await aiRes.json().catch(() => ({} as any));
            let reply: string = aiJson?.choices?.[0]?.message?.content ?? "";
            if (!reply) reply = ext.timing?.unknownMsg ?? "";
            if (!reply) return Response.json({ ok: true, empty: true });

            // Enforce plan send quota (daily/monthly) before dispatch
            const { data: quota } = await supabaseAdmin.rpc("consume_send_quota" as never, { _user_id: conn.user_id } as never);
            const q = (quota ?? {}) as { allowed?: boolean; reason?: string; limit?: number; used?: number };
            if (q && q.allowed === false) {
              await supabaseAdmin.from("logs").insert({
                user_id: conn.user_id, level: "warn", source: `evolution:${instance}`,
                message: `quota exceeded: ${q.reason}`, metadata: q as never,
              } as never);
              await maybeAlert(supabaseAdmin, conn, agent, ext, `Cota atingida: ${q.reason}`);
              return Response.json({ ok: true, quotaBlocked: true, reason: q.reason });
            }

            // Artificial "typing" delay: delayChar (ms/char) capped at delayMax (s), max 20s
            const perChar = Math.max(0, Number(ext.timing?.delayChar ?? 0));
            // delayMax is stored/displayed in milliseconds (label "Delay Máximo (ms)")
            const maxDelayMs = Math.max(0, Number(ext.timing?.delayMax ?? 0));
            if (perChar > 0) {
              const ms = Math.min(reply.length * perChar, maxDelayMs || 20_000, 20_000);
              if (ms > 0) await sleep(ms);
            }

            // Media attachments (keyword-triggered) sent before/instead of text
            let mediaSent = false;
            if (ext.media?.enabled && Array.isArray(ext.media.items)) {
              for (const it of ext.media.items) {
                if (!it.storage_path) continue;
                const shouldSend =
                  it.mode === "all" ||
                  (it.mode === "keyword" && (it.keywords ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => text!.toLowerCase().includes(k))) ||
                  (it.mode === "ai" && (it.description ?? "") && reply.toLowerCase().includes((it.description ?? "").toLowerCase().slice(0, 20)));
                if (!shouldSend) continue;
                const url = await signedMediaUrl(supabaseAdmin, it.storage_path);
                if (!url) continue;
                await sendMedia(conn, recipient, url, it.mime ?? "", it.name);
                mediaSent = true;
              }
            }

            // Decide audio vs text reply
            const wantsAudio = !!ext.audio?.enabled && (
              (ext.audio.mirrorFormat && inputWasAudio) ||
              (ext.audio.smartAudio && reply.length >= Math.max(30, Number(ext.audio.smartAudioChars ?? 120)))
            );
            let sendRes: Response | null = null;
            if (wantsAudio) {
              try {
                const audioB64 = await ttsViaLovable(reply, ext.audio?.voice);
                if (audioB64) {
                  sendRes = await sendAudio(conn, recipient, audioB64);
                }
              } catch (e) {
                await supabaseAdmin.from("logs").insert({
                  user_id: conn.user_id, level: "warn", source: `evolution:${instance}`,
                  message: "tts failed", metadata: { err: e instanceof Error ? e.message : String(e) } as never,
                } as never);
              }
            }
            if (!wantsAudio || !ext.audio?.replaceText) {
              if (!sendRes || !wantsAudio) sendRes = await sendText(conn, recipient, reply);
            }
            if (sendRes && !sendRes.ok) {
              const errText = await sendRes.text().catch(() => "");
              await supabaseAdmin.from("logs").insert({
                user_id: conn.user_id, level: "error", source: `evolution:${instance}`,
                message: `send failed ${sendRes.status}`, metadata: { recipient, body: errText.slice(0, 500) },
              } as never);
              await maybeAlert(supabaseAdmin, conn, agent, ext, `Falha ao enviar (${sendRes.status})`);
            }
            void mediaSent;

            if (convo) {
              await supabaseAdmin.from("messages").insert({
                user_id: conn.user_id,
                conversation_id: convo.id,
                direction: "outbound",
                type: wantsAudio ? "audio" : "text",
                content: reply,
                metadata: { remoteJid, agent_id: agent.id, audio: wantsAudio, media_sent: mediaSent },
              } as never);
            }

            // Clear debounce buffer and (optionally) unread badge
            if (convo) {
              const clearMeta: ConvMeta = { ...meta2, pending_texts: [], pending_until: undefined };
              const patch: Record<string, unknown> = { metadata: clearMeta, last_message_at: new Date().toISOString() };
              if (!ext.conversation?.keepUnread) patch.unread_count = 0;
              await supabaseAdmin.from("conversations").update(patch as never).eq("id", convo.id);
            }
          } catch (e) {
            await supabaseAdmin.from("logs").insert({
              user_id: conn.user_id, level: "error", source: `evolution:${instance}`,
              message: e instanceof Error ? e.message : "agent runtime error", metadata: {},
            } as never);
          }
        }

        return Response.json({ ok: true });
      },
      GET: async ({ params }) =>
        Response.json({ ok: true, instance: params.instance, hint: "POST events here" }),
    },
  },
});

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function sendText(conn: { url_api: string | null; api_key: string | null; instance_name: string | null }, number: string, text: string) {
  return fetch(`${(conn.url_api ?? "").replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
    body: JSON.stringify({ number, text }),
  });
}

async function sendAudio(conn: { url_api: string | null; api_key: string | null; instance_name: string | null }, number: string, audioBase64: string) {
  return fetch(`${(conn.url_api ?? "").replace(/\/+$/, "")}/message/sendWhatsAppAudio/${conn.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
    body: JSON.stringify({ number, audio: audioBase64 }),
  });
}

async function sendMedia(
  conn: { url_api: string | null; api_key: string | null; instance_name: string | null },
  number: string, url: string, mime: string, fileName: string,
) {
  const mediatype = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
  return fetch(`${(conn.url_api ?? "").replace(/\/+$/, "")}/message/sendMedia/${conn.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
    body: JSON.stringify({ number, mediatype, media: url, fileName, mimetype: mime }),
  });
}

async function signedMediaUrl(db: { storage: { from: (b: string) => { createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null }> } } }, path: string) {
  const { data } = await db.storage.from("agent-media").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

async function evolutionGetBase64(conn: { url_api: string | null; api_key: string | null; instance_name: string | null }, message: unknown): Promise<string | null> {
  const r = await fetch(`${(conn.url_api ?? "").replace(/\/+$/, "")}/chat/getBase64FromMediaMessage/${conn.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
    body: JSON.stringify({ message, convertToMp3: true }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null) as { base64?: string } | null;
  return j?.base64 ?? null;
}

async function sttViaLovable(audioBase64: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY ?? "";
  if (!key) return null;
  const bin = Buffer.from(audioBase64, "base64");
  const blob = new Blob([new Uint8Array(bin)], { type: "audio/mpeg" });
  const fd = new FormData();
  fd.append("file", blob, "audio.mp3");
  fd.append("model", "openai/gpt-4o-mini-transcribe");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd,
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null) as { text?: string } | null;
  return j?.text ?? null;
}

async function ttsViaLovable(text: string, voice?: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY ?? "";
  if (!key) return null;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "openai/gpt-4o-mini-tts", input: text.slice(0, 3000), voice: voice || "alloy", response_format: "mp3" }),
  });
  if (!r.ok) return null;
  const buf = await r.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

async function getOrCreateConversation(
  db: { from: (t: string) => any },
  conn: { id: string; user_id: string },
  agentId: string,
  remoteJid: string,
) {
  const { data: existing } = await db.from("conversations")
    .select("id,unread_count,metadata,follow_up_step,next_follow_up_at,follow_up_paused")
    .eq("user_id", conn.user_id).eq("connection_id", conn.id)
    .eq("metadata->>remoteJid", remoteJid).maybeSingle();
  if (existing) return existing;
  const { data: created } = await db.from("conversations").insert({
    user_id: conn.user_id, connection_id: conn.id, agent_id: agentId, status: "open",
    unread_count: 0, last_message_at: new Date().toISOString(),
    metadata: { remoteJid } as never,
  }).select("id,unread_count,metadata,follow_up_step,next_follow_up_at,follow_up_paused").maybeSingle();
  return created;
}

async function maybeAlert(
  db: { from: (t: string) => any },
  conn: { user_id: string; url_api: string | null; api_key: string | null; instance_name: string | null },
  agent: { id: string } | null,
  ext: Ext,
  message: string,
) {
  if (!ext.alerts?.whatsapp || !agent) return;
  const { data: prof } = await db.from("profiles").select("alert_phone").eq("id", conn.user_id).maybeSingle();
  const to = prof?.alert_phone;
  if (!to) return;
  const number = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
  await sendText(conn, number, `⚠️ ${message}`);
  await db.from("logs").insert({
    user_id: conn.user_id, level: "warn", source: "alerts",
    message, metadata: { agent_id: agent.id } as never,
  });
}