
-- Storage policies for "project-files" bucket
-- Path layout: {sale_id}/{categoria}/{filename}

CREATE OR REPLACE FUNCTION public.user_can_access_sale(_user_id uuid, _sale_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.sales s
      LEFT JOIN public.sellers se ON se.id = s.seller_id
      LEFT JOIN public.producers p ON p.id = s.producer_id
      WHERE s.id = _sale_id AND (se.user_id = _user_id OR p.user_id = _user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      LEFT JOIN public.producers p ON p.id = so.producer_id
      WHERE so.sale_id = _sale_id AND p.user_id = _user_id
    );
$$;

CREATE POLICY "project-files read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND public.user_can_access_sale(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "project-files insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND public.user_can_access_sale(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "project-files update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-files'
  AND public.user_can_access_sale(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "project-files delete admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-files' AND public.has_role(auth.uid(), 'admin'));
