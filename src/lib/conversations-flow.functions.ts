import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startFlowForConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversationId: string; flowId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Ownership check via RLS-scoped client
    const { data: convo, error: convErr } = await supabase
      .from("conversations")
      .select("id,connection_id,flow_state")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr || !convo) throw new Error("Conversa não encontrada");
    if (!convo.connection_id) throw new Error("Conversa sem conexão");

    const { data: flow, error: flowErr } = await supabase
      .from("flows")
      .select("id,definition")
      .eq("id", data.flowId)
      .maybeSingle();
    if (flowErr || !flow) throw new Error("Fluxo não encontrado");

    // Discover recipient jid from latest message with remoteJid
    const { data: msgs } = await supabase
      .from("messages")
      .select("metadata")
      .eq("conversation_id", convo.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const recipient = (msgs ?? [])
      .map((m) => (m.metadata as { remoteJid?: string } | null)?.remoteJid)
      .find((j): j is string => !!j);
    if (!recipient) throw new Error("Não foi possível identificar o destinatário (sem remoteJid)");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin
      .from("connections")
      .select("id,user_id,url_api,api_key,instance_name")
      .eq("id", convo.connection_id)
      .maybeSingle();
    if (!conn || conn.user_id !== userId) throw new Error("Conexão inválida");

    const def = (flow as { definition: { nodes?: unknown[]; edges?: unknown[] } }).definition;
    if (!Array.isArray(def?.nodes) || !Array.isArray(def?.edges)) {
      throw new Error("Definição de fluxo inválida");
    }

    const { runFlow } = await import("@/lib/flow-runner.server");
    const result = await runFlow({
      db: supabaseAdmin,
      conn: {
        id: conn.id,
        user_id: conn.user_id,
        url_api: conn.url_api,
        api_key: conn.api_key,
        instance_name: conn.instance_name,
      },
      recipient,
      userText: "",
      def: def as { nodes: never[]; edges: never[] },
      state: {},
      flowId: flow.id,
    });

    await supabaseAdmin
      .from("conversations")
      .update({
        flow_state: { ...result.state, updated_at: new Date().toISOString() } as never,
        last_message_at: new Date().toISOString(),
      } as never)
      .eq("id", convo.id);

    return { ok: true, finished: !!result.finished, waiting: !!result.waitingForUser };
  });