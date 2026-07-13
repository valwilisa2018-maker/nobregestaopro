
-- 1) contact_to_pipeline_deal: trigger fn; revoke public/anon execute
REVOKE EXECUTE ON FUNCTION public.contact_to_pipeline_deal() FROM PUBLIC, anon;

-- 2) credit_packages: restrict public read to authenticated only
DROP POLICY IF EXISTS packages_public_read ON public.credit_packages;
CREATE POLICY packages_authenticated_read ON public.credit_packages
  FOR SELECT TO authenticated
  USING (is_active = true);
REVOKE SELECT ON public.credit_packages FROM anon;

-- 3) plans: regular authenticated users only see active plans; masters see all via existing ALL policy
DROP POLICY IF EXISTS "plans readable" ON public.plans;
CREATE POLICY plans_active_readable ON public.plans
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'master'::app_role));

-- 4) internal_config: consolidate read policies with a strict allow-list so future keys don't leak
DROP POLICY IF EXISTS read_public_support_contacts ON public.internal_config;
DROP POLICY IF EXISTS read_tutorials_config ON public.internal_config;
CREATE POLICY read_public_config_keys ON public.internal_config
  FOR SELECT TO authenticated
  USING (key IN ('support_contacts','tutorials','tutorial_covers','training_modules'));
