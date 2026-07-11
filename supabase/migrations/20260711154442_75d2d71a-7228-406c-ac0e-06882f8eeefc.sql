CREATE OR REPLACE FUNCTION public.master_list_users_with_roles(_search text DEFAULT NULL)
RETURNS TABLE(user_id uuid, full_name text, email text, status text, roles app_role[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'master') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.id AS user_id,
         p.full_name::text,
         u.email::text,
         p.status::text,
         COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}'::public.app_role[]) AS roles
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE _search IS NULL OR _search = ''
     OR u.email ILIKE '%'||_search||'%'
     OR COALESCE(p.full_name,'') ILIKE '%'||_search||'%'
  GROUP BY p.id, u.email, p.status, p.full_name
  ORDER BY u.email
  LIMIT 200;
END $function$;