
-- Global write tables → master only
DROP POLICY IF EXISTS "plans admin write" ON public.plans;
CREATE POLICY "plans master write" ON public.plans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS packages_admin_all ON public.credit_packages;
CREATE POLICY packages_master_all ON public.credit_packages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS cfg_admin_all ON public.internal_config;
CREATE POLICY cfg_master_all ON public.internal_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "master manages roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- Cross-user visibility policies → master only
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Master can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Admins can view all ai_providers" ON public.ai_providers;
CREATE POLICY "Master can view all ai_providers" ON public.ai_providers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Admins can view all api_keys" ON public.api_keys;
CREATE POLICY "Master can view all api_keys" ON public.api_keys
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Admins can view all connections" ON public.connections;
CREATE POLICY "Master can view all connections" ON public.connections
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Admins can view all settings" ON public.settings;
CREATE POLICY "Master can view all settings" ON public.settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Admins can view all tools" ON public.tools;
CREATE POLICY "Master can view all tools" ON public.tools
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Admins can view all webhooks" ON public.webhooks;
CREATE POLICY "Master can view all webhooks" ON public.webhooks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Admins can view all white_label" ON public.white_label;
CREATE POLICY "Master can view all white_label" ON public.white_label
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));
