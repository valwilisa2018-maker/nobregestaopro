
CREATE POLICY "agent-media own read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'agent-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "agent-media own write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "agent-media own update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'agent-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "agent-media own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'agent-media' AND auth.uid()::text = (storage.foldername(name))[1]);
