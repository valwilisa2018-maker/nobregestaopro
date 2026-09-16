import { createFileRoute } from "@tanstack/react-router";

/**
 * Recebe leads de formulários externos e inicia os fluxos com o gatilho
 * "Formulário gerou lead". Autenticado por token no header/query.
 */
async function run(request: Request) {
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("token") ??
    request.headers.get("x-workflow-token") ??
    "";
  const secret = process.env["WORKFLOW_API_SECRET"];
  if (!secret || !provided || provided !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const name = String(body.name ?? body.nome ?? "").trim();
  const rawPhone = String(body.phone ?? body.telefone ?? "").trim();
  const email = String(body.email ?? "").trim() || null;
  const company = String(body.company ?? body.empresa ?? "").trim() || null;
  const notes = String(body.notes ?? body.mensagem ?? "").trim() || null;
  const workflowId = typeof body.workflow_id === "string" ? body.workflow_id : null;
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 10)
    : [];

  if (!name) return Response.json({ ok: false, error: "Informe o nome." }, { status: 400 });

  const { normalizePhone } = await import("@/lib/whatsapp.server");
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return Response.json({ ok: false, error: "Telefone inválido." }, { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("customers")
    .select("id, tags")
    .eq("phone", phone)
    .maybeSingle();

  let customerId = existing?.id ?? null;
  if (customerId) {
    const merged = Array.from(new Set([...((existing?.tags ?? []) as string[]), ...tags]));
    await supabaseAdmin
      .from("customers")
      .update({ tags: merged, last_interaction_at: new Date().toISOString() } as never)
      .eq("id", customerId);
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("customers")
      .insert({
        name,
        phone,
        email,
        company,
        notes,
        tags,
        followup_enabled: true,
      } as never)
      .select("id")
      .single();
    if (error) {
      console.error("[workflow-lead] insert", error.message);
      return Response.json({ ok: false, error: "Não foi possível salvar o lead." }, { status: 500 });
    }
    customerId = created!.id;
  }

  const { startWorkflowsByTrigger } = await import("@/lib/workflow.server");
  const result = await startWorkflowsByTrigger({
    triggerType: "form_lead",
    customerId: customerId!,
    workflowId,
  });

  return Response.json({
    ok: true,
    customer_id: customerId,
    started: result.started.length,
    warnings: result.errors,
  });
}

export const Route = createFileRoute("/api/public/workflow-lead")({
  server: { handlers: { POST: async ({ request }) => run(request) } },
});
