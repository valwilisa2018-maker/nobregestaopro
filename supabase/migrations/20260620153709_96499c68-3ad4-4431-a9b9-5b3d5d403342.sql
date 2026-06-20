
DROP POLICY IF EXISTS folders_delete ON public.project_folders;
CREATE POLICY folders_delete ON public.project_folders
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR created_by = auth.uid()
    OR (sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), sale_id))
    OR (kanban_card_id IS NOT NULL AND public.user_can_access_card(auth.uid(), sale_id, kanban_card_id))
  );

DROP POLICY IF EXISTS files_delete ON public.project_folder_files;
CREATE POLICY files_delete ON public.project_folder_files
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_folders f
      WHERE f.id = project_folder_files.folder_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR f.created_by = auth.uid()
          OR (f.sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), f.sale_id))
          OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
        )
    )
  );

DROP POLICY IF EXISTS msgs_delete ON public.project_folder_messages;
CREATE POLICY msgs_delete ON public.project_folder_messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_folders f
      WHERE f.id = project_folder_messages.folder_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR f.created_by = auth.uid()
          OR (f.sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), f.sale_id))
          OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
        )
    )
  );
