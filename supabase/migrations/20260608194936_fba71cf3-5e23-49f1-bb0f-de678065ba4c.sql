-- Adicionar campo para ID do Pagar.me na tabela de vendas
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS pagarme_id TEXT UNIQUE;

-- Tabela para log de webhooks
CREATE TABLE IF NOT EXISTS public.pagarme_webhooks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pagarme_id TEXT, -- ID do evento ou da ordem no Pagar.me
    event_type TEXT, -- e.g., order.paid
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Grants
GRANT ALL ON public.pagarme_webhooks TO service_role;
GRANT UPDATE ON public.sales TO service_role;

-- RLS
ALTER TABLE public.pagarme_webhooks ENABLE ROW LEVEL SECURITY;
-- service_role tem acesso por padrão, mas é bom deixar explícito os grants acima.