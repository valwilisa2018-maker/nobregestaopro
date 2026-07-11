
CREATE TABLE IF NOT EXISTS public.meta_wa_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Meta Oficial',
  phone_number_id text,
  business_account_id text,
  app_id text,
  app_secret text,
  access_token text,
  webhook_verify_token text,
  graph_version text NOT NULL DEFAULT 'v21.0',
  display_phone text,
  is_default boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_wa_configs TO authenticated;
GRANT ALL ON public.meta_wa_configs TO service_role;
ALTER TABLE public.meta_wa_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own meta config" ON public.meta_wa_configs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER meta_wa_configs_updated BEFORE UPDATE ON public.meta_wa_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.meta_wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.meta_wa_configs(id) ON DELETE CASCADE,
  meta_template_id text,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category text NOT NULL DEFAULT 'MARKETING',
  status text NOT NULL DEFAULT 'LOCAL',
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_wa_templates TO authenticated;
GRANT ALL ON public.meta_wa_templates TO service_role;
ALTER TABLE public.meta_wa_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own meta templates" ON public.meta_wa_templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER meta_wa_templates_updated BEFORE UPDATE ON public.meta_wa_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
