import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TRIGGER_TYPES, validateBlocks, type WorkflowBlock } from "@/lib/workflow-shared";

type Ctx = {
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  userId: string;
  claims: Record<string, unknown>;
};

async function isManager(ctx: Ctx) {
  for (const role of ["admin", "super_admin"]) {
    const res = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
    if (res.data === true) return true;
  }
  return false;
}

async function assertPermission(ctx: Ctx, action: string) {
  const { data } = await ctx.supabase.rpc("has_permission", {
    _user_id: ctx.userId,
    _module: "workflow",
    _action: action,
  });
  if (data === true) return;
  if (await isManager(ctx)) return;
  throw new Error("Sem permissão para esta ação.");
}

/** Vendedor vinculado ao usuário logado — a origem confiável do seller_id. */
async function mySeller(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sellers")
    .select("id, name")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** Nunca confia no seller_id do navegador. */
async function resolveSeller(ctx: Ctx, requestedSellerId?: string | null) {
  const own = await mySeller(ctx.userId);
  if (!requestedSellerId || requestedSellerId === own?.id) return own;
  if (!(await isManager(ctx))) {
    throw new Error("Você só pode criar fluxos para o seu próprio cadastro de vendedor.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sellers")
    .select("id, name")
    .eq("id", requestedSellerId)
    .maybeSingle();
  if (!data) throw new Error("Vendedor não encontrado.");
  return data;
}

async function assertConnectionAllowed(sellerId: string | null, connectionId?: string | null) {
  if (!connectionId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("id, seller_id, active")
    .eq("id", connectionId)
    .maybeSingle();
  if (!data || !data.active) throw new Error("WhatsApp indisponível.");
  if (data.seller_id && sellerId && data.seller_id !== sellerId) {
    throw new Error("Este WhatsApp pertence a outro vendedor.");
  }
}

async function loadWorkflowForWrite(ctx: Ctx, workflowId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle();
  if (!data) throw new Error("Workflow não encontrado.");
  if (data.owner_user_id !== ctx.userId && !(await isManager(ctx))) {
    throw new Error("Este workflow pertence a outro vendedor.");
  }
  return data;
}

async function audit(ctx: Ctx, action: string, details: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/whatsapp.server");
  await logAudit(
    action,
    details,
    typeof ctx.claims.email === "string" ? ctx.claims.email : null,
    ctx.userId,
  );
}

export const workflowOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { filter?: "mine" | "all" | "shared" | "templates"; sellerId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "view");
    const manager = await isManager(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const seller = await mySeller(ctx.userId);
    const filter = data.filter ?? "mine";

    let query = supabaseAdmin
      .from("workflows")
      .select("*, sellers(name), whatsapp_connections(name, state)")
      .order("created_at", { ascending: false });

    if (filter === "mine") query = query.eq("owner_user_id", ctx.userId);
    if (filter === "templates") query = query.eq("is_template", true);
    if (filter === "shared") query = query.eq("visibility", "shared").neq("owner_user_id", ctx.userId);
    if (filter === "all") {
      if (!manager) query = query.eq("owner_user_id", ctx.userId);
      else if (data.sellerId) query = query.eq("seller_id", data.sellerId);
    }

    const runsQuery = supabaseAdmin
      .from("workflow_runs")
      .select(
        "id, status, created_at, updated_at, workflow_id, seller_id, customer_id, connection_id, owner_user_id, error, workflows(name), customers(name), sellers(name), whatsapp_connections(name)",
      )
      .order("updated_at", { ascending: false })
      .limit(300);

    const [{ data: workflows }, { data: runs }, { data: sellers }, { data: connections }] =
      await Promise.all([
        query,
        manager
          ? data.sellerId
            ? runsQuery.eq("seller_id", data.sellerId)
            : runsQuery
          : runsQuery.eq("owner_user_id", ctx.userId),
        supabaseAdmin.from("sellers").select("id, name, user_id").eq("active", true).order("name"),
        supabaseAdmin
          .from("whatsapp_connections")
          .select("id, name, state, seller_id, phone_number")
          .eq("active", true)
          .order("name"),
      ]);

    return {
      workflows: workflows ?? [],
      runs: runs ?? [],
      sellers: sellers ?? [],
      connections: connections ?? [],
      me: { userId: ctx.userId, manager, sellerId: seller?.id ?? null, sellerName: seller?.name ?? null },
    };
  });

export const workflowDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "view");
    const manager = await isManager(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: workflow } = await supabaseAdmin
      .from("workflows")
      .select("*, sellers(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (!workflow) throw new Error("Workflow não encontrado.");
    const canEdit = workflow.owner_user_id === ctx.userId || manager;
    const visible =
      canEdit || workflow.is_template || workflow.visibility === "shared";
    if (!visible) throw new Error("Este workflow pertence a outro vendedor.");

    const [{ data: versions }, { data: triggers }, { data: runs }, { data: connections }] =
      await Promise.all([
        supabaseAdmin
          .from("workflow_versions")
          .select("*")
          .eq("workflow_id", data.id)
          .order("version", { ascending: false }),
        supabaseAdmin.from("workflow_triggers").select("*").eq("workflow_id", data.id),
        supabaseAdmin
          .from("workflow_runs")
          .select("id, status, created_at, updated_at, error, customers(name)")
          .eq("workflow_id", data.id)
          .order("updated_at", { ascending: false })
          .limit(100),
        supabaseAdmin
          .from("whatsapp_connections")
          .select("id, name, state, seller_id")
          .eq("active", true)
          .order("name"),
      ]);

    const draft =
      (versions ?? []).find((v) => v.state === "draft") ??
      (versions ?? []).find((v) => v.id === workflow.published_version_id) ??
      null;

    return {
      workflow,
      canEdit,
      draft,
      versions: versions ?? [],
      triggers: triggers ?? [],
      runs: runs ?? [],
      connections: connections ?? [],
    };
  });

export const workflowSave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      name: string;
      description?: string | null;
      kind: string;
      sellerId?: string | null;
      defaultConnectionId?: string | null;
      visibility: string;
      isTemplate?: boolean;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, data.id ? "edit" : "create");
    if (!data.name?.trim()) throw new Error("Informe o nome do workflow.");
    const manager = await isManager(ctx);
    if (data.isTemplate && !manager)
      throw new Error("Somente gestores podem criar modelos da empresa.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const seller = await resolveSeller(ctx, data.sellerId ?? null);
    await assertConnectionAllowed(seller?.id ?? null, data.defaultConnectionId ?? null);

    if (data.id) {
      const existing = await loadWorkflowForWrite(ctx, data.id);
      const { error } = await supabaseAdmin
        .from("workflows")
        .update({
          name: data.name.trim(),
          description: data.description ?? null,
          kind: data.kind,
          seller_id: seller?.id ?? null,
          seller_name_snapshot: seller?.name ?? null,
          default_connection_id: data.defaultConnectionId ?? null,
          visibility: data.isTemplate ? "template" : data.visibility,
          is_template: Boolean(data.isTemplate),
        } as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      await audit(ctx, "workflow_updated", { id: existing.id, name: data.name });
      return { id: existing.id };
    }

    const { data: created, error } = await supabaseAdmin
      .from("workflows")
      .insert({
        name: data.name.trim(),
        description: data.description ?? null,
        kind: data.kind,
        owner_user_id: ctx.userId,
        created_by: ctx.userId,
        seller_id: seller?.id ?? null,
        seller_name_snapshot: seller?.name ?? null,
        default_connection_id: data.defaultConnectionId ?? null,
        visibility: data.isTemplate ? "template" : data.visibility,
        is_template: Boolean(data.isTemplate),
        status: "draft",
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("workflow_versions").insert({
      workflow_id: created!.id,
      version: 1,
      state: "draft",
      blocks: [] as never,
      created_by: ctx.userId,
    } as never);
    await audit(ctx, "workflow_created", { id: created!.id, name: data.name });
    return { id: created!.id };
  });

export const workflowSaveBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; blocks: WorkflowBlock[]; publish?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "edit");
    const workflow = await loadWorkflowForWrite(ctx, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.publish) {
      const problem = validateBlocks(data.blocks ?? []);
      if (problem) throw new Error(problem);
    }

    const { data: versions } = await supabaseAdmin
      .from("workflow_versions")
      .select("id, version, state")
      .eq("workflow_id", workflow.id)
      .order("version", { ascending: false });
    const draft = (versions ?? []).find((v) => v.state === "draft");
    const nextVersion = ((versions ?? [])[0]?.version ?? 0) + 1;

    let versionId = draft?.id ?? null;
    if (versionId) {
      const { error } = await supabaseAdmin
        .from("workflow_versions")
        .update({ blocks: data.blocks as never })
        .eq("id", versionId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("workflow_versions")
        .insert({
          workflow_id: workflow.id,
          version: nextVersion,
          state: "draft",
          blocks: data.blocks as never,
          created_by: ctx.userId,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      versionId = created!.id;
    }

    if (data.publish && versionId) {
      await supabaseAdmin
        .from("workflow_versions")
        .update({ state: "published", published_at: new Date().toISOString() } as never)
        .eq("id", versionId);
      await supabaseAdmin
        .from("workflows")
        .update({ published_version_id: versionId, status: "active" } as never)
        .eq("id", workflow.id);
      await audit(ctx, "workflow_published", { id: workflow.id, name: workflow.name });
    }
    return { ok: true, versionId, published: Boolean(data.publish) };
  });

export const workflowSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "draft" | "active" | "paused" }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "edit");
    const workflow = await loadWorkflowForWrite(ctx, data.id);
    if (data.status === "active" && !workflow.published_version_id)
      throw new Error("Publique o fluxo antes de ativar.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("workflows")
      .update({ status: data.status } as never)
      .eq("id", workflow.id);
    await audit(ctx, "workflow_status_changed", { id: workflow.id, status: data.status });
    return { ok: true };
  });

export const workflowSaveTriggers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      triggers: {
        trigger_type: string;
        tag?: string | null;
        keyword?: string | null;
        is_default_for_new_customers?: boolean;
        active?: boolean;
      }[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "edit");
    const workflow = await loadWorkflowForWrite(ctx, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("workflow_triggers").delete().eq("workflow_id", workflow.id);
    const rows = (data.triggers ?? [])
      .filter((t) => TRIGGER_TYPES.includes(t.trigger_type))
      .map((t) => ({
        workflow_id: workflow.id,
        trigger_type: t.trigger_type,
        keyword: t.trigger_type === "keyword" ? (t.keyword ?? "").trim() || null : null,
        tag: t.trigger_type === "tag_added" ? (t.tag ?? "").trim().toLowerCase() || null : null,
        is_default_for_new_customers: Boolean(t.is_default_for_new_customers),
        active: t.active !== false,
      }));
    const invalidKeyword = rows.find((r) => r.trigger_type === "keyword" && !r.keyword);
    if (invalidKeyword) throw new Error("Informe a palavra-chave do gatilho.");
    const invalidTag = rows.find((r) => r.trigger_type === "tag_added" && !r.tag);
    if (invalidTag) throw new Error("Informe a etiqueta do gatilho.");
    if (rows.length) {
      const { error } = await supabaseAdmin.from("workflow_triggers").insert(rows as never);
      if (error) throw new Error(error.message);
    }
    await audit(ctx, "workflow_triggers_updated", { id: workflow.id, count: rows.length });
    return { ok: true };
  });

export const workflowDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "create");
    const manager = await isManager(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: source } = await supabaseAdmin
      .from("workflows")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!source) throw new Error("Workflow não encontrado.");
    const copyable =
      source.owner_user_id === ctx.userId ||
      source.is_template ||
      source.visibility === "shared" ||
      manager;
    if (!copyable) throw new Error("Este workflow não pode ser copiado.");

    const seller = await mySeller(ctx.userId);
    const { data: created, error } = await supabaseAdmin
      .from("workflows")
      .insert({
        name: data.name?.trim() || `${source.name} (cópia)`,
        description: source.description,
        kind: source.kind,
        owner_user_id: ctx.userId,
        created_by: ctx.userId,
        seller_id: seller?.id ?? null,
        seller_name_snapshot: seller?.name ?? null,
        default_connection_id: null,
        visibility: "private",
        is_template: false,
        status: "draft",
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: sourceVersion } = await supabaseAdmin
      .from("workflow_versions")
      .select("blocks")
      .eq("workflow_id", source.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabaseAdmin.from("workflow_versions").insert({
      workflow_id: created!.id,
      version: 1,
      state: "draft",
      blocks: (sourceVersion?.blocks ?? []) as never,
      created_by: ctx.userId,
    } as never);
    await audit(ctx, "workflow_duplicated", { from: source.id, to: created!.id });
    return { id: created!.id };
  });

export const workflowDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "delete");
    const workflow = await loadWorkflowForWrite(ctx, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("workflows").delete().eq("id", workflow.id);
    await audit(ctx, "workflow_deleted", { id: workflow.id, name: workflow.name });
    return { ok: true };
  });

export const workflowCustomerPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "view");
    const manager = await isManager(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const runsQuery = supabaseAdmin
      .from("workflow_runs")
      .select(
        "id, status, created_at, updated_at, error, workflow_id, connection_id, workflows(name), sellers(name), whatsapp_connections(name)",
      )
      .eq("customer_id", data.customerId)
      .order("updated_at", { ascending: false })
      .limit(20);

    const [{ data: workflows }, { data: runs }, { data: connections }] = await Promise.all([
      supabaseAdmin
        .from("workflows")
        .select("id, name, seller_id, default_connection_id, owner_user_id, status")
        .eq("status", "active")
        .order("name"),
      manager ? runsQuery : runsQuery.eq("owner_user_id", ctx.userId),
      supabaseAdmin
        .from("whatsapp_connections")
        .select("id, name, seller_id, state")
        .eq("active", true)
        .order("name"),
    ]);

    const mine = (workflows ?? []).filter((w) => manager || w.owner_user_id === ctx.userId);
    return { workflows: mine, runs: runs ?? [], connections: connections ?? [] };
  });

export const workflowStartForCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; workflowId: string; connectionId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "create");
    const workflow = await loadWorkflowForWrite(ctx, data.workflowId);
    await assertConnectionAllowed(workflow.seller_id, data.connectionId ?? null);
    const { startWorkflowRun } = await import("@/lib/workflow.server");
    const result = await startWorkflowRun({
      workflowId: workflow.id,
      customerId: data.customerId,
      connectionId: data.connectionId ?? null,
      startedBy: ctx.userId,
    });
    await audit(ctx, "workflow_run_started", {
      workflow: workflow.id,
      customer: data.customerId,
      run: result.runId,
    });
    return result;
  });

export const workflowRunAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string; action: "cancel" | "advance" }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPermission(ctx, "edit");
    const manager = await isManager(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: run } = await supabaseAdmin
      .from("workflow_runs")
      .select("id, owner_user_id, status")
      .eq("id", data.runId)
      .maybeSingle();
    if (!run) throw new Error("Execução não encontrada.");
    if (run.owner_user_id !== ctx.userId && !manager)
      throw new Error("Esta execução pertence a outro vendedor.");

    if (data.action === "cancel") {
      await supabaseAdmin
        .from("workflow_runs")
        .update({ status: "CANCELLED", wait_until: null } as never)
        .eq("id", run.id);
      await audit(ctx, "workflow_run_cancelled", { run: run.id });
      return { ok: true };
    }
    const { advanceRun } = await import("@/lib/workflow.server");
    await supabaseAdmin
      .from("workflow_runs")
      .update({ status: "RUNNING", wait_until: null } as never)
      .eq("id", run.id);
    await advanceRun(run.id);
    return { ok: true };
  });
