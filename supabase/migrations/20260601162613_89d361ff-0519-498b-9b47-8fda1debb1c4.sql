-- Add avatar column to producers
ALTER TABLE public.producers ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create public bucket for producer avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('producer-avatars', 'producer-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Producer avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'producer-avatars');

-- Authenticated upload/update/delete
CREATE POLICY "Authenticated can upload producer avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'producer-avatars');

CREATE POLICY "Authenticated can update producer avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'producer-avatars');

CREATE POLICY "Authenticated can delete producer avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'producer-avatars');