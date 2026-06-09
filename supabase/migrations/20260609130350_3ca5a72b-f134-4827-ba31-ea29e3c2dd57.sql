-- Garantir permissões de SELECT para todos os usuários autenticados nas tabelas necessárias
GRANT SELECT ON public.sales TO authenticated;
GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.sellers TO authenticated;
GRANT SELECT ON public.producers TO authenticated;
GRANT SELECT ON public.service_types TO authenticated;
GRANT SELECT ON public.sale_receipts TO authenticated;

-- Simplificar as políticas de leitura para garantir que não haja bloqueio
DROP POLICY IF EXISTS "sales_read" ON public.sales;
CREATE POLICY "sales_read" ON public.sales FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "customers_read" ON public.customers;
CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sellers_read" ON public.sellers;
CREATE POLICY "sellers_read" ON public.sellers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "producers_read" ON public.producers;
CREATE POLICY "producers_read" ON public.producers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_types_read" ON public.service_types;
CREATE POLICY "service_types_read" ON public.service_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sale_receipts_read" ON public.sale_receipts;
CREATE POLICY "sale_receipts_read" ON public.sale_receipts FOR SELECT TO authenticated USING (true);