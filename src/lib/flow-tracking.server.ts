import { runFlow, type FlowDef, type FlowState, type RunResult, type RunnerConn } from "@/lib/flow-runner.server";

type Db = { from: (t: string) => any };

/**
 * Wraps runFlow with flow_executions + flow_execution_logs tracking so every
 * flow run (chat, broadcast, WhatsApp webhook, manual trigger) shows up in
 * Debug de Fluxo.
 */
export async function runFlowTracked(args: {
  db: Db;
  conn: RunnerConn;
  recipient: string;
  userText: string;
  def: FlowDef;
  state: FlowState;
  flowId: string;
  conversationId?: string | null;
  connectionId?: string | null;
  userId: string;
  source: "chat" | "broadcast" | "webhook" | "manual";
}): Promise<RunResult> {
  const { db, userId, flowId, conversationId, connectionId, source, state, userText } = args;
  let execId: string | null = null;

  try {
    // Reuse an in-flight execution for the same convo+flow, else create one.
    if (conversationId) {
      const { data: existing } = await db.from("flow_executions")
        .select("id")
        .eq("user_id", userId)
        .eq("flow_id", flowId)
        .eq("conversation_id", conversationId)
        .eq("is_simulation", false)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      execId = (existing as { id?: string } | null)?.id ?? null;
    }
    if (!execId) {
      const { data: created } = await db.from("flow_executions").insert({
        user_id: userId, flow_id: flowId,
        conversation_id: conversationId ?? null,
        connection_id: connectionId ?? null,
        status: "processing", is_simulation: false,
        current_block_id: state.current_node ?? state.awaiting?.node_id ?? null,
        awaiting_variable: state.awaiting?.variable ?? null,
        variables: (state.variables ?? {}) as never,
      } as never).select("id").single();
      execId = (created as { id?: string } | null)?.id ?? null;
    }
    if (execId) {
      await db.from("flow_execution_logs").insert({
        execution_id: execId, user_id: userId,
        level: "info", event: source === "webhook" ? "user_input" : `trigger:${source}`,
        block_id: state.awaiting?.node_id ?? null,
        message: (userText || `Iniciado via ${source}`).slice(0, 500),
        data: null as never,
      } as never);
    }
  } catch { /* tracking is best-effort */ }

  const runStart = Date.now();
  try {
    const result = await runFlow(args);
    if (execId) {
      const finalStatus = result.handedOff || result.finished ? "completed"
        : result.waitingForUser ? "waiting_user_input" : "processing";
      try {
        await db.from("flow_executions").update({
          status: finalStatus,
          current_block_id: result.state.current_node ?? result.state.awaiting?.node_id ?? null,
          awaiting_variable: result.state.awaiting?.variable ?? null,
          variables: (result.state.variables ?? {}) as never,
          completed_at: finalStatus === "completed" ? new Date().toISOString() : null,
          last_error: null,
        } as never).eq("id", execId);
        await db.from("flow_execution_logs").insert({
          execution_id: execId, user_id: userId,
          level: "info",
          event: result.handedOff ? "handoff" : result.finished ? "complete" : result.waitingForUser ? "wait" : "step",
          block_id: result.state.awaiting?.node_id ?? result.state.current_node ?? null,
          message: result.handedOff ? "Transferido para atendente"
            : result.finished ? "Fluxo finalizado"
            : result.waitingForUser ? `Aguardando resposta: ${result.state.awaiting?.variable ?? "usuário"}`
            : "Etapa executada",
          duration_ms: Date.now() - runStart,
          data: null as never,
        } as never);
      } catch { /* best-effort */ }
    }
    return result;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "flow runtime error";
    if (execId) {
      try {
        await db.from("flow_executions").update({
          status: "failed", last_error: errMsg,
        } as never).eq("id", execId);
        await db.from("flow_execution_logs").insert({
          execution_id: execId, user_id: userId,
          level: "error", event: "error",
          message: errMsg, duration_ms: Date.now() - runStart,
          data: null as never,
        } as never);
      } catch { /* best-effort */ }
    }
    throw e;
  }
}