import { createFileRoute } from "@tanstack/react-router";

/**
 * Permite que um sistema externo inicie um fluxo para um cliente já existente.
 * Só funciona em fluxos ativos com o gatilho "Início por sistema externo (API)".
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

  const workflowId = typeof body.workflow_id === "string" ? body.workflow_id : null;
  const connectionId = typeof body.connection_id === "string" ? body.connection_id : null;
  let customerId = typeof body.customer_id === "string" ? body.customer_id : null;
  const rawPhone = String(body.phone ?? body.telefone ?? "").trim();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (!customerId) {
    const { normalizePhone } = await import("@/lib/whatsapp.server");
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return Response.json(
        { ok: false, error: "Informe customer_id ou um telefone válido." },
        { status: 400 },
      );
    }
    const { data: found } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (!found) {
      return Response.json({ ok: false, error: "Cliente não encontrado." }, { status: 404 });
    }
    customerId = found.id;
  }

  const { startWorkflowsByTrigger } = await import("@/lib/workflow.server");
  const result = await startWorkflowsByTrigger({
    triggerType: "api",
    customerId,
    workflowId,
    connectionId,
  });

  if (!result.started.length) {
    return Response.json(
      {
        ok: false,
        error: "Nenhum fluxo ativo com este gatilho aceitou o início.",
        warnings: result.errors,
      },
      { status: 409 },
    );
  }

  return Response.json({ ok: true, runs: result.started, warnings: result.errors });
}

export const Route = createFileRoute("/api/public/workflow-start")({
  server: { handlers: { POST: async ({ request }) => run(request) } },
});
