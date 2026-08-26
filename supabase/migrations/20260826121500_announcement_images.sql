ALTER TABLE public.system_announcements
ADD COLUMN IF NOT EXISTS image_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-images',
  'announcement-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Announcement images are publicly readable" ON storage.objects;
CREATE POLICY "Announcement images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'announcement-images');

DROP POLICY IF EXISTS "Admins can upload announcement images" ON storage.objects;
CREATE POLICY "Admins can upload announcement images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'announcement-images'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins can update announcement images" ON storage.objects;
CREATE POLICY "Admins can update announcement images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'announcement-images'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'announcement-images'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins can delete announcement images" ON storage.objects;
CREATE POLICY "Admins can delete announcement images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'announcement-images'
  AND public.has_role(auth.uid(), 'admin')
);
