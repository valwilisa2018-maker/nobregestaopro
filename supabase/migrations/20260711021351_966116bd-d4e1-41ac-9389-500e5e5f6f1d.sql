GRANT SELECT ON public.internal_config TO anon;
CREATE POLICY "read_public_branding" ON public.internal_config FOR SELECT TO anon, authenticated USING (key = 'branding');