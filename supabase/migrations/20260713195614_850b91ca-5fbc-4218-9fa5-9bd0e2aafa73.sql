
-- 1. customers: role-checked reads + writes
DROP POLICY IF EXISTS customers_read ON public.customers;
DROP POLICY IF EXISTS customers_write ON public.customers;
CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'vendedor'::app_role)
  OR public.has_role(auth.uid(),'produtor'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
);
CREATE POLICY customers_write ON public.customers FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'vendedor'::app_role)
  OR public.has_role(auth.uid(),'produtor'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'vendedor'::app_role)
  OR public.has_role(auth.uid(),'produtor'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
);

-- 2. sellers: role-checked reads + admin-only writes
DROP POLICY IF EXISTS sellers_read ON public.sellers;
DROP POLICY IF EXISTS sellers_write ON public.sellers;
CREATE POLICY sellers_read ON public.sellers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'vendedor'::app_role)
  OR public.has_role(auth.uid(),'produtor'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
);
CREATE POLICY sellers_write ON public.sellers FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 3. producers: role-checked reads + admin-only writes
DROP POLICY IF EXISTS producers_read ON public.producers;
DROP POLICY IF EXISTS producers_write ON public.producers;
CREATE POLICY producers_read ON public.producers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'vendedor'::app_role)
  OR public.has_role(auth.uid(),'produtor'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
);
CREATE POLICY producers_write ON public.producers FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 4. invoices: admin/financeiro only
DROP POLICY IF EXISTS invoices_select ON public.invoices;
DROP POLICY IF EXISTS invoices_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_update ON public.invoices;
DROP POLICY IF EXISTS invoices_delete ON public.invoices;
CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
);
CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
);
CREATE POLICY invoices_update ON public.invoices FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
);
CREATE POLICY invoices_delete ON public.invoices FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role));

-- 5. service_orders: role-scoped writes (read policy already exists)
DROP POLICY IF EXISTS service_orders_write ON public.service_orders;
CREATE POLICY service_orders_write ON public.service_orders FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'vendedor'::app_role)
  OR public.has_role(auth.uid(),'produtor'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'vendedor'::app_role)
  OR public.has_role(auth.uid(),'produtor'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
);

-- 6. sale_receipts: role-scoped writes
DROP POLICY IF EXISTS sale_receipts_write ON public.sale_receipts;
CREATE POLICY sale_receipts_write ON public.sale_receipts FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'vendedor'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'vendedor'::app_role)
  OR public.has_role(auth.uid(),'financeiro'::app_role)
);

-- 7. system_announcements: authenticated-only read
DROP POLICY IF EXISTS "Anyone can view active announcements" ON public.system_announcements;
CREATE POLICY "Authenticated can view active announcements" ON public.system_announcements
FOR SELECT TO authenticated
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- 8. Two INSERT policies with WITH CHECK(true) — require authenticated
DROP POLICY IF EXISTS "System can insert history" ON public.service_order_history;
CREATE POLICY "System can insert history" ON public.service_order_history
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert logs" ON public.system_logs;
CREATE POLICY "Users can insert logs" ON public.system_logs
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 9. project-files storage: ownership-scoped SELECT
DROP POLICY IF EXISTS "project-files read" ON storage.objects;
CREATE POLICY "project-files read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.user_can_access_project_scope(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- 10. producer-avatars: drop public listing policy (CDN URLs still work — bucket is public)
DROP POLICY IF EXISTS "Producer avatars are publicly accessible" ON storage.objects;

-- 11. Fix functions missing search_path
ALTER FUNCTION public.sync_order_delivery_date_to_sale() SET search_path = public;
ALTER FUNCTION public.sync_sale_delivery_date_to_orders() SET search_path = public;
ALTER FUNCTION public.tg_updated_at() SET search_path = public;
ALTER FUNCTION public.update_announcements_updated_at() SET search_path = public;

-- 12. Revoke EXECUTE from anon on all SECURITY DEFINER functions in public
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public', r.sig);
  END LOOP;
END $$;
