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