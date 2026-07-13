DROP POLICY IF EXISTS "om_settings_select" ON public.om_settings;
CREATE POLICY "om_settings_admin_select" ON public.om_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_om_settings_public()
RETURNS TABLE (
  base_daily_goal numeric,
  workdays integer[],
  holidays date[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT base_daily_goal, workdays, holidays FROM public.om_settings WHERE id = true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_om_settings_public() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_om_settings_public() TO authenticated;