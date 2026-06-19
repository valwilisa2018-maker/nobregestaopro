
CREATE INDEX IF NOT EXISTS idx_sales_created_at_desc ON public.sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_seller_id ON public.sales (seller_id);
CREATE INDEX IF NOT EXISTS idx_sales_producer_id ON public.sales (producer_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales (sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_service_orders_created_idx ON public.service_orders (created_at ASC, service_index ASC);
CREATE INDEX IF NOT EXISTS idx_service_orders_sale_id ON public.service_orders (sale_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_producer_id ON public.service_orders (producer_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_column_id ON public.service_orders (column_id);

CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON public.invoices (sale_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices (customer_id);

CREATE INDEX IF NOT EXISTS idx_sellers_user_id ON public.sellers (user_id);
CREATE INDEX IF NOT EXISTS idx_producers_user_id ON public.producers (user_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);

CREATE INDEX IF NOT EXISTS idx_om_eventos_producer_id ON public.om_eventos (producer_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_at ON public.cash_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses (created_at DESC);

ANALYZE public.sales;
ANALYZE public.service_orders;
ANALYZE public.invoices;
ANALYZE public.profiles;
