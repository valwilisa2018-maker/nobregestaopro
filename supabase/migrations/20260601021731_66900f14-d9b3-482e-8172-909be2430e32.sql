CREATE TABLE public.telao_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  big_seller_overlay_seconds INTEGER NOT NULL DEFAULT 20,
  loop_duplicate_threshold INTEGER NOT NULL DEFAULT 10,
  celebration_sound_enabled BOOLEAN NOT NULL DEFAULT true,
  celebration_confetti_enabled BOOLEAN NOT NULL DEFAULT true,
  celebration_volume INTEGER NOT NULL DEFAULT 70,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT telao_settings_singleton CHECK (id = true)
);

GRANT SELECT, INSERT, UPDATE ON public.telao_settings TO authenticated;
GRANT ALL ON public.telao_settings TO service_role;

ALTER TABLE public.telao_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY telao_settings_read ON public.telao_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY telao_settings_insert_admin ON public.telao_settings
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY telao_settings_update_admin ON public.telao_settings
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER telao_settings_updated_at
  BEFORE UPDATE ON public.telao_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

INSERT INTO public.telao_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.telao_settings;
ALTER TABLE public.telao_settings REPLICA IDENTITY FULL;