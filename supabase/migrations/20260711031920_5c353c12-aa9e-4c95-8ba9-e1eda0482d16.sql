
REVOKE EXECUTE ON FUNCTION public.master_approve_plan_request(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_reject_plan_request(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_cancel_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_delete_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_delete_plan_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_cancel_plan(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.master_reactivate_account(uuid) FROM PUBLIC, anon;
