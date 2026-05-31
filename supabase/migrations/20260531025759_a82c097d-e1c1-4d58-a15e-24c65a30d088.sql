CREATE TABLE IF NOT EXISTS public.pagarme_settings (
  id boolean PRIMARY KEY DEFAULT true,
  api_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pagarme_settings_singleton CHECK (id = true)
);

GRANT SELECT, INSERT, UPDATE ON public.pagarme_settings TO authenticated;
GRANT ALL ON public.pagarme_settings TO service_role;

ALTER TABLE public.pagarme_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read pagarme settings" ON public.pagarme_settings;
CREATE POLICY "Admins read pagarme settings"
  ON public.pagarme_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert pagarme settings" ON public.pagarme_settings;
CREATE POLICY "Admins insert pagarme settings"
  ON public.pagarme_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update pagarme settings" ON public.pagarme_settings;
CREATE POLICY "Admins update pagarme settings"
  ON public.pagarme_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));