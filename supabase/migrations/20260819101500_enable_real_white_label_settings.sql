CREATE TABLE IF NOT EXISTS public.white_label_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  logo text,
  primary_color text NOT NULL DEFAULT '#dc2626',
  secondary_color text NOT NULL DEFAULT '#27272a',
  background_color text NOT NULL DEFAULT '#18181b',
  foreground_color text NOT NULL DEFAULT '#fafafa',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.white_label_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS white_label_settings_read ON public.white_label_settings;
CREATE POLICY white_label_settings_read ON public.white_label_settings
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS white_label_settings_admin_write ON public.white_label_settings;
CREATE POLICY white_label_settings_admin_write ON public.white_label_settings
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.white_label_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.white_label_settings REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.white_label_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
