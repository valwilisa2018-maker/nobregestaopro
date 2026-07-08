
REVOKE EXECUTE ON FUNCTION public.master_activate_account(uuid, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_grant_credits(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_mark_order_paid(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_suspend_account(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_activate_account(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_grant_credits(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_mark_order_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_suspend_account(uuid, text) TO authenticated;
