DROP POLICY IF EXISTS files_insert ON public.project_folder_files;
CREATE POLICY files_insert ON public.project_folder_files
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.project_folders f
  WHERE f.id = project_folder_files.folder_id
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR f.created_by = auth.uid()
      OR (f.sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), f.sale_id))
      OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
    )
));

DROP POLICY IF EXISTS files_update ON public.project_folder_files;
CREATE POLICY files_update ON public.project_folder_files
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_folders f
  WHERE f.id = project_folder_files.folder_id
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR f.created_by = auth.uid()
      OR (f.sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), f.sale_id))
      OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
    )
));