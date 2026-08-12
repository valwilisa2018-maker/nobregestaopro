-- Convites e permissões granulares, mantendo compatibilidade com usuários existentes.
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  ADD COLUMN IF NOT EXISTS managed_access boolean NOT NULL DEFAULT false;

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  job_title text,
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  status public.invitation_status NOT NULL DEFAULT 'pending',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT invitations_email_normalized CHECK (email = lower(trim(email))),
  CONSTRAINT invitations_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT invitations_expiration_after_creation CHECK (expires_at > created_at),
  CONSTRAINT invitations_permissions_object CHECK (jsonb_typeof(permissions) = 'object')
);

CREATE UNIQUE INDEX invitations_one_pending_email
  ON public.invitations (lower(email)) WHERE status = 'pending';
CREATE INDEX invitations_created_at_idx ON public.invitations (created_at DESC);

CREATE TABLE public.user_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (user_id, module)
);

CREATE INDEX user_permissions_module_idx ON public.user_permissions (module);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.invitations, public.user_permissions TO service_role;

CREATE POLICY invitations_admin_master_all ON public.invitations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_permissions_read_own ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_permissions_admin_master_all ON public.user_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- A política histórica permite editar o próprio perfil. Este trigger protege
-- os campos que pertencem exclusivamente ao administrador.
CREATE OR REPLACE FUNCTION public.protect_profile_access_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.managed_access IS DISTINCT FROM OLD.managed_access
       OR NEW.job_title IS DISTINCT FROM OLD.job_title) THEN
    RAISE EXCEPTION 'Campos de controle de acesso só podem ser alterados por um administrador';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER protect_profile_access_fields_before_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access_fields();

CREATE OR REPLACE FUNCTION public.touch_user_permission_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

CREATE TRIGGER touch_user_permission_updated_at_before_update
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_permission_updated_at();

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN COALESCE((SELECT status FROM public.profiles WHERE id = _user_id), 'inactive') <> 'active' THEN false
    WHEN public.has_role(_user_id, 'admin') THEN true
    WHEN NOT COALESCE((SELECT managed_access FROM public.profiles WHERE id = _user_id), false) THEN true
    ELSE COALESCE((SELECT CASE _action
      WHEN 'view' THEN can_view WHEN 'create' THEN can_create
      WHEN 'edit' THEN can_edit WHEN 'delete' THEN can_delete ELSE false END
      FROM public.user_permissions WHERE user_id = _user_id AND module = _module), false)
  END
$$;
REVOKE ALL ON FUNCTION public.has_permission(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text,text) TO authenticated, service_role;

-- O status é verificado pelo backend a cada operação; sessões antigas não contornam o bloqueio.
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT status = 'active' FROM public.profiles WHERE id = _user_id), false)
$$;
REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated, service_role;
