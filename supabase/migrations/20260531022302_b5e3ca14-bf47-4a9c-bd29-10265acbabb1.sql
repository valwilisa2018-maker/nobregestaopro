-- 1) CRÍTICO: trigger que cria profile + role para todo novo usuário
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill: cria profile/role para qualquer usuário existente sem profile
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
  CASE WHEN (SELECT COUNT(*) FROM public.user_roles) = 0 THEN 'admin'::app_role
       ELSE 'vendedor'::app_role END
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id);

-- 3) Lockdown das SECURITY DEFINER (linter warns 2-8)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_invoices_for_sale() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_service_orders_for_sale() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_single_invoice_for_package() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_invoice_from_package() FROM anon, authenticated, public;
-- has_role: precisa ficar acessível para usuários autenticados (RLS depende dela)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;