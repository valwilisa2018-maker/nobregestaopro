import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { supabase } = context;
    // Read from DB first (admin-only via RLS); fallback to env secret
    const { data: row } = await supabase
      .from("pagarme_settings")
      .select("api_key")
      .eq("id", true)
      .maybeSingle();
    const apiKey = (row?.api_key as string | undefined) || process.env.PAGARME_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "Credencial Pagar.me não configurada. Cadastre a chave secreta no painel." };
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
    const res = await fetch(PAGARME_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.message || json?.errors?.[0]?.message || `Erro ${res.status}`;
      return { ok: false as const, error: msg };
    }
    return {
      ok: true as const,
      id: json.id as string | undefined,
      url: (json.url || json.short_url) as string,
    };
  });

export const getPagarmeKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
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