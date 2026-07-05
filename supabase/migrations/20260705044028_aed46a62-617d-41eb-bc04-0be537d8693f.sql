
-- Presence: owner-scoped write policies
CREATE POLICY "Users can insert own presence" ON public.presence
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presence" ON public.presence
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own presence" ON public.presence
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Revoke EXECUTE on SECURITY DEFINER functions from anon and public
REVOKE EXECUTE ON FUNCTION public.consume_ai_tokens(uuid, uuid, text, bigint, bigint, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ensure_credit_wallet(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_credit_order_paid(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.consume_send_quota(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_credit_order(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.create_credit_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
