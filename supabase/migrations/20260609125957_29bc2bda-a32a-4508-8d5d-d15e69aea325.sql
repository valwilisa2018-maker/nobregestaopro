DROP POLICY IF EXISTS "sales_read" ON public.sales;
CREATE POLICY "sales_read" ON public.sales FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.sales TO authenticated;