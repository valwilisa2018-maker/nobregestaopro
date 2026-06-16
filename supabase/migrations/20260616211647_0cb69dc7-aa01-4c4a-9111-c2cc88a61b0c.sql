DROP POLICY IF EXISTS files_select ON public.project_folder_files;
CREATE POLICY files_select ON public.project_folder_files FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS messages_select ON public.project_folder_messages;
CREATE POLICY messages_select ON public.project_folder_messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "project-files read" ON storage.objects;
CREATE POLICY "project-files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-files');