
-- Restrict producer-avatars writes to admins (path convention `{producerId}/...` has no user binding for non-admins here)
DROP POLICY IF EXISTS "Authenticated can upload producer avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update producer avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete producer avatars" ON storage.objects;

CREATE POLICY "Admins can upload producer avatars" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'producer-avatars' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update producer avatars" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'producer-avatars' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'producer-avatars' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete producer avatars" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'producer-avatars' AND public.has_role(auth.uid(), 'admin'));

-- Restrict seller-avatars: writes admin-only; reads restricted to admin or app-role users
DROP POLICY IF EXISTS "Authenticated can upload seller avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update seller avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete seller avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read seller avatars" ON storage.objects;

CREATE POLICY "Admins can upload seller avatars" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'seller-avatars' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update seller avatars" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'seller-avatars' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'seller-avatars' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete seller avatars" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'seller-avatars' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "App-role users can read seller avatars" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'seller-avatars' AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'vendedor')
    OR public.has_role(auth.uid(), 'produtor')
    OR public.has_role(auth.uid(), 'financeiro')
  )
);
