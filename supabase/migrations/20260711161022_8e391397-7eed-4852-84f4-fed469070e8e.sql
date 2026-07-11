CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_provider public.ai_providers%ROWTYPE;
  display_name text;
  phone_number text;
BEGIN
  display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), split_part(NEW.email,'@',1));
  phone_number := NULLIF(NEW.raw_user_meta_data->>'phone','');

  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', phone_number);

  SELECT ap.* INTO admin_provider
  FROM public.ai_providers ap
  JOIN public.user_roles ur ON ur.user_id = ap.user_id
  WHERE ap.is_active = true AND ur.role IN ('admin','master')
  ORDER BY ur.role = 'master' DESC, ap.updated_at DESC
  LIMIT 1;

  IF admin_provider.id IS NOT NULL THEN
    INSERT INTO public.ai_providers (user_id, name, provider, api_key, model, base_url, is_active)
    VALUES (NEW.id, admin_provider.name, admin_provider.provider, admin_provider.api_key,
            admin_provider.model, admin_provider.base_url, true);
  END IF;

  BEGIN
    INSERT INTO public.notifications(user_id, title, body, type, link)
    VALUES (
      NEW.id,
      '🎉 Bem-vindo(a), ' || display_name || '!',
      'Sua conta foi criada com sucesso. Explore a plataforma, ative seu plano e comece a automatizar seu WhatsApp com IA.',
      'success',
      '/dashboard'
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN NEW;
END;
$function$;