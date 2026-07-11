
CREATE TABLE public.role_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.role_audit_log TO authenticated;
GRANT ALL ON public.role_audit_log TO service_role;

ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master can view role audit log"
ON public.role_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master'));

CREATE INDEX idx_role_audit_log_target ON public.role_audit_log(target_user_id, created_at DESC);
CREATE INDEX idx_role_audit_log_created ON public.role_audit_log(created_at DESC);

CREATE OR REPLACE FUNCTION public.master_grant_role(_user_id uuid, _role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inserted boolean;
BEGIN
  IF NOT public.has_role(auth.uid(),'master') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted THEN
    INSERT INTO public.role_audit_log(target_user_id, role, action, performed_by)
    VALUES (_user_id, _role, 'granted', auth.uid());
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.master_revoke_role(_user_id uuid, _role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE removed int;
BEGIN
  IF NOT public.has_role(auth.uid(),'master') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _role = 'master' AND (SELECT count(*) FROM public.user_roles WHERE role='master') <= 1 THEN
    RAISE EXCEPTION 'cannot remove last master';
  END IF;
  DELETE FROM public.user_roles WHERE user_id=_user_id AND role=_role;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed > 0 THEN
    INSERT INTO public.role_audit_log(target_user_id, role, action, performed_by)
    VALUES (_user_id, _role, 'revoked', auth.uid());
  END IF;
END $function$;

REVOKE EXECUTE ON FUNCTION public.master_grant_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_revoke_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_grant_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_revoke_role(uuid, app_role) TO authenticated;
