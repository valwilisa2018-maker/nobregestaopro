// Server-only flow execution engine. Runs a visual flow (nodes+edges from the
// React Flow builder) against a WhatsApp conversation. Called from the
// Evolution webhook handler.
import { buildEvolutionTextPayload } from "@/lib/evolution-text-payload";

type NodeKind =
  | "START" | "MESSAGE" | "CONDITION" | "YESNO" | "IMAGE" | "VIDEO" | "AUDIO"
  | "QUESTION" | "WAIT" | "WEBHOOK" | "HANDOFF" | "END"
  | "TYPING" | "RECORDING" | "TAGS" | "CAPTURE_NAME" | "SCHEDULE" | "BROADCAST" | "SEQUENCE";

type FlowNode = {
  id: string;
  data: {
    kind: NodeKind;
    label?: string;
    text?: string;
    url?: string;
    condition?: string;
    variable?: string;
    seconds?: number;
    nextTrigger?: string;
    mediaName?: string;
  };
};
type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };
type FlowDef = { nodes: FlowNode[]; edges: FlowEdge[] };

export type FlowState = {
  flow_id?: string;
  current_node?: string | null;
  awaiting?: { node_id: string; variable?: string } | null;
  variables?: Record<string, string>;
  finished?: boolean;
  updated_at?: string;
};

export type RunnerConn = {
  url_api: string | null;
  api_key: string | null;
  instance_name: string | null;
  user_id: string;
  id: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function abortSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function nextNode(def: FlowDef, from: string, handle?: string): string | null {
  const outgoing = def.edges.filter((e) => e.source === from);
  if (!outgoing.length) return null;
  if (!handle || handle === "out") {
    const plain = outgoing.find((e) => !e.sourceHandle || e.sourceHandle === "out");
    return (plain ?? outgoing[0]).target;
  }
  // Exact handle match first
  const exact = outgoing.find((e) => e.sourceHandle === handle);
  if (exact) return exact.target;
  // Fallback: match by edge id containing sim/não/nao (fluxos gerados por IA
  // frequentemente omitem sourceHandle mas colocam a intenção no id da aresta)
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const target = norm(handle) === "sim" ? "sim" : "nao";
  const byId = outgoing.find((e) => norm(e.id ?? "").includes(`-${target}-`) || norm(e.id ?? "").includes(target));
  if (byId) return byId.target;
  // Último recurso: se houver exatamente 2 saídas, assume ordem sim (1ª) / não (2ª)
  if (outgoing.length === 2) return outgoing[target === "sim" ? 0 : 1].target;
  return outgoing[0].target;
}

function interpolate(t: string | undefined, vars: Record<string, string>) {
  if (!t) return "";
  return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

async function ev(conn: RunnerConn, path: string, body: unknown, timeoutMs = 12_000) {
  let base = (conn.url_api ?? "").trim().replace(/\/+$/, "");
  if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
  const timeout = abortSignal(timeoutMs);
  try {
    return await fetch(`${base}${path}/${conn.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: conn.api_key ?? "" },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
  } finally {
    timeout.clear();
  }
}

async function sendText(conn: RunnerConn, number: string, text: string) {
  return ev(conn, "/message/sendText", buildEvolutionTextPayload(number, text));
}
async function sendMedia(conn: RunnerConn, number: string, url: string, kind: "image" | "video" | "audio" | "document", caption?: string) {
  return ev(conn, "/message/sendMedia", { number, mediatype: kind, media: url, caption });
}
async function sendWhatsAppAudio(conn: RunnerConn, number: string, url: string) {
  // O endpoint de voz da Evolution é mais estável com base64 + encoding=true.
  // Se a URL demorar/falhar, cai para sendMedia sem travar o fluxo.
  try {
    const timeout = abortSignal(8_000);
    const media = await fetch(url, { signal: timeout.signal });
    timeout.clear();
    if (media.ok) {
      const audio = arrayBufferToBase64(await media.arrayBuffer());
      const r = await ev(conn, "/message/sendWhatsAppAudio", { number, audio, encoding: true }, 10_000);
      if (r.ok) return r;
      const body = await r.clone().text().catch(() => "");
      console.error("[flow-runner] audio ptt failed", { status: r.status, body: body.slice(0, 500) });
    }
  } catch (e) {
    console.error("[flow-runner] audio base64 failed", { error: String(e) });
  }
  return ev(conn, "/message/sendMedia", { number, mediatype: "audio", media: url }, 8_000);
}
async function sendPresence(conn: RunnerConn, number: string, presence: "composing" | "recording", ms: number) {
  try {
    return await ev(conn, "/chat/sendPresence", { number, delay: ms, presence }, 4_000);
  } catch (e) {
    console.error("[flow-runner] presence failed", { presence, error: String(e) });
    return null;
  }
}

// Very small, safe expression evaluator: supports ==, !=, contains, >, <, and vars.
function evalCondition(expr: string | undefined, vars: Record<string, string>, lastText: string): boolean {
  if (!expr) return false;
  const src = expr.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => JSON.stringify(vars[k] ?? ""));
  const s = src.replace(/\bmensagem\b/gi, JSON.stringify(lastText));
  try {
    // Only allow simple comparison / contains
    const m = s.match(/^\s*(.+?)\s*(==|!=|>=|<=|>|<|contains)\s*(.+?)\s*$/i);
    if (!m) return Boolean(s.trim());
    const [, a, op, b] = m;
    const parse = (v: string) => { try { return JSON.parse(v); } catch { return v.replace(/^["']|["']$/g, ""); } };
    const A = parse(a), B = parse(b);
    switch (op.toLowerCase()) {
      case "==": return String(A) === String(B);
      case "!=": return String(A) !== String(B);
      case ">": return Number(A) > Number(B);
      case "<": return Number(A) < Number(B);
      case ">=": return Number(A) >= Number(B);
      case "<=": return Number(A) <= Number(B);
      case "contains": return String(A).toLowerCase().includes(String(B).toLowerCase());
    }
  } catch { /* fall through */ }
  return false;
}

function isYes(t: string): boolean {
  return /\b(sim|s|yes|y|ok|claro|quero|com certeza|pode|1)\b/i.test(t.trim());
}
function isNo(t: string): boolean {
  return /\b(n(ã|a)o|no|nunca|nao quero|2)\b/i.test(t.trim());
}

export type RunResult = {
  state: FlowState;
  handedOff?: boolean;
  finished?: boolean;
  waitingForUser?: boolean;
};

/**
 * Execute flow starting from `state.current_node` (or START) with the given user input.
 * Runs synchronously until it hits a node that requires waiting on the user (QUESTION/CAPTURE_NAME)
 * or terminal (END/HANDOFF). Returns the updated state to persist.
 */
export async function runFlow(args: {
  db: { from: (t: string) => any };
  conn: RunnerConn;
  recipient: string;      // full jid (e.g. 55XXXX@s.whatsapp.net)
  userText: string;
  def: FlowDef;
  state: FlowState;
  flowId: string;
  conversationId?: string | null;
  userId?: string | null;
}): Promise<RunResult> {
  const { conn, recipient, userText, def, flowId } = args;
  const convoId = args.conversationId ?? null;
  const userId = args.userId ?? conn.user_id ?? null;

  async function logMsg(type: "text" | "image" | "video" | "audio" | "document", content: string, mediaUrl?: string | null) {
    if (!convoId || !userId) return;
    try {
      await args.db.from("messages").insert({
        user_id: userId,
        conversation_id: convoId,
        direction: "outbound",
        type,
        content,
        media_url: mediaUrl ?? null,
        metadata: { remoteJid: recipient, flow_id: flowId, source: "flow", pending: false, sent: true },
      } as never);
      await args.db.from("conversations").update({ last_message_at: new Date().toISOString() } as never).eq("id", convoId);
    } catch { /* best-effort */ }
  }
  const state: FlowState = {
    flow_id: flowId,
    variables: { ...(args.state.variables ?? {}) },
    current_node: args.state.current_node ?? null,
    awaiting: args.state.awaiting ?? null,
    finished: false,
  };

  // If we were awaiting user input, capture it into the awaited variable then advance.
  if (state.awaiting) {
    const { node_id, variable } = state.awaiting;
    if (variable) state.variables![variable] = userText;
    state.awaiting = null;
    // Determine which handle to follow (default "out"; YESNO uses sim/não)
    const node = def.nodes.find((n) => n.id === node_id);
    let handle: string | undefined = "out";
    if (node?.data.kind === "YESNO") {
      handle = isYes(userText) ? "sim" : isNo(userText) ? "não" : "não";
    }
    state.current_node = nextNode(def, node_id, handle);
  } else if (!state.current_node) {
    const start = def.nodes.find((n) => n.data.kind === "START");
    if (!start) return { state: { ...state, finished: true }, finished: true };
    state.current_node = nextNode(def, start.id, "out");
  }

  // Cap iterations AND wall-clock to prevent handler timeouts on
  // TYPING/RECORDING/WAIT nodes chained together.
  let hops = 0;
  const deadline = Date.now() + 25_000;
  while (state.current_node && hops++ < 200) {
    if (Date.now() > deadline) break;
    const node = def.nodes.find((n) => n.id === state.current_node);
    if (!node) break;
    const vars = state.variables ?? {};
    const kind = node.data.kind;

    if (kind === "END") { state.finished = true; state.current_node = null; break; }

    if (kind === "MESSAGE") {
      const t = interpolate(node.data.text ?? node.data.label, vars);
      if (t) { await sendText(conn, recipient, t); await logMsg("text", t); }
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    if (kind === "IMAGE" || kind === "VIDEO" || kind === "AUDIO") {
      const url = node.data.url;
      if (url) {
        const k = kind === "IMAGE" ? "image" : kind === "VIDEO" ? "video" : "audio";
        const caption = interpolate(node.data.text, vars);
        try {
          if (k === "audio") {
            await sendWhatsAppAudio(conn, recipient, url);
          } else {
            await sendMedia(conn, recipient, url, k, caption);
          }
          await logMsg(k, caption, url);
        } catch (e) {
          console.error("[flow-runner] media send failed", { kind: k, url, error: String(e) });
        }
      }
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    if (kind === "TYPING") {
      const ms = Math.min(20_000, Math.max(500, (Number(node.data.seconds ?? 2)) * 1000));
      // Presence dura `ms` no WhatsApp, mas só bloqueamos o handler por até 2s
      // para não estourar o deadline de execução e travar o fluxo no meio.
      await sendPresence(conn, recipient, "composing", ms);
      await sleep(Math.min(ms, 2000));
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    if (kind === "RECORDING") {
      const ms = Math.min(20_000, Math.max(500, (Number(node.data.seconds ?? 3)) * 1000));
      await sendPresence(conn, recipient, "recording", ms);
      await sleep(Math.min(ms, 2000));
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    if (kind === "WAIT") {
      const ms = Math.min(20_000, Math.max(0, (Number(node.data.seconds ?? 1)) * 1000));
      if (ms) await sleep(Math.min(ms, 2000));
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    if (kind === "CONDITION") {
      const ok = evalCondition(node.data.condition, vars, userText);
      state.current_node = nextNode(def, node.id, ok ? "true" : "false");
      continue;
    }
    if (kind === "YESNO") {
      // Ask (send text) then wait for user reply
      const t = interpolate(node.data.text ?? node.data.label, vars);
      if (t) { await sendText(conn, recipient, t); await logMsg("text", t); }
      state.awaiting = { node_id: node.id, variable: node.data.variable };
      return { state, waitingForUser: true };
    }
    if (kind === "QUESTION") {
      const t = interpolate(node.data.text ?? node.data.label, vars);
      if (t) { await sendText(conn, recipient, t); await logMsg("text", t); }
      // Derive a variable name from the label when not explicitly set, so multiple
      // QUESTION nodes don't clobber the same "resposta" slot. Ex.: "Pergunta Empresa" -> "empresa"
      const derived = (node.data.label ?? "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/^\s*(pergunta|question)\s+/i, "")
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      state.awaiting = { node_id: node.id, variable: node.data.variable || derived || "resposta" };
      return { state, waitingForUser: true };
    }
    if (kind === "CAPTURE_NAME") {
      const t = interpolate(node.data.text || "Qual o seu nome?", vars);
      await sendText(conn, recipient, t);
      await logMsg("text", t);
      state.awaiting = { node_id: node.id, variable: "nome" };
      return { state, waitingForUser: true };
    }
    if (kind === "TAGS") {
      const tags = (node.data.text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (tags.length) {
        // Merge into conversations.metadata.tags (schema has no top-level tags column)
        const { data: existing } = await args.db.from("conversations")
          .select("id,metadata")
          .eq("connection_id", conn.id)
          .eq("metadata->>remoteJid", recipient)
          .maybeSingle();
        if (existing) {
          const prev = (existing.metadata ?? {}) as Record<string, unknown>;
          const prevTags = Array.isArray((prev as { tags?: unknown[] }).tags) ? ((prev as { tags: string[] }).tags) : [];
          const merged = Array.from(new Set([...prevTags, ...tags]));
          await args.db.from("conversations").update({
            metadata: { ...prev, tags: merged },
          } as never).eq("id", existing.id);
        }
      }
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    if (kind === "SEQUENCE") {
      const tags = (node.data.text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const nextTrigger = (node.data.nextTrigger ?? "").trim();
      const { data: existing } = await args.db.from("conversations")
        .select("id,metadata")
        .eq("connection_id", conn.id)
        .eq("metadata->>remoteJid", recipient)
        .maybeSingle();
      if (existing) {
        const prev = (existing.metadata ?? {}) as Record<string, unknown>;
        const prevTags = Array.isArray((prev as { tags?: unknown[] }).tags) ? ((prev as { tags: string[] }).tags) : [];
        const mergedTags = Array.from(new Set([...prevTags, ...tags]));
        const prevSeqs = Array.isArray((prev as { sequences?: unknown[] }).sequences)
          ? ((prev as { sequences: string[] }).sequences)
          : [];
        const mergedSeqs = nextTrigger ? Array.from(new Set([...prevSeqs, nextTrigger])) : prevSeqs;
        const patch: Record<string, unknown> = { ...prev, tags: mergedTags, sequences: mergedSeqs };
        if (nextTrigger) patch.pending_flow_trigger = nextTrigger;
        await args.db.from("conversations").update({ metadata: patch } as never).eq("id", existing.id);
      }
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    if (kind === "SCHEDULE") {
      const link = node.data.url || "";
      const t = interpolate(node.data.text || "Agende um horário:", vars);
      const msg = `${t}${link ? `\n${link}` : ""}`;
      await sendText(conn, recipient, msg);
      await logMsg("text", msg);
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    if (kind === "WEBHOOK") {
      const url = node.data.url;
      if (url) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient, text: userText, variables: vars }),
          });
          const json = await res.json().catch(() => null) as Record<string, unknown> | null;
          // Merge string fields into vars
          if (json && typeof json === "object") {
            for (const [k, v] of Object.entries(json)) {
              if (typeof v === "string" || typeof v === "number") state.variables![k] = String(v);
            }
          }
        } catch { /* ignore */ }
      }
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    if (kind === "HANDOFF") {
      const t = interpolate(node.data.text || "Vou transferir você para um atendente.", vars);
      await sendText(conn, recipient, t);
      await logMsg("text", t);
      // Merge (do not clobber) conversation metadata; pause agent 24h.
      const { data: existing } = await args.db.from("conversations")
        .select("id,metadata")
        .eq("connection_id", conn.id)
        .eq("metadata->>remoteJid", recipient)
        .maybeSingle();
      if (existing) {
        const prev = (existing.metadata ?? {}) as Record<string, unknown>;
        await args.db.from("conversations").update({
          metadata: { ...prev, remoteJid: recipient, handoff: true, agent_paused_until: new Date(Date.now() + 24 * 3600_000).toISOString() },
          follow_up_paused: true,
        } as never).eq("id", existing.id);
      }
      state.finished = true;
      state.current_node = null;
      return { state, handedOff: true, finished: true };
    }
    if (kind === "BROADCAST") {
      // Per-conversation runtime is not the place to fan out; log and continue.
      state.current_node = nextNode(def, node.id, "out");
      continue;
    }
    // Unknown → advance
    state.current_node = nextNode(def, node.id, "out");
  }

  if (!state.current_node) state.finished = true;
  return { state, finished: !!state.finished };
}

export type { FlowDef, FlowNode, FlowEdge };
