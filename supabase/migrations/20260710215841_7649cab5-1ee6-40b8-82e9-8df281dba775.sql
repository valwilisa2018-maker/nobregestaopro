
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS lockdown boolean NOT NULL DEFAULT false;
GRANT SELECT ON public.announcements TO anon;
DROP POLICY IF EXISTS "anon read active lockdown" ON public.announcements;
CREATE POLICY "anon read active lockdown" ON public.announcements
  FOR SELECT TO anon
  USING (is_active = true AND lockdown = true);
