ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_sale_service_index_unique
  UNIQUE (sale_id, service_index);