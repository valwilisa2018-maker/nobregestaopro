-- Promove a conta administrativa principal do workspace.
-- Falha explicitamente se a conta ainda não existir no Supabase Auth.
DO $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id
    INTO target_user_id
    FROM auth.users
   WHERE lower(email) = 'valwilisa2018@gmail.com'
   LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION
      'A conta valwilisa2018@gmail.com ainda não existe no Supabase Auth. Cadastre-a antes de aplicar esta migration.';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
     SET status = 'active',
         managed_access = false,
         job_title = 'Admin Master'
   WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'O perfil de valwilisa2018@gmail.com não existe em public.profiles.';
  END IF;
END
$$;
