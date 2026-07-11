
CREATE TABLE IF NOT EXISTS public.email_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  provider text NOT NULL DEFAULT 'brevo',
  sender_email text,
  sender_name text NOT NULL DEFAULT 'Agent IA',
  reply_to text,
  signup_enabled boolean NOT NULL DEFAULT true,
  reset_enabled boolean NOT NULL DEFAULT true,
  signup_banner_url text,
  reset_banner_url text,
  signup_subject text NOT NULL DEFAULT 'Bem-vindo(a) à Agent IA! 🎉',
  reset_subject text NOT NULL DEFAULT 'Redefinição de senha — Agent IA',
  brand_color text NOT NULL DEFAULT '#d4af37',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.email_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "master read email settings" ON public.email_settings;
CREATE POLICY "master read email settings" ON public.email_settings FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(),'master'));

DROP POLICY IF EXISTS "master write email settings" ON public.email_settings;
CREATE POLICY "master write email settings" ON public.email_settings FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(),'master')) WITH CHECK (public.has_role(auth.uid(),'master'));

DROP TRIGGER IF EXISTS trg_email_settings_updated_at ON public.email_settings;
CREATE TRIGGER trg_email_settings_updated_at BEFORE UPDATE ON public.email_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
