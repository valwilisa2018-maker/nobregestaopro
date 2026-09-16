create policy "Transcription users manage own temp media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'transcription-temp'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_permission(auth.uid(), 'transcription', 'create')
);

create policy "Transcription users read own temp media"
on storage.objects for select to authenticated
using (
  bucket_id = 'transcription-temp'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Transcription users delete own temp media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'transcription-temp'
  and (storage.foldername(name))[1] = auth.uid()::text
);