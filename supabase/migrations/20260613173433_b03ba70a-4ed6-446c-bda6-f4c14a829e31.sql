
CREATE TABLE IF NOT EXISTS public.om_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  base_daily_goal NUMERIC NOT NULL DEFAULT 6,
  workdays INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  holidays DATE[] NOT NULL DEFAULT ARRAY[]::DATE[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.om_settings TO authenticated;
GRANT ALL ON public.om_settings TO service_role;

ALTER TABLE public.om_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "om_settings_read" ON public.om_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "om_settings_write" ON public.om_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER om_settings_updated_at BEFORE UPDATE ON public.om_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

INSERT INTO public.om_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.producers ALTER COLUMN daily_points_goal SET DEFAULT 6;
UPDATE public.producers SET daily_points_goal = 6 WHERE daily_points_goal IS NULL OR daily_points_goal = 7;
