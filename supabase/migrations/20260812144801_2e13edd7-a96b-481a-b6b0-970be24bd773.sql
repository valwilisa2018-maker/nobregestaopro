-- Alinha o Storage de avatares às permissões granulares do módulo Produtores.
-- Administradores continuam com acesso total; usuários gerenciados precisam
-- da ação "edit" em producers para alterar fotos.
DROP POLICY IF EXISTS "Admins can upload producer avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update producer avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete producer avatars" ON storage.objects;

CREATE POLICY "Authorized users can upload producer avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'producer-avatars'
  AND public.has_permission(auth.uid(), 'producers', 'edit')
);

CREATE POLICY "Authorized users can update producer avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'producer-avatars'
  AND public.has_permission(auth.uid(), 'producers', 'edit')
)
WITH CHECK (
  bucket_id = 'producer-avatars'
  AND public.has_permission(auth.uid(), 'producers', 'edit')
);

CREATE POLICY "Authorized users can delete producer avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'producer-avatars'
  AND public.has_permission(auth.uid(), 'producers', 'edit')
);