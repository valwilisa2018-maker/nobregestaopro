
DROP TRIGGER IF EXISTS trg_create_project_folder ON public.service_orders;
DROP FUNCTION IF EXISTS public.create_project_folder_for_card();

DELETE FROM public.project_folders f
WHERE f.created_by IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.project_folder_files ff WHERE ff.folder_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM public.project_folder_messages fm WHERE fm.folder_id = f.id);
