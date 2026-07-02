import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/evolution/$instance")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const instance = params.instance;
        let payload: any = null;
        try { payload = await request.json(); } catch { payload = null; }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find connection by instance_name
        const { data: conn } = await supabaseAdmin
          .from("connections").select("id,user_id,url_api,api_key,instance_name").eq("instance_name", instance).maybeSingle();

        if (!conn) return Response.json({ ok: false, reason: "instance not found" }, { status: 404 });

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
            const text: string | undefined =
              msg?.message?.conversation ??
              msg?.message?.extendedTextMessage?.text ??
              msg?.message?.imageMessage?.caption;
            if (fromMe || !remoteJid || !text) return Response.json({ ok: true, skipped: true });
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

            // Persist inbound message
            await supabaseAdmin.from("messages").insert({
              user_id: conn.user_id,
              direction: "inbound",
              type: "text",
              content: text,
              metadata: { remoteJid, instance: conn.instance_name },
            } as never);

            const { data: agent } = await supabaseAdmin
              .from("agents")
              .select("id,system_prompt,temperature,max_tokens,model,category,ai_provider_id,is_active,tools,timezone")
              .eq("connection_id", conn.id).eq("is_active", true)
              .maybeSingle();
            if (!agent) return Response.json({ ok: true, noAgent: true });

            const ext = (agent.tools ?? {}) as {
              keywords?: { enabled?: boolean; mode?: string; list?: string[] };
              hours?: { enabled?: boolean; start?: string; end?: string; days?: string[] };
              timing?: { unknownMsg?: string };
            };

            // Keyword activation gate
            if (ext.keywords?.enabled && Array.isArray(ext.keywords.list) && ext.keywords.list.length) {
              const t = text.toLowerCase();
              const matched = ext.keywords.list.some((k) => k && t.includes(k.toLowerCase()));
              const mode = ext.keywords.mode ?? "activate";
              if ((mode === "activate" && !matched) || (mode === "ignore" && matched)) {
                return Response.json({ ok: true, skippedByKeyword: true });
              }
            }

            // Working hours gate
            if (ext.hours?.enabled && ext.hours.start && ext.hours.end) {
              const tz = agent.timezone || "America/Sao_Paulo";
              const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
              const parts = fmt.formatToParts(new Date());
              const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
              const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
              const wd = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase();
              const now = Number(hh) * 60 + Number(mm);
              const [sh, sm] = ext.hours.start.split(":").map(Number);
              const [eh, em] = ext.hours.end.split(":").map(Number);
              const inHours = now >= sh * 60 + sm && now <= eh * 60 + em;
              const daysOk = !ext.hours.days?.length || ext.hours.days.map((d) => d.toLowerCase().slice(0, 3)).includes(wd);
              if (!inHours || !daysOk) {
                const away = ext.timing?.unknownMsg || "Estamos fora do horário de atendimento. Retornaremos em breve.";
                await fetch(`${(conn.url_api ?? "").replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
                  body: JSON.stringify({ number: recipient, text: away }),
                });
                return Response.json({ ok: true, offHours: true });
              }
            }

            // Build endpoint + key
            let endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
            let apiKey = process.env.LOVABLE_API_KEY ?? "";
            const PREFIX: Record<string, string> = { gemini: "google/", openai: "openai/", deepseek: "openai/", grok: "openai/" };
            let modelId = (agent.model ?? "gemini-2.5-flash");
            if (!modelId.includes("/")) modelId = (PREFIX[(agent.category ?? "gemini").toLowerCase()] ?? "google/") + modelId;
            if (agent.ai_provider_id) {
              const { data: p } = await supabaseAdmin
                .from("ai_providers").select("api_key,base_url,model").eq("id", agent.ai_provider_id).maybeSingle();
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
                  { role: "user", content: text },
                ],
              }),
            });
            const aiJson = await aiRes.json().catch(() => ({} as any));
            const reply: string = aiJson?.choices?.[0]?.message?.content ?? "";
            if (!reply) return Response.json({ ok: true, empty: true });

            // Enforce plan send quota (daily/monthly) before dispatch
            const { data: quota } = await supabaseAdmin.rpc("consume_send_quota" as never, { _user_id: conn.user_id } as never);
            const q = (quota ?? {}) as { allowed?: boolean; reason?: string; limit?: number; used?: number };
            if (q && q.allowed === false) {
              await supabaseAdmin.from("logs").insert({
                user_id: conn.user_id, level: "warn", source: `evolution:${instance}`,
                message: `quota exceeded: ${q.reason}`, metadata: q as never,
              } as never);
              return Response.json({ ok: true, quotaBlocked: true, reason: q.reason });
            }

            // Send back via Evolution (full jid works for @s.whatsapp.net and @lid)
            const sendRes = await fetch(`${(conn.url_api ?? "").replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
              body: JSON.stringify({ number: recipient, text: reply }),
            });
            if (!sendRes.ok) {
              const errText = await sendRes.text().catch(() => "");
              await supabaseAdmin.from("logs").insert({
                user_id: conn.user_id, level: "error", source: `evolution:${instance}`,
                message: `sendText failed ${sendRes.status}`, metadata: { recipient, body: errText.slice(0, 500) },
              } as never);
            }

            await supabaseAdmin.from("messages").insert({
              user_id: conn.user_id,
              direction: "outbound",
              type: "text",
              content: reply,
              metadata: { remoteJid, agent_id: agent.id },
            } as never);
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