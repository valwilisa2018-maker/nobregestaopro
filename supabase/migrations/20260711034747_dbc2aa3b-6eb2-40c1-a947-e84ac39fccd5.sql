CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_provider public.ai_providers%ROWTYPE;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');

  -- Herda provedor de IA ativo do admin/master (fallback global)
  SELECT ap.* INTO admin_provider
  FROM public.ai_providers ap
  JOIN public.user_roles ur ON ur.user_id = ap.user_id
  WHERE ap.is_active = true
    AND ur.role IN ('admin','master')
  ORDER BY ur.role = 'master' DESC, ap.updated_at DESC
  LIMIT 1;

  IF admin_provider.id IS NOT NULL THEN
    INSERT INTO public.ai_providers (user_id, name, provider, api_key, model, base_url, is_active)
    VALUES (NEW.id, admin_provider.name, admin_provider.provider, admin_provider.api_key,
            admin_provider.model, admin_provider.base_url, true);
  END IF;

  RETURN NEW;
END;
$function$;