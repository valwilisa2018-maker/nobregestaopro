CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  current_profile public.profiles%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO current_profile
  FROM public.profiles
  WHERE id = current_user_id;

  IF NOT FOUND OR current_profile.status <> 'active' THEN
    RAISE EXCEPTION 'Usuario inativo' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', current_profile.id,
      'full_name', current_profile.full_name,
      'email', current_profile.email,
      'job_title', current_profile.job_title,
      'status', current_profile.status,
      'managed_access', current_profile.managed_access
    ),
    'roles', COALESCE(
      (SELECT jsonb_agg(role) FROM public.user_roles WHERE user_id = current_user_id),
      '[]'::jsonb
    ),
    'permissions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'module', module,
            'can_view', can_view,
            'can_create', can_create,
            'can_edit', can_edit,
            'can_delete', can_delete
          )
        )
        FROM public.user_permissions
        WHERE user_id = current_user_id
      ),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;
