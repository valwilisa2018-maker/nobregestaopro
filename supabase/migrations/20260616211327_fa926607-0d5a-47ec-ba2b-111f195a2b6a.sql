DROP POLICY IF EXISTS folders_select ON public.project_folders;
CREATE POLICY folders_select ON public.project_folders FOR SELECT TO authenticated USING (true);