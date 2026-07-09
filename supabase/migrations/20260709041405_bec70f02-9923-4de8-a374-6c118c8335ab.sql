CREATE POLICY "read_public_support_contacts"
  ON public.internal_config FOR SELECT
  TO authenticated
  USING (key = 'support_contacts');