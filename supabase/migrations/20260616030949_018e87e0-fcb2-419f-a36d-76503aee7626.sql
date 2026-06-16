CREATE EXTENSION IF NOT EXISTS pg_cron;

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
    scope := COALESCE(r.sale_id::text, 'folder-' || r.id::text);

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

DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-project-folders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-old-project-folders',
  '0 3 * * *',
  $$SELECT public.purge_old_project_folders();$$
);