ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;
COMMENT ON COLUMN public.sales.expected_delivery_date IS 'Data obrigatória de entrega da venda.';