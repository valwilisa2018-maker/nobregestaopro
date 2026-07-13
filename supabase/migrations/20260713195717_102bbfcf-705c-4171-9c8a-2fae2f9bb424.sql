
DROP POLICY IF EXISTS invoices_read_auth ON storage.objects;
DROP POLICY IF EXISTS invoices_insert_auth ON storage.objects;
DROP POLICY IF EXISTS invoices_update_auth ON storage.objects;
DROP POLICY IF EXISTS invoices_delete_auth ON storage.objects;

CREATE POLICY invoices_read_auth ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoices'
  AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'financeiro'::app_role))
);
CREATE POLICY invoices_insert_auth ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'financeiro'::app_role))
);
CREATE POLICY invoices_update_auth ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'invoices'
  AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'financeiro'::app_role))
);
CREATE POLICY invoices_delete_auth ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'invoices'
  AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'financeiro'::app_role))
);
