
-- Revoke public/auth execute on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_service_orders_for_sale() FROM PUBLIC, anon, authenticated;
-- has_role needs to be callable by authenticated users for RLS
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
