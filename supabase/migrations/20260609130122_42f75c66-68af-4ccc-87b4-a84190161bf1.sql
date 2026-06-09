-- Atualizar clientes
DROP POLICY IF EXISTS "customers_read" ON public.customers;
CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.customers TO authenticated;

-- Atualizar vendedores
DROP POLICY IF EXISTS "sellers_read" ON public.sellers;
CREATE POLICY "sellers_read" ON public.sellers FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.sellers TO authenticated;

-- Atualizar produtores
DROP POLICY IF EXISTS "producers_read" ON public.producers;
CREATE POLICY "producers_read" ON public.producers FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.producers TO authenticated;

-- Garantir acesso a comprovantes
DROP POLICY IF EXISTS "sale_receipts_read" ON public.sale_receipts;
CREATE POLICY "sale_receipts_read" ON public.sale_receipts FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.sale_receipts TO authenticated;