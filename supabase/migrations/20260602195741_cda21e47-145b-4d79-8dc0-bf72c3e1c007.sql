
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE POLICY "Authenticated can read seller avatars"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'seller-avatars');

CREATE POLICY "Authenticated can upload seller avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'seller-avatars');

CREATE POLICY "Authenticated can update seller avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'seller-avatars');

CREATE POLICY "Authenticated can delete seller avatars"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'seller-avatars');
