DROP POLICY IF EXISTS service_types_admin ON public.service_types;
CREATE POLICY service_types_write ON public.service_types
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS packages_admin ON public.packages;
CREATE POLICY packages_write ON public.packages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS kanban_columns_admin ON public.kanban_columns;
CREATE POLICY kanban_columns_write ON public.kanban_columns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);