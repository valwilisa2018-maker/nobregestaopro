import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FlowDef, FlowState } from "@/lib/flow-runner.server";

/** Validate a visual flow definition. Returns list of issues. */
export function validateFlowDef(def: FlowDef): {
  ok: boolean;
  issues: Array<{ level: "error" | "warn"; id?: string; message: string }>;
} {
  const issues: Array<{ level: "error" | "warn"; id?: string; message: string }> = [];
  const nodes = def.nodes ?? [];
  const edges = def.edges ?? [];
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!n.id || !n.id.trim()) issues.push({ level: "error", message: "Bloco com id vazio" });
    else if (ids.has(n.id))
      issues.push({ level: "error", id: n.id, message: `ID duplicado: ${n.id}` });
    ids.add(n.id);
    if (!n.data?.kind) issues.push({ level: "error", id: n.id, message: `Bloco ${n.id} sem tipo` });
  }
  const starts = nodes.filter((n) => n.data?.kind === "START");
  if (!starts.length) issues.push({ level: "error", message: "Fluxo sem bloco START" });
  if (starts.length > 1)
    issues.push({ level: "warn", message: `Mais de um START (${starts.length})` });
  if (!nodes.some((n) => n.data?.kind === "END"))
    issues.push({ level: "warn", message: "Fluxo sem END — pode não terminar" });
  for (const e of edges) {
    if (!ids.has(e.source))
      issues.push({
        level: "error",
        message: `Aresta ${e.id} referencia source inexistente ${e.source}`,
      });
    if (!ids.has(e.target))
      issues.push({
        level: "error",
        message: `Aresta ${e.id} referencia target inexistente ${e.target}`,
      });
  }
  // Detect unreachable nodes from START
  if (starts.length) {
    const reach = new Set<string>();
    const stack = [starts[0].id];
    while (stack.length) {
      const id = stack.pop()!;
      if (reach.has(id)) continue;
      reach.add(id);
      for (const e of edges) if (e.source === id && !reach.has(e.target)) stack.push(e.target);
    }
    for (const n of nodes)
      if (!reach.has(n.id) && n.data?.kind !== "START")
        issues.push({ level: "warn", id: n.id, message: `Bloco ${n.id} inalcançável` });
  }
  // QUESTION nodes must have an outbound edge
  for (const n of nodes) {
    const needsOut = [
      "MESSAGE",
      "QUESTION",
      "YESNO",
      "CONDITION",
      "IMAGE",
      "VIDEO",
      "AUDIO",
      "TYPING",
      "RECORDING",
      "WAIT",
      "WEBHOOK",
      "TAGS",
      "SCHEDULE",
      "CAPTURE_NAME",
      "START",
    ].includes(n.data?.kind ?? "");
    if (needsOut && !edges.some((e) => e.source === n.id))
      issues.push({
        level: "warn",
        id: n.id,
        message: `Bloco ${n.id} (${n.data?.kind}) sem saída`,
      });
  }
  return { ok: !issues.some((i) => i.level === "error"), issues };
}

export const validateFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ flowId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: flow, error } = await context.supabase
      .from("flows")
      .select("id,definition")
      .eq("id", data.flowId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!flow) throw new Error("Fluxo não encontrado");
    return validateFlowDef((flow.definition ?? { nodes: [], edges: [] }) as FlowDef);
  });

// ---------- Simulator engine (no WhatsApp send; logs to flow_execution_logs) ----------

type Log = {
  level: "info" | "warn" | "error";
  event: string;
  block_id?: string;
  message?: string;
  data?: Record<string, unknown>;
};

function interp(t: string | undefined, vars: Record<string, string>) {
  if (!t) return "";
  return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}
function nextEdge(def: FlowDef, from: string, handle?: string) {
  const e = def.edges.find(
    (x) => x.source === from && (handle ? (x.sourceHandle ?? "out") === handle : true),
  );
  return e?.target ?? null;
}
function isYes(t: string) {
  return /\b(sim|s|yes|y|ok|claro|quero|1)\b/i.test(t.trim());
}
function evalCond(expr: string | undefined, vars: Record<string, string>, last: string): boolean {
  if (!expr) return false;
  const src = expr
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => JSON.stringify(vars[k] ?? ""))
    .replace(/\bmensagem\b/gi, JSON.stringify(last));
  const m = src.match(/^\s*(.+?)\s*(==|!=|>=|<=|>|<|contains)\s*(.+?)\s*$/i);
  if (!m) return Boolean(src.trim());
  const [, a, op, b] = m;
  const parse = (v: string) => {
    try {
      return JSON.parse(v);
    } catch {
      return v.replace(/^["']|["']$/g, "");
    }
  };
  const A = parse(a),
    B = parse(b);
  switch (op.toLowerCase()) {
    case "==":
      return String(A) === String(B);
    case "!=":
      return String(A) !== String(B);
    case ">":
      return Number(A) > Number(B);
    case "<":
      return Number(A) < Number(B);
    case ">=":
      return Number(A) >= Number(B);
    case "<=":
      return Number(A) <= Number(B);
    case "contains":
      return String(A).toLowerCase().includes(String(B).toLowerCase());
  }
  return false;
}

function runSim(
  def: FlowDef,
  state: FlowState,
  userText: string,
  logs: Log[],
): { state: FlowState; waiting: boolean } {
  const st: FlowState = { ...state, variables: { ...(state.variables ?? {}) } };
  if (st.awaiting) {
    const { node_id, variable } = st.awaiting;
    if (variable) {
      st.variables![variable] = userText;
      logs.push({
        level: "info",
        event: "var_set",
        block_id: node_id,
        message: `${variable} = ${userText}`,
      });
    }
    st.awaiting = null;
    const node = def.nodes.find((n) => n.id === node_id);
    let handle: string | undefined = "out";
    if (node?.data.kind === "YESNO") handle = isYes(userText) ? "sim" : "não";
    st.current_node = nextEdge(def, node_id, handle);
    logs.push({
      level: "info",
      event: "resume",
      block_id: node_id,
      message: `retomou com "${userText}"`,
    });
  } else if (!st.current_node) {
    const start = def.nodes.find((n) => n.data.kind === "START");
    if (!start) {
      st.finished = true;
      logs.push({ level: "error", event: "error", message: "Sem bloco START" });
      return { state: st, waiting: false };
    }
    st.current_node = nextEdge(def, start.id, "out");
    logs.push({ level: "info", event: "block_enter", block_id: start.id, message: "START" });
  }
  let hops = 0;
  while (st.current_node && hops++ < 200) {
    const node = def.nodes.find((n) => n.id === st.current_node);
    if (!node) {
      logs.push({
        level: "error",
        event: "error",
        block_id: st.current_node,
        message: "bloco inexistente",
      });
      break;
    }
    const vars = st.variables ?? {};
    const kind = node.data.kind;
    logs.push({
      level: "info",
      event: "block_enter",
      block_id: node.id,
      message: `${kind}${node.data.label ? " · " + node.data.label : ""}`,
    });
    if (kind === "END") {
      st.finished = true;
      st.current_node = null;
      logs.push({ level: "info", event: "complete", message: "fluxo finalizado" });
      break;
    }
    if (
      kind === "MESSAGE" ||
      kind === "IMAGE" ||
      kind === "VIDEO" ||
      kind === "AUDIO" ||
      kind === "SCHEDULE"
    ) {
      const t = interp(node.data.text ?? node.data.label, vars);
      if (t)
        logs.push({
          level: "info",
          event: "send",
          block_id: node.id,
          message: t,
          data: node.data.url ? { url: node.data.url } : undefined,
        });
      st.current_node = nextEdge(def, node.id, "out");
      continue;
    }
    if (kind === "TYPING" || kind === "RECORDING" || kind === "WAIT") {
      st.current_node = nextEdge(def, node.id, "out");
      continue;
    }
    if (kind === "CONDITION") {
      const ok = evalCond(node.data.condition, vars, userText);
      logs.push({
        level: "info",
        event: "condition",
        block_id: node.id,
        message: `${node.data.condition} → ${ok}`,
      });
      st.current_node = nextEdge(def, node.id, ok ? "true" : "false");
      continue;
    }
    if (kind === "YESNO" || kind === "QUESTION" || kind === "CAPTURE_NAME") {
      const t = interp(node.data.text ?? node.data.label, vars);
      if (t) logs.push({ level: "info", event: "send", block_id: node.id, message: t });
      const variable =
        node.data.variable ||
        (kind === "CAPTURE_NAME"
          ? "nome"
          : (node.data.label ?? "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/^\s*(pergunta|question)\s+/i, "")
              .trim()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "") || "resposta");
      st.awaiting = { node_id: node.id, variable };
      logs.push({
        level: "info",
        event: "wait",
        block_id: node.id,
        message: `aguardando "${variable}"`,
      });
      return { state: st, waiting: true };
    }
    if (kind === "HANDOFF") {
      logs.push({
        level: "info",
        event: "handoff",
        block_id: node.id,
        message: interp(node.data.text || "Transferindo para atendente", vars),
      });
      st.finished = true;
      st.current_node = null;
      return { state: st, waiting: false };
    }
    // TAGS / WEBHOOK / BROADCAST → simulate as no-op
    logs.push({ level: "info", event: "action", block_id: node.id, message: `${kind} (simulado)` });
    st.current_node = nextEdge(def, node.id, "out");
  }
  if (!st.current_node) {
    st.finished = true;
    logs.push({ level: "info", event: "complete", message: "fim do fluxo" });
  }
  if (hops >= 200)
    logs.push({
      level: "warn",
      event: "warn",
      message: "limite de 200 hops atingido (possível loop)",
    });
  return { state: st, waiting: !!st.awaiting };
}

// ---------- Server fns ----------

export const startSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ flowId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: flow, error } = await context.supabase
      .from("flows")
      .select("id,definition,name")
      .eq("id", data.flowId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!flow) throw new Error("Fluxo não encontrado");
    const def = (flow.definition ?? { nodes: [], edges: [] }) as FlowDef;
    const v = validateFlowDef(def);
    const logs: Log[] = [];
    logs.push({ level: "info", event: "start", message: `simulação iniciada · ${flow.name}` });
    if (!v.ok)
      for (const i of v.issues)
        logs.push({ level: i.level, event: "validate", block_id: i.id, message: i.message });
    const result = v.ok
      ? runSim(
          def,
          { variables: {}, current_node: null, awaiting: null, finished: false },
          "",
          logs,
        )
      : { state: { finished: true, variables: {} } as FlowState, waiting: false };

    const started = new Date().toISOString();
    const { data: exec, error: eErr } = await context.supabase
      .from("flow_executions")
      .insert({
        user_id: context.userId,
        flow_id: flow.id,
        status: result.waiting ? "waiting_user_input" : "completed",
        current_block_id: result.state.current_node ?? result.state.awaiting?.node_id ?? null,
        awaiting_variable: result.state.awaiting?.variable ?? null,
        variables: result.state.variables ?? {},
        is_simulation: true,
        started_at: started,
        completed_at: result.waiting ? null : new Date().toISOString(),
        last_error: v.ok
          ? null
          : v.issues
              .filter((i) => i.level === "error")
              .map((i) => i.message)
              .join("; "),
      } as never)
      .select("id")
      .single();
    if (eErr) throw new Error(eErr.message);
    const executionId = (exec as { id: string }).id;
    if (logs.length) {
      await context.supabase.from("flow_execution_logs").insert(
        logs.map((l) => ({
          execution_id: executionId,
          user_id: context.userId,
          level: l.level,
          event: l.event,
          block_id: l.block_id ?? null,
          message: l.message ?? null,
          data: (l.data ?? null) as never,
        })) as never,
      );
    }
    return { executionId, waiting: result.waiting, state: result.state, validation: v };
  });

export const sendSimulationInput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ executionId: z.string().uuid(), text: z.string().max(4000) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: exec, error } = await context.supabase
      .from("flow_executions")
      .select("*")
      .eq("id", data.executionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!exec) throw new Error("Execução não encontrada");
    if (!exec.is_simulation)
      throw new Error("Somente execuções de simulação podem receber input aqui");
    if (exec.status !== "waiting_user_input")
      throw new Error(`Execução não está aguardando (status=${exec.status})`);
    const { data: flow } = await context.supabase
      .from("flows")
      .select("definition")
      .eq("id", exec.flow_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!flow) throw new Error("Fluxo removido");
    const def = (flow.definition ?? { nodes: [], edges: [] }) as FlowDef;

    // Rebuild FlowState from execution row
    const st: FlowState = {
      flow_id: exec.flow_id,
      current_node: exec.current_block_id ?? null,
      awaiting: exec.current_block_id
        ? { node_id: exec.current_block_id, variable: exec.awaiting_variable ?? undefined }
        : null,
      variables: (exec.variables ?? {}) as Record<string, string>,
      finished: false,
    };
    const logs: Log[] = [{ level: "info", event: "user_input", message: data.text }];
    const started = Date.now();
    const result = runSim(def, st, data.text, logs);
    const durMs = Date.now() - started;

    await context.supabase
      .from("flow_executions")
      .update({
        status: result.waiting ? "waiting_user_input" : "completed",
        current_block_id: result.state.current_node ?? result.state.awaiting?.node_id ?? null,
        awaiting_variable: result.state.awaiting?.variable ?? null,
        variables: result.state.variables ?? {},
        completed_at: result.waiting ? null : new Date().toISOString(),
      } as never)
      .eq("id", exec.id);

    if (logs.length) {
      await context.supabase.from("flow_execution_logs").insert(
        logs.map((l, i) => ({
          execution_id: exec.id,
          user_id: context.userId,
          level: l.level,
          event: l.event,
          block_id: l.block_id ?? null,
          message: l.message ?? null,
          data: (l.data ?? null) as never,
          duration_ms: i === logs.length - 1 ? durMs : null,
        })) as never,
      );
    }
    return { waiting: result.waiting, state: result.state };
  });

export const listExecutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("flow_executions")
      .select(
        "id,flow_id,status,current_block_id,awaiting_variable,variables,is_simulation,started_at,updated_at,completed_at,last_error",
      )
      .eq("user_id", context.userId)
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { executions: data ?? [] };
  });

export const deleteExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ executionId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("flow_executions")
      .delete()
      .eq("id", data.executionId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
