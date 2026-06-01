-- Allow any authenticated user to manage sellers and producers
DROP POLICY IF EXISTS sellers_admin_write ON public.sellers;
CREATE POLICY sellers_write ON public.sellers
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS producers_admin_write ON public.producers;
CREATE POLICY producers_write ON public.producers
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);