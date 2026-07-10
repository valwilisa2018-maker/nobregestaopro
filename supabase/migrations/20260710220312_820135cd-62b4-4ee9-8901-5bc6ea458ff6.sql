DROP POLICY IF EXISTS "anon read active lockdown" ON public.announcements;
CREATE POLICY "anon read active lockdown"
  ON public.announcements FOR SELECT
  TO anon
  USING (
    is_active = true
    AND lockdown = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at >= now())
  );