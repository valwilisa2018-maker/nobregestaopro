
-- Tighten RLS on sensitive tables

-- invoices: only admin/financeiro can write; admin/financeiro can read all, others only through sale scope
DROP POLICY IF EXISTS invoices_read_all ON public.invoices;
DROP POLICY IF EXISTS invoices_write_all ON public.invoices;
CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'financeiro')
    OR (sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), sale_id))
  );
CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY invoices_update ON public.invoices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY invoices_delete ON public.invoices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- om_settings: read all auth, write admin only
DROP POLICY IF EXISTS om_settings_read ON public.om_settings;
DROP POLICY IF EXISTS om_settings_write ON public.om_settings;
CREATE POLICY om_settings_select ON public.om_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY om_settings_admin_write ON public.om_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- pagarme_webhooks: admin/financeiro only
DROP POLICY IF EXISTS "Users can view webhook history" ON public.pagarme_webhooks;
CREATE POLICY pagarme_webhooks_select ON public.pagarme_webhooks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

-- goals: keep seller self-management; global goals only by admin
DROP POLICY IF EXISTS "Permitir edição de metas globais por autenticados" ON public.goals;
CREATE POLICY goals_global_admin ON public.goals FOR ALL TO authenticated
  USING (seller_id IS NULL AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (seller_id IS NULL AND public.has_role(auth.uid(),'admin'));

-- service_types: read all, write admin
DROP POLICY IF EXISTS service_types_read ON public.service_types;
DROP POLICY IF EXISTS service_types_write ON public.service_types;
CREATE POLICY service_types_select ON public.service_types FOR SELECT TO authenticated USING (true);
CREATE POLICY service_types_admin_write ON public.service_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- packages: read all, write admin
DROP POLICY IF EXISTS packages_read ON public.packages;
DROP POLICY IF EXISTS packages_write ON public.packages;
CREATE POLICY packages_select ON public.packages FOR SELECT TO authenticated USING (true);
CREATE POLICY packages_admin_write ON public.packages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- kanban_columns: read all, write admin
DROP POLICY IF EXISTS kanban_columns_read ON public.kanban_columns;
DROP POLICY IF EXISTS kanban_columns_write ON public.kanban_columns;
CREATE POLICY kanban_columns_select ON public.kanban_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY kanban_columns_admin_write ON public.kanban_columns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Storage: project-files — drop overly-broad "folder owner all" and tighten insert
DROP POLICY IF EXISTS "project-files folder owner all" ON storage.objects;
DROP POLICY IF EXISTS "project-files insert" ON storage.objects;
CREATE POLICY "project-files insert scoped" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND public.user_can_access_project_scope(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

-- expense-receipts: tighten read to admin/financeiro
DROP POLICY IF EXISTS expense_receipts_read ON storage.objects;
DROP POLICY IF EXISTS expense_receipts_write ON storage.objects;
CREATE POLICY expense_receipts_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  );
CREATE POLICY expense_receipts_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  );
