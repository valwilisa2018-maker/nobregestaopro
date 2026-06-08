import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PAGARME_URL = "https://api.pagar.me/core/v5/paymentlinks";

export const createPaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      amount: z.number().int().positive().max(100000000), // em centavos
      installments: z.number().int().min(1).max(12),
      methods: z.array(z.enum(["credit_card", "pix", "boleto"])).min(1),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    // Usamos o service_role para ler a chave, pois a tabela pagarme_settings 
    // está protegida por RLS que exige role 'admin', mas vendedores também geram links.
    const supabaseAdmin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: row } = await supabaseAdmin
      .from("pagarme_settings")
      .select("api_key")
      .eq("id", true)
      .maybeSingle();
    
    const apiKey = (row?.api_key as string | undefined) || process.env.PAGARME_API_KEY;
    
    if (!apiKey) {
      console.error("[Pagarme] Chave API não encontrada no banco ou ENV");
      return { ok: false as const, error: "Credencial Pagar.me não configurada. Peça ao administrador para cadastrar a chave secreta." };
    }

    const installmentsList = Array.from({ length: data.installments }, (_, i) => ({
      number: i + 1,
      total: data.amount,
    }));

    const body = {
      is_building: false,
      name: data.name,
      payment_settings: {
        accepted_payment_methods: data.methods,
        credit_card_settings: data.methods.includes("credit_card")
          ? { operation_type: "auth_and_capture", installments: installmentsList }
          : undefined,
      },
      cart_settings: {
        items: [
          { amount: data.amount, name: data.name, default_quantity: 1, description: data.name },
        ],
      },
    };

    const auth = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
    
    try {
      console.log("[Pagarme] Enviando requisição para Pagar.me", { url: PAGARME_URL, methods: data.methods });
      
      const res = await fetch(PAGARME_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": auth,
          "Accept": "application/json"
        },
        body: JSON.stringify(body),
      });

      const responseText = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(responseText);
      } catch (e) {
        console.error("[Pagarme] Falha ao parsear JSON de resposta", responseText);
        return { ok: false as const, error: `Resposta inválida do Pagar.me (${res.status})` };
      }

      if (!res.ok) {
        console.error("[Pagarme] Erro na API do Pagar.me", { 
          status: res.status, 
          error: json,
          body_sent: JSON.stringify(body) 
        });
        
        let msg = json?.message || "Erro desconhecido na API do Pagar.me";
        if (json?.errors && Array.isArray(json.errors)) {
          msg = json.errors.map((e: any) => e.message).join(", ");
        }
        
        return { ok: false as const, error: msg };
      }

      console.log("[Pagarme] Link de pagamento gerado com sucesso", { id: json.id });

      return {
        ok: true as const,
        id: json.id as string | undefined,
        url: (json.payment_url || json.url || json.short_url) as string,
      };
    } catch (error: any) {
      console.error("[Pagarme] Erro de rede ou exceção ao chamar Pagar.me", error);
      return { ok: false as const, error: `Falha na comunicação com Pagar.me: ${error.message}` };
    }
  });

export const getPagarmeKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    // Aqui usamos o contexto do usuário (RLS se aplica)
    const { data: row } = await supabase
      .from("pagarme_settings")
      .select("api_key, updated_at")
      .eq("id", true)
      .maybeSingle();
    
    const key = (row?.api_key as string | undefined) || process.env.PAGARME_API_KEY || "";
    const source = row?.api_key ? ("database" as const) : (process.env.PAGARME_API_KEY ? ("env" as const) : (null as null));
    
    return {
      configured: !!key,
      source,
      masked: key ? `${key.slice(0, 6)}••••${key.slice(-4)}` : null,
      updated_at: (row?.updated_at as string | undefined) ?? null,
    };
  });

export const savePagarmeKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      api_key: z.string().trim().min(10).max(200),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("pagarme_settings")
      .upsert({ id: true, api_key: data.api_key, updated_by: userId, updated_at: new Date().toISOString() });
    if (error) {
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });
