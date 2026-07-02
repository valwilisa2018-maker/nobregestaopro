import { createFileRoute } from "@tanstack/react-router";

type Ext = {
  followup?: {
    enabled?: boolean;
    count?: number;
    intervalHrs?: number;
    checkMin?: number;
    messages?: string[];
  };
};

export const Route = createFileRoute("/api/public/hooks/follow-ups")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Active agents that have follow-up enabled and a connection
        const { data: agents } = await supabaseAdmin
          .from("agents")
          .select("id,user_id,connection_id,tools")
          .eq("is_active", true)
          .not("connection_id", "is", null);

        let processed = 0;
        let sent = 0;

        for (const agent of agents ?? []) {
          const ext = (agent.tools ?? {}) as Ext;
          const fu = ext.followup;
          if (!fu?.enabled || !Array.isArray(fu.messages) || !fu.messages.length) continue;
          const intervalMs = Math.max(1, fu.intervalHrs ?? 24) * 3600_000;
          const maxCount = Math.max(1, fu.count ?? fu.messages.length);

          const { data: conn } = await supabaseAdmin
            .from("connections").select("id,url_api,api_key,instance_name,status")
            .eq("id", agent.connection_id!).maybeSingle();
          if (!conn || conn.status !== "online") continue;

          // Pull last 500 msgs for this user's connection to group per contact
          const { data: msgs } = await supabaseAdmin
            .from("messages")
            .select("id,direction,content,created_at,metadata")
            .eq("user_id", agent.user_id)
            .order("created_at", { ascending: false })
            .limit(500);

          type Row = { direction: string | null; created_at: string; metadata: unknown };
          const byJid = new Map<string, Row[]>();
          for (const m of msgs ?? []) {
            const meta = (m.metadata ?? null) as { remoteJid?: string } | null;
            const jid = meta?.remoteJid;
            if (!jid) continue;
            if (!byJid.has(jid)) byJid.set(jid, []);
            byJid.get(jid)!.push(m as Row);
          }

          for (const [jid, list] of byJid) {
            processed++;
            const last = list[0];
            if (!last) continue;
            const ageMs = Date.now() - new Date(last.created_at).getTime();
            if (ageMs < intervalMs) continue;
            // How many follow-ups already sent
            const already = list.filter((m) => (m.metadata as { followup?: boolean } | null)?.followup).length;
            if (already >= maxCount) continue;
            // Only follow up when the last message was from the user (inbound) or a previous follow-up
            if (last.direction === "outbound" && !(last.metadata as { followup?: boolean } | null)?.followup) continue;

            const text = fu.messages[already % fu.messages.length];
            if (!text) continue;

            const send = await fetch(`${(conn.url_api ?? "").replace(/\/+$/, "")}/message/sendText/${conn.instance_name}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
              body: JSON.stringify({ number: jid, text }),
            });
            if (!send.ok) continue;

            await supabaseAdmin.from("messages").insert({
              user_id: agent.user_id,
              direction: "outbound",
              type: "text",
              content: text,
              metadata: { remoteJid: jid, agent_id: agent.id, followup: true, index: already + 1 },
            } as never);
            sent++;
          }
        }

        return Response.json({ ok: true, processed, sent });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to trigger follow-up runner" }),
    },
  },
});