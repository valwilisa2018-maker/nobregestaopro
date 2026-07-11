
CREATE OR REPLACE FUNCTION public.master_grant_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'master') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.master_revoke_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'master') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _role = 'master' AND (SELECT count(*) FROM public.user_roles WHERE role='master') <= 1 THEN
    RAISE EXCEPTION 'cannot remove last master';
  END IF;
  DELETE FROM public.user_roles WHERE user_id=_user_id AND role=_role;
END $$;

CREATE OR REPLACE FUNCTION public.master_list_users_with_roles(_search text DEFAULT NULL)
RETURNS TABLE(user_id uuid, full_name text, email text, status text, roles public.app_role[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'master') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, u.email::text, p.status,
         COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}'::public.app_role[])
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE _search IS NULL OR _search = ''
     OR u.email ILIKE '%'||_search||'%'
     OR COALESCE(p.full_name,'') ILIKE '%'||_search||'%'
  GROUP BY p.id, u.email, p.status, p.full_name
  ORDER BY u.email
  LIMIT 200;
END $$;

REVOKE EXECUTE ON FUNCTION public.master_grant_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_revoke_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_list_users_with_roles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_grant_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_revoke_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_list_users_with_roles(text) TO authenticated;
