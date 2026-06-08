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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const payload = await req.json();
    console.log("[Webhook] Recebido:", JSON.stringify(payload, null, 2));

    const eventType = payload.type; // order.paid, order.canceled, etc.
    const pagarmeId = payload.data?.id; // ID da ordem ou do objeto principal

    // Logar o webhook
    await supabaseAdmin.from("pagarme_webhooks").insert({
      pagarme_id: pagarmeId,
      event_type: eventType,
      payload: payload,
    });

    if (eventType === "order.paid") {
      console.log("[Webhook] Processando pagamento aprovado para:", pagarmeId);
      
      // Atualizar a venda no banco
      const { data, error } = await supabaseAdmin
        .from("sales")
        .update({ payment_status: "paid" })
        .eq("pagarme_id", pagarmeId);
      
      if (error) {
        console.error("[Webhook] Erro ao atualizar venda:", error);
      } else {
        console.log("[Webhook] Venda atualizada com sucesso.");
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[Webhook] Erro processando requisição:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
