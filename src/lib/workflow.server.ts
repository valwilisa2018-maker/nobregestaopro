// Server-only Workflow engine. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildMessage } from "@/lib/followup.server";
import { normalizePhone, sendWhatsappText } from "@/lib/whatsapp.server";
import type { WorkflowBlock } from "@/lib/workflow-shared";

type RunRow = {
  id: string;
  workflow_id: string;
  workflow_version_id: string | null;
  owner_user_id: string | null;
  seller_id: string | null;
  customer_id: string | null;
  connection_id: string | null;
  phone: string | null;
  status: string;
  current_block_id: string | null;
  context: Record<string, unknown> | null;
};

const MAX_STEPS_PER_TICK = 25;

async function logStep(
  runId: string,
  data: {
    blockId?: string | null;
    blockType?: string | null;
    direction?: "in" | "out" | "system";
    message?: string | null;
    detail?: string | null;
  },
) {
  await supabaseAdmin.from("workflow_run_steps").insert({
    run_id: runId,
    block_id: data.blockId ?? null,
    block_type: data.blockType ?? null,
    direction: data.direction ?? "system",
    message: data.message ?? null,
    detail: data.detail ?? null,
  } as never);
}

async function patchRun(runId: string, patch: Record<string, unknown>) {
  await supabaseAdmin.from("workflow_runs").update(patch as never).eq("id", runId);
}

async function loadBlocks(versionId: string | null): Promise<WorkflowBlock[]> {
  if (!versionId) return [];
  const { data } = await supabaseAdmin
    .from("workflow_versions")
    .select("blocks")
    .eq("id", versionId)
    .maybeSingle();
  const blocks = (data?.blocks ?? []) as unknown;
  return Array.isArray(blocks) ? (blocks as WorkflowBlock[]) : [];
}

function nextBlockId(blocks: WorkflowBlock[], current: WorkflowBlock): string | null {
  if (current.nextId) return current.nextId;
  const index = blocks.findIndex((b) => b.id === current.id);
  const next = index >= 0 ? blocks[index + 1] : undefined;
  return next?.id ?? null;
}

async function messageContext(run: RunRow) {
  const [{ data: customer }, { data: seller }] = await Promise.all([
    run.customer_id
      ? supabaseAdmin
          .from("customers")
          .select("name, company, phone, followup_enabled, followup_paused_until")
          .eq("id", run.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    run.seller_id
      ? supabaseAdmin.from("sellers").select("name").eq("id", run.seller_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { customer, sellerName: seller?.name ?? null };
}

/**
 * Executa o fluxo a partir do bloco atual até precisar esperar (resposta/tempo)
 * ou terminar. Toda mensagem sai pela conexão configurada na execução.
 */
export async function advanceRun(runId: string) {
  const { data: run } = await supabaseAdmin
    .from("workflow_runs")
    .select(
      "id, workflow_id, workflow_version_id, owner_user_id, seller_id, customer_id, connection_id, phone, status, current_block_id, context",
    )
    .eq("id", runId)
    .maybeSingle();
  if (!run) return { ok: false, reason: "Execução não encontrada." };
  const current = run as unknown as RunRow;
  if (["DONE", "FAILED", "CANCELLED", "HANDOFF"].includes(current.status)) {
    return { ok: true, status: current.status };
  }

  const blocks = await loadBlocks(current.workflow_version_id);
  if (!blocks.length) {
    await patchRun(runId, { status: "FAILED", error: "Fluxo sem blocos publicados." });
    return { ok: false, reason: "Fluxo sem blocos publicados." };
  }

  const { data: connection } = current.connection_id
    ? await supabaseAdmin
        .from("whatsapp_connections")
        .select("id, instance_name, state, name")
        .eq("id", current.connection_id)
        .maybeSingle()
    : { data: null };

  const { customer, sellerName } = await messageContext(current);
  if (customer && customer.followup_enabled === false) {
    await patchRun(runId, { status: "CANCELLED", error: "Cliente bloqueou mensagens automáticas." });
    await logStep(runId, { detail: "Cliente não permite mensagens automáticas." });
    return { ok: false, reason: "Cliente bloqueou mensagens automáticas." };
  }

  const phone = normalizePhone(current.phone ?? customer?.phone ?? null);
  const context = { ...(current.context ?? {}) } as Record<string, unknown>;
  let blockId = current.current_block_id ?? blocks[0]!.id;

  for (let step = 0; step < MAX_STEPS_PER_TICK; step += 1) {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) {
      await patchRun(runId, { status: "DONE", current_block_id: null, context });
      return { ok: true, status: "DONE" };
    }

    if (block.type === "send_message") {
      if (!connection?.instance_name || !phone) {
        await patchRun(runId, {
          status: "FAILED",
          current_block_id: block.id,
          error: !phone ? "Cliente sem telefone válido." : "WhatsApp do fluxo indisponível.",
        });
        await logStep(runId, {
          blockId: block.id,
          blockType: block.type,
          detail: !phone ? "Cliente sem telefone válido." : "WhatsApp do fluxo indisponível.",
        });
        return { ok: false, reason: "Envio indisponível." };
      }
      const text = buildMessage(block.text ?? "", {
        customerName: customer?.name ?? null,
        sellerName,
        company: customer?.company ?? null,
      });
      const sent = await sendWhatsappText(connection.instance_name, phone, text);
      if (!sent.ok) {
        await patchRun(runId, {
          status: "FAILED",
          current_block_id: block.id,
          error: sent.message ?? "Falha no envio.",
        });
        await logStep(runId, {
          blockId: block.id,
          blockType: block.type,
          direction: "out",
          message: text,
          detail: sent.message ?? "Falha no envio.",
        });
        return { ok: false, reason: sent.message ?? "Falha no envio." };
      }
      await supabaseAdmin.from("whatsapp_messages").insert({
        connection_id: connection.id,
        instance_name: connection.instance_name,
        customer_id: current.customer_id,
        phone,
        direction: "out",
        body: text,
        origin: "workflow",
        status: "sent",
      } as never);
      await logStep(runId, {
        blockId: block.id,
        blockType: block.type,
        direction: "out",
        message: text,
      });
      await patchRun(runId, { last_message_at: new Date().toISOString() });
      blockId = nextBlockId(blocks, block) ?? "";
      if (!blockId) {
        await patchRun(runId, { status: "DONE", current_block_id: null, context });
        return { ok: true, status: "DONE" };
      }
      continue;
    }

    if (block.type === "wait_reply") {
      const timeout = Number(block.timeoutMinutes) > 0 ? Number(block.timeoutMinutes) : null;
      await patchRun(runId, {
        status: "WAITING_REPLY",
        current_block_id: block.id,
        wait_until: timeout ? new Date(Date.now() + timeout * 60000).toISOString() : null,
        context,
      });
      return { ok: true, status: "WAITING_REPLY" };
    }

    if (block.type === "delay") {
      const minutes = Number(block.waitMinutes) > 0 ? Number(block.waitMinutes) : 60;
      await patchRun(runId, {
        status: "WAITING_TIME",
        current_block_id: block.id,
        wait_until: new Date(Date.now() + minutes * 60000).toISOString(),
        context,
      });
      return { ok: true, status: "WAITING_TIME" };
    }

    if (block.type === "condition") {
      const reply = String(context.last_reply ?? "").toLowerCase();
      const matched = (block.keywords ?? []).some(
        (word) => word && reply.includes(word.toLowerCase()),
      );
      await logStep(runId, {
        blockId: block.id,
        blockType: block.type,
        detail: matched ? "Condição atendida" : "Condição não atendida",
      });
      const target = matched ? block.nextIfMatch : block.nextIfNoMatch;
      blockId = target ?? nextBlockId(blocks, block) ?? "";
      if (!blockId) {
        await patchRun(runId, { status: "DONE", current_block_id: null, context });
        return { ok: true, status: "DONE" };
      }
      continue;
    }

    if (block.type === "assign_seller") {
      // A troca de vendedor nunca muda o dono da automação em silêncio.
      const mode = block.transferMode ?? "keep_owner";
      const targetSellerId = block.transferSellerId ?? current.seller_id;
      await logStep(runId, {
        blockId: block.id,
        blockType: block.type,
        detail:
          mode === "end_current"
            ? "Fluxo encerrado para transferir o atendimento."
            : mode === "start_target"
              ? "Atendimento transferido; fluxo do novo vendedor deve ser iniciado."
              : "Atendimento atribuído mantendo o dono do fluxo.",
      });
      if (mode === "end_current" || mode === "start_target") {
        await patchRun(runId, {
          status: mode === "start_target" ? "HANDOFF" : "DONE",
          current_block_id: block.id,
          context: { ...context, transfer_seller_id: targetSellerId, transfer_mode: mode },
        });
        return { ok: true, status: mode === "start_target" ? "HANDOFF" : "DONE" };
      }
      blockId = nextBlockId(blocks, block) ?? "";
      if (!blockId) {
        await patchRun(runId, { status: "DONE", current_block_id: null, context });
        return { ok: true, status: "DONE" };
      }
      continue;
    }

    if (block.type === "handoff") {
      await patchRun(runId, { status: "HANDOFF", current_block_id: block.id, context });
      await logStep(runId, {
        blockId: block.id,
        blockType: block.type,
        detail: "Encaminhado para atendimento humano.",
      });
      return { ok: true, status: "HANDOFF" };
    }

    // end
    await patchRun(runId, { status: "DONE", current_block_id: block.id, context });
    await logStep(runId, { blockId: block.id, blockType: block.type, detail: "Fluxo concluído." });
    return { ok: true, status: "DONE" };
  }

  await patchRun(runId, { context });
  return { ok: true, status: "RUNNING" };
}

/** Cria a execução de um fluxo para um cliente e já dá o primeiro passo. */
export async function startWorkflowRun(input: {
  workflowId: string;
  customerId: string;
  connectionId?: string | null;
  startedBy?: string | null;
}) {
  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select(
      "id, name, status, owner_user_id, seller_id, tenant_id, default_connection_id, published_version_id",
    )
    .eq("id", input.workflowId)
    .maybeSingle();
  if (!workflow) throw new Error("Workflow não encontrado.");
  if (workflow.status !== "active") throw new Error("Este workflow não está ativo.");
  if (!workflow.published_version_id) throw new Error("Publique o fluxo antes de iniciar.");

  const connectionId = input.connectionId ?? workflow.default_connection_id;
  if (!connectionId) throw new Error("Escolha o WhatsApp que enviará as mensagens.");

  // A conexão precisa pertencer ao vendedor do fluxo (ou ser uma conexão sem dono).
  const { data: connection } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("id, seller_id, active")
    .eq("id", connectionId)
    .maybeSingle();
  if (!connection || !connection.active) throw new Error("WhatsApp indisponível.");
  if (connection.seller_id && workflow.seller_id && connection.seller_id !== workflow.seller_id) {
    throw new Error("Este WhatsApp pertence a outro vendedor.");
  }

  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("id, phone, followup_enabled")
    .eq("id", input.customerId)
    .maybeSingle();
  if (!customer) throw new Error("Cliente não encontrado.");
  if (customer.followup_enabled === false)
    throw new Error("Este cliente não permite mensagens automáticas.");

  const { data: existing } = await supabaseAdmin
    .from("workflow_runs")
    .select("id")
    .eq("workflow_id", workflow.id)
    .eq("customer_id", input.customerId)
    .in("status", ["RUNNING", "WAITING_REPLY", "WAITING_TIME"])
    .maybeSingle();
  if (existing) throw new Error("Este cliente já está neste workflow.");

  const { data: run, error } = await supabaseAdmin
    .from("workflow_runs")
    .insert({
      tenant_id: workflow.tenant_id,
      workflow_id: workflow.id,
      workflow_version_id: workflow.published_version_id,
      owner_user_id: workflow.owner_user_id,
      seller_id: workflow.seller_id,
      customer_id: input.customerId,
      connection_id: connectionId,
      phone: normalizePhone(customer.phone),
      status: "RUNNING",
      started_by: input.startedBy ?? null,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logStep(run!.id, { detail: `Execução iniciada no fluxo "${workflow.name}".` });
  await advanceRun(run!.id);
  return { runId: run!.id };
}

/**
 * Resposta do cliente: resolve conexão → cliente → execução ativa NAQUELA conexão
 * e continua exatamente aquela conversa. Nunca casa apenas pelo telefone.
 */
export async function handleWorkflowIncomingMessage(input: {
  connectionId: string | null;
  customerId: string | null;
  text: string | null;
}) {
  if (!input.connectionId || !input.customerId) return { handled: false };

  const { data: run } = await supabaseAdmin
    .from("workflow_runs")
    .select("id, current_block_id, context")
    .eq("connection_id", input.connectionId)
    .eq("customer_id", input.customerId)
    .in("status", ["WAITING_REPLY", "WAITING_TIME", "RUNNING"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (run) {
    const context = { ...((run.context ?? {}) as Record<string, unknown>), last_reply: input.text };
    await logStep(run.id, { direction: "in", message: input.text, detail: "Resposta do cliente." });

    const { data: full } = await supabaseAdmin
      .from("workflow_runs")
      .select("workflow_version_id, current_block_id")
      .eq("id", run.id)
      .maybeSingle();
    const versionBlocks = await loadBlocks(full?.workflow_version_id ?? null);
    const currentBlock = versionBlocks.find((b) => b.id === full?.current_block_id);
    const next =
      currentBlock && currentBlock.type === "wait_reply"
        ? nextBlockId(versionBlocks, currentBlock)
        : (full?.current_block_id ?? null);
    await patchRun(run.id, {
      status: "RUNNING",
      wait_until: null,
      current_block_id: next,
      context,
    });
    await advanceRun(run.id);
    return { handled: true, runId: run.id };
  }

  // Sem execução ativa: um gatilho de palavra-chave pode iniciar um fluxo desta conexão.
  const reply = (input.text ?? "").toLowerCase();
  if (!reply) return { handled: false };
  const { data: candidates } = await supabaseAdmin
    .from("workflow_triggers")
    .select(
      "id, keyword, trigger_type, active, workflows!inner(id, status, default_connection_id, seller_id)",
    )
    .eq("trigger_type", "keyword")
    .eq("active", true);

  for (const trigger of candidates ?? []) {
    const workflow = (trigger as unknown as { workflows: { id: string; status: string; default_connection_id: string | null } }).workflows;
    if (!workflow || workflow.status !== "active") continue;
    if (workflow.default_connection_id !== input.connectionId) continue;
    const keyword = (trigger.keyword ?? "").toLowerCase().trim();
    if (!keyword || !reply.includes(keyword)) continue;
    try {
      const started = await startWorkflowRun({
        workflowId: workflow.id,
        customerId: input.customerId,
        connectionId: input.connectionId,
      });
      return { handled: true, runId: started.runId };
    } catch {
      return { handled: false };
    }
  }
  return { handled: false };
}

/** Avanço por tempo (esperas e tempo limite de resposta), chamado pelo worker. */
export async function processWorkflowTimers(limit = 25) {
  const now = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("workflow_runs")
    .select("id, status, current_block_id, workflow_version_id")
    .in("status", ["WAITING_TIME", "WAITING_REPLY"])
    .not("wait_until", "is", null)
    .lte("wait_until", now)
    .order("wait_until", { ascending: true })
    .limit(limit);

  let advanced = 0;
  for (const run of due ?? []) {
    const blocks = await loadBlocks(run.workflow_version_id);
    const block = blocks.find((b) => b.id === run.current_block_id);
    const next = block ? nextBlockId(blocks, block) : null;
    if (run.status === "WAITING_REPLY") {
      await logStep(run.id, { detail: "Cliente não respondeu no tempo definido." });
    }
    await patchRun(run.id, { status: "RUNNING", wait_until: null, current_block_id: next });
    await advanceRun(run.id);
    advanced += 1;
  }
  return { advanced };
}

/** Gatilho "cliente novo": inicia o fluxo padrão do vendedor responsável. */
export async function startWorkflowsForNewCustomers(limit = 20) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: triggers } = await supabaseAdmin
    .from("workflow_triggers")
    .select("id, workflow_id, active, workflows!inner(id, status, seller_id, default_connection_id)")
    .eq("trigger_type", "customer_created")
    .eq("active", true);
  if (!triggers?.length) return { started: 0 };

  const { data: customers } = await supabaseAdmin
    .from("customers")
    .select("id, created_at, followup_enabled")
    .gte("created_at", since)
    .eq("followup_enabled", true)
    .limit(limit);

  let started = 0;
  for (const trigger of triggers) {
    const workflow = (trigger as unknown as { workflows: { id: string; status: string } }).workflows;
    if (!workflow || workflow.status !== "active") continue;
    for (const customer of customers ?? []) {
      try {
        await startWorkflowRun({ workflowId: workflow.id, customerId: customer.id });
        started += 1;
      } catch {
        // já está no fluxo, sem telefone, bloqueado: segue em frente.
      }
    }
  }
  return { started };
}
