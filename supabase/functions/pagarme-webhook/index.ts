import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authenticity: Pagar.me sends HTTP Basic Auth using the
    // user/password configured on the webhook endpoint. Require a shared
    // secret so forged requests can't mark sales as paid.
    const expectedSecret = Deno.env.get("PAGARME_WEBHOOK_SECRET");
    if (!expectedSecret) {
      console.error("[Webhook] PAGARME_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "webhook not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 503,
      });
    }
    const authHeader = req.headers.get("authorization") ?? "";
    let authorized = false;
    if (authHeader.toLowerCase().startsWith("basic ")) {
      try {
        const decoded = atob(authHeader.slice(6).trim());
        const idx = decoded.indexOf(":");
        const pass = idx >= 0 ? decoded.slice(idx + 1) : decoded;
        // constant-time compare
        const a = new TextEncoder().encode(pass);
        const b = new TextEncoder().encode(expectedSecret);
        if (a.length === b.length) {
          let diff = 0;
          for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
          authorized = diff === 0;
        }
      } catch { /* fall through */ }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload = await req.json();
    console.log("[Webhook] Recebido:", JSON.stringify(payload, null, 2));

    const eventType = payload.type; // order.paid, order.canceled, etc.
    const data = payload.data || {};
    const pagarmeId = data.id; // ID da ordem
    const paymentLinkId = data.payment_link_id; // ID do link de pagamento
    
    // Logar o webhook para histórico
    await supabaseAdmin.from("pagarme_webhooks").insert({
      pagarme_id: pagarmeId,
      event_type: eventType,
      payload: payload,
    });

    // ============================================================
    // 1) Assinatura da plataforma (master_account_invoices / subscription)
    // ============================================================
    // Aceita: charge.paid, invoice.paid, order.paid, subscription.* etc.
    const isPaidEvent = /(paid|payment_confirmed)/i.test(String(eventType));
    if (isPaidEvent) {
      const candidateIds = [
        data.id,
        data.charge_id,
        data.invoice_id,
        data.subscription_id,
        data.order?.id,
        data.charge?.id,
        data.invoice?.id,
        data.subscription?.id,
      ].filter(Boolean);

      // 1a) match em master_account_invoices por pagarme_charge_id
      const { data: invoice } = await supabaseAdmin
        .from("master_account_invoices")
        .select("id, account_id, amount_cents, reference_month")
        .in("pagarme_charge_id", candidateIds)
        .maybeSingle();

      if (invoice) {
        console.log("[Webhook] Fatura da plataforma paga:", invoice.id);
        const paidAt = new Date().toISOString();

        await supabaseAdmin
          .from("master_account_invoices")
          .update({
            status: "paid",
            paid_at: paidAt,
            payment_method: data.payment_method ?? data.charge?.payment_method ?? "pagarme",
          })
          .eq("id", invoice.id);

        // Ativa a conta e reprograma a próxima cobrança (+1 mês)
        const { data: account } = await supabaseAdmin
          .from("master_accounts")
          .select("id, status, activated_at, billing_day")
          .eq("id", invoice.account_id)
          .maybeSingle();

        if (account) {
          const now = new Date();
          const next = new Date(now.getFullYear(), now.getMonth() + 1, account.billing_day || 1);
          await supabaseAdmin
            .from("master_accounts")
            .update({
              status: "active",
              activated_at: account.activated_at ?? paidAt,
              next_billing_at: next.toISOString().split("T")[0],
            })
            .eq("id", account.id);
        }
      }

      // 1b) Assinatura única da plataforma (tabela subscription)
      const { data: sub } = await supabaseAdmin
        .from("subscription")
        .select("id, pagarme_subscription_id, current_period_end")
        .eq("id", true)
        .maybeSingle();

      if (sub && sub.pagarme_subscription_id && candidateIds.includes(sub.pagarme_subscription_id)) {
        console.log("[Webhook] Assinatura da plataforma renovada.");
        const base = new Date();
        const nextEnd = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
        await supabaseAdmin
          .from("subscription")
          .update({
            status: "active",
            started_at: (sub as any).started_at ?? base.toISOString(),
            current_period_end: nextEnd.toISOString(),
          })
          .eq("id", true);
      }
    }

    // Eventos de falha/suspensão da assinatura
    if (/(failed|canceled|refunded|charged_back|past_due|suspended)/i.test(String(eventType))) {
      const candidateIds = [
        data.id,
        data.charge_id,
        data.invoice_id,
        data.subscription_id,
      ].filter(Boolean);

      const { data: invoice } = await supabaseAdmin
        .from("master_account_invoices")
        .select("id, account_id")
        .in("pagarme_charge_id", candidateIds)
        .maybeSingle();

      if (invoice) {
        const newStatus = /refunded/i.test(eventType) ? "refunded"
          : /canceled/i.test(eventType) ? "canceled"
          : "overdue";
        await supabaseAdmin.from("master_account_invoices")
          .update({ status: newStatus })
          .eq("id", invoice.id);

        if (newStatus === "overdue") {
          await supabaseAdmin.from("master_accounts")
            .update({ status: "past_due" })
            .eq("id", invoice.account_id);
        }
      }
    }

    // Processar apenas eventos de pagamento bem-sucedido
    if (eventType === "order.paid") {
      console.log("[Webhook] Processando pagamento aprovado para Order:", pagarmeId, "Link:", paymentLinkId);
      
      const searchId = paymentLinkId || pagarmeId;
      
      // Buscar a venda associada
      const { data: sale, error: saleError } = await supabaseAdmin
        .from("sales")
        .select("id, total_amount, paid_amount")
        .eq("pagarme_id", searchId)
        .maybeSingle();

      if (saleError || !sale) {
        console.error("[Webhook] Venda não encontrada para ID:", searchId, saleError);
        return new Response(JSON.stringify({ ok: false, error: "Sale not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      // No Pagar.me v5, o valor da ordem está em data.amount (centavos)
      const amountPaidCents = data.amount || 0;
      const amountPaidBrl = amountPaidCents / 100;
      
      const newPaidAmount = Number(sale.paid_amount || 0) + amountPaidBrl;
      const totalAmount = Number(sale.total_amount || 0);
      
      // Definir status baseado no valor pago
      let status = "pago_parcial";
      if (newPaidAmount >= totalAmount * 0.99) { // Tolerância de 1% para arredondamentos
        status = "pago_total";
      }

      console.log(`[Webhook] Atualizando Venda ${sale.id}: Pago R$${amountPaidBrl}. Total acumulado R$${newPaidAmount}/${totalAmount}. Status: ${status}`);

      // Atualizar a venda
      const { error: updateError } = await supabaseAdmin
        .from("sales")
        .update({ 
          payment_status: status,
          paid_amount: newPaidAmount
        })
        .eq("id", sale.id);
      
      if (updateError) {
        console.error("[Webhook] Erro ao atualizar venda:", updateError);
      }

      // Registrar o recebimento na tabela sale_receipts (sem arquivo, pois é via API)
      await supabaseAdmin.from("sale_receipts").insert({
        sale_id: sale.id,
        amount: amountPaidBrl,
        paid_at: new Date().toISOString().split('T')[0],
        notes: `Pagamento automático via Pagar.me (ID: ${pagarmeId})`,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[Webhook] Erro crítico processando requisição:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});