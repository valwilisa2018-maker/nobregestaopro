-- project_folders: respeitar permissões do módulo "files"
DROP POLICY IF EXISTS folders_select ON public.project_folders;
CREATE POLICY folders_select ON public.project_folders FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_permission(auth.uid(), 'files', 'view')
  OR created_by = auth.uid()
  OR (sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), sale_id))
  OR public.user_can_access_card(auth.uid(), sale_id, kanban_card_id)
);

DROP POLICY IF EXISTS folders_insert ON public.project_folders;
CREATE POLICY folders_insert ON public.project_folders FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_permission(auth.uid(), 'files', 'create')
);

DROP POLICY IF EXISTS folders_update ON public.project_folders;
CREATE POLICY folders_update ON public.project_folders FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_permission(auth.uid(), 'files', 'edit')
  OR created_by = auth.uid()
  OR (kanban_card_id IS NOT NULL AND public.user_can_access_card(auth.uid(), sale_id, kanban_card_id))
);

DROP POLICY IF EXISTS folders_delete ON public.project_folders;
CREATE POLICY folders_delete ON public.project_folders FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_permission(auth.uid(), 'files', 'delete')
  OR created_by = auth.uid()
  OR (sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), sale_id))
  OR (kanban_card_id IS NOT NULL AND public.user_can_access_card(auth.uid(), sale_id, kanban_card_id))
);

-- project_folder_files
DROP POLICY IF EXISTS files_select ON public.project_folder_files;
CREATE POLICY files_select ON public.project_folder_files FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'files', 'view')
  OR EXISTS (
    SELECT 1 FROM public.project_folders f
    WHERE f.id = project_folder_files.folder_id
      AND (public.has_role(auth.uid(), 'admin') OR f.created_by = auth.uid()
        OR (f.sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), f.sale_id))
        OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id))
  )
);

DROP POLICY IF EXISTS files_insert ON public.project_folder_files;
CREATE POLICY files_insert ON public.project_folder_files FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'files', 'create')
  OR EXISTS (
    SELECT 1 FROM public.project_folders f
    WHERE f.id = project_folder_files.folder_id
      AND (public.has_role(auth.uid(), 'admin') OR f.created_by = auth.uid()
        OR (f.sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), f.sale_id))
        OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id))
  )
);

DROP POLICY IF EXISTS files_update ON public.project_folder_files;
CREATE POLICY files_update ON public.project_folder_files FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'files', 'edit')
  OR EXISTS (
    SELECT 1 FROM public.project_folders f
    WHERE f.id = project_folder_files.folder_id
      AND (public.has_role(auth.uid(), 'admin') OR f.created_by = auth.uid()
        OR (f.sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), f.sale_id))
        OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id))
  )
);

DROP POLICY IF EXISTS files_delete ON public.project_folder_files;
CREATE POLICY files_delete ON public.project_folder_files FOR DELETE TO authenticated
USING (
  public.has_permission(auth.uid(), 'files', 'delete')
  OR EXISTS (
    SELECT 1 FROM public.project_folders f
    WHERE f.id = project_folder_files.folder_id
      AND (public.has_role(auth.uid(), 'admin') OR f.created_by = auth.uid()
        OR (f.sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), f.sale_id))
        OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id))
  )
);

-- Storage bucket project-files
DROP POLICY IF EXISTS "project-files read" ON storage.objects;
CREATE POLICY "project-files read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND (
    public.has_permission(auth.uid(), 'files', 'view')
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.user_can_access_project_scope(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "project-files insert scoped" ON storage.objects;
CREATE POLICY "project-files insert scoped" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (
    public.has_permission(auth.uid(), 'files', 'create')
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.user_can_access_project_scope(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "project-files update" ON storage.objects;
CREATE POLICY "project-files update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-files'
  AND (
    public.has_permission(auth.uid(), 'files', 'edit')
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.user_can_access_project_scope(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "project-files delete authorized" ON storage.objects;
CREATE POLICY "project-files delete authorized" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-files'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_permission(auth.uid(), 'files', 'delete')
  )
);
