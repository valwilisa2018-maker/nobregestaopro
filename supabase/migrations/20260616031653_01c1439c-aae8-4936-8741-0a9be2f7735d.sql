
CREATE OR REPLACE FUNCTION public.user_can_access_project_scope(_user_id uuid, _scope_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.user_can_access_sale(_user_id, _scope_id)
    OR EXISTS (
      SELECT 1 FROM public.project_folders pf
      WHERE pf.id = _scope_id
        AND (
          pf.created_by = _user_id
          OR public.user_can_access_sale(_user_id, pf.sale_id)
        )
    );
$$;

DROP POLICY IF EXISTS "project-files read" ON storage.objects;
DROP POLICY IF EXISTS "project-files insert" ON storage.objects;
DROP POLICY IF EXISTS "project-files update" ON storage.objects;

CREATE POLICY "project-files read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.user_can_access_project_scope(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "project-files insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.user_can_access_project_scope(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "project-files update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-files'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.user_can_access_project_scope(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE OR REPLACE FUNCTION public.purge_old_project_folders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folders int := 0;
  v_files int := 0;
  v_messages int := 0;
  v_objects int := 0;
  tmp int := 0;
  r record;
  scope text;
BEGIN
  FOR r IN
    SELECT id, sale_id
    FROM public.project_folders
    WHERE created_at < (now() - interval '30 days')
  LOOP
    scope := COALESCE(r.sale_id::text, r.id::text);

    DELETE FROM storage.objects
    WHERE bucket_id = 'project-files'
      AND name LIKE scope || '/%';
    GET DIAGNOSTICS tmp = ROW_COUNT;
    v_objects := v_objects + tmp;

    DELETE FROM public.project_folder_files WHERE folder_id = r.id;
    GET DIAGNOSTICS tmp = ROW_COUNT;
    v_files := v_files + tmp;

    DELETE FROM public.project_folder_messages WHERE folder_id = r.id;
    GET DIAGNOSTICS tmp = ROW_COUNT;
    v_messages := v_messages + tmp;

    DELETE FROM public.project_folders WHERE id = r.id;
    v_folders := v_folders + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'folders', v_folders,
    'files', v_files,
    'messages', v_messages,
    'storage_objects', v_objects,
    'ran_at', now()
  );
END;
$$;
