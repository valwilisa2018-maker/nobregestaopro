ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS delivery_deadline TEXT;
COMMENT ON COLUMN public.sales.delivery_deadline IS 'Prazo de entrega da venda (ex: 7 dias úteis)';