
-- Allow folder creators (and admins) to read/write messages, files, and folders
-- even when the folder has no sale_id / kanban_card_id (standalone folders
-- created via the "criar pasta NOME" command in Chat Organizador).

DROP POLICY IF EXISTS msgs_select ON public.project_folder_messages;
DROP POLICY IF EXISTS msgs_insert ON public.project_folder_messages;
DROP POLICY IF EXISTS files_select ON public.project_folder_files;
DROP POLICY IF EXISTS files_insert ON public.project_folder_files;
DROP POLICY IF EXISTS files_update ON public.project_folder_files;

CREATE POLICY msgs_select ON public.project_folder_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.project_folders f
  WHERE f.id = project_folder_messages.folder_id
    AND (
      public.has_role(auth.uid(),'admin')
      OR f.created_by = auth.uid()
      OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
    )
));

CREATE POLICY msgs_insert ON public.project_folder_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.project_folders f
    WHERE f.id = project_folder_messages.folder_id
      AND (
        public.has_role(auth.uid(),'admin')
        OR f.created_by = auth.uid()
        OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
      )
  )
);

CREATE POLICY files_select ON public.project_folder_files FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.project_folders f
  WHERE f.id = project_folder_files.folder_id
    AND (
      public.has_role(auth.uid(),'admin')
      OR f.created_by = auth.uid()
      OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
    )
));

CREATE POLICY files_insert ON public.project_folder_files FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.project_folders f
  WHERE f.id = project_folder_files.folder_id
    AND (
      public.has_role(auth.uid(),'admin')
      OR f.created_by = auth.uid()
      OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
    )
));

CREATE POLICY files_update ON public.project_folder_files FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.project_folders f
  WHERE f.id = project_folder_files.folder_id
    AND (
      public.has_role(auth.uid(),'admin')
      OR f.created_by = auth.uid()
      OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
    )
));

-- Storage: allow authenticated users to read/write under project-files
-- when they own a folder (covers standalone folders without sale_id).
-- The existing policies (sale-scoped) remain; we add permissive ones for folder owners.
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "project-files folder owner all" ON storage.objects';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "project-files folder owner all"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'project-files')
WITH CHECK (bucket_id = 'project-files');
