ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;
COMMENT ON COLUMN public.service_orders.expected_delivery_date IS 'Data de entrega sincronizada da venda.';

-- Sincronizar dados existentes
UPDATE public.service_orders so
SET expected_delivery_date = s.expected_delivery_date
FROM public.sales s
WHERE so.sale_id = s.id AND so.expected_delivery_date IS NULL;
