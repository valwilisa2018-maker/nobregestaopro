CREATE POLICY "workflow media read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'workflow-media' AND public.has_permission(auth.uid(), 'workflow', 'view'));

CREATE POLICY "workflow media insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'workflow-media' AND public.has_permission(auth.uid(), 'workflow', 'create'));

CREATE POLICY "workflow media delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'workflow-media' AND owner = auth.uid());