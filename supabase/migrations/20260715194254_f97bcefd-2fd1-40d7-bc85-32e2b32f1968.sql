CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.master_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Admin Master',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.master_admins TO service_role;

ALTER TABLE public.master_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can access master_admins"
  ON public.master_admins FOR ALL
  USING (false) WITH CHECK (false);

CREATE TRIGGER master_admins_updated_at
  BEFORE UPDATE ON public.master_admins
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Verify password against bcrypt hash (server-side use only via service_role)
CREATE OR REPLACE FUNCTION public.master_verify_login(_email TEXT, _password TEXT)
RETURNS TABLE(id UUID, email TEXT, name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT ma.id, ma.email, ma.name
  FROM public.master_admins ma
  WHERE lower(ma.email) = lower(_email)
    AND ma.password_hash = crypt(_password, ma.password_hash);
$$;

REVOKE ALL ON FUNCTION public.master_verify_login(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.master_verify_login(TEXT, TEXT) TO service_role;

-- Seed default admin (email: admin@nobre.com / senha: admin123) — TROQUE após primeiro login
INSERT INTO public.master_admins (email, password_hash, name)
VALUES ('admin@nobre.com', crypt('admin123', gen_salt('bf', 10)), 'Admin Master')
ON CONFLICT (email) DO NOTHING;

-- Change password helper
CREATE OR REPLACE FUNCTION public.master_change_password(_admin_id UUID, _new_password TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE public.master_admins
  SET password_hash = crypt(_new_password, gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = _admin_id;
$$;

REVOKE ALL ON FUNCTION public.master_change_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.master_change_password(UUID, TEXT) TO service_role;