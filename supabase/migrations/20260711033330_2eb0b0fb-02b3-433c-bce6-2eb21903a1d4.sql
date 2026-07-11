
-- Allow new kinds in credit_transactions
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_kind_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_kind_check
  CHECK (kind IN ('usage','purchase','plan_grant','adjustment','grant'));

-- Also allow 'pending' status alongside 'ok'/'error' for purchase awaiting payment
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_status_check;

-- create_credit_order: also insert a pending purchase transaction so user sees the buy
CREATE OR REPLACE FUNCTION public.create_credit_order(_package_id uuid)
RETURNS public.credit_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pkg public.credit_packages%ROWTYPE;
  o public.credit_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO pkg FROM public.credit_packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'package not found'; END IF;
  INSERT INTO public.credit_orders(user_id, package_id, tokens, price_cents, status)
  VALUES (auth.uid(), pkg.id, pkg.tokens, pkg.price_cents, 'pending')
  RETURNING * INTO o;
  INSERT INTO public.credit_transactions(user_id, total_tokens, cost_cents, kind, status, metadata)
  VALUES (auth.uid(), pkg.tokens, pkg.price_cents, 'purchase', 'pending',
          jsonb_build_object('order_id', o.id, 'package_name', pkg.name));
  RETURN o;
END; $$;

-- mark_credit_order_paid: update the pending purchase tx to ok (or insert if missing)
CREATE OR REPLACE FUNCTION public.mark_credit_order_paid(_order_id uuid)
RETURNS public.credit_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.credit_orders%ROWTYPE;
  updated int;
BEGIN
  SELECT * INTO o FROM public.credit_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.status = 'paid' THEN RETURN o; END IF;
  UPDATE public.credit_orders SET status='paid', paid_at=now(), updated_at=now() WHERE id=_order_id RETURNING * INTO o;
  PERFORM public.ensure_credit_wallet(o.user_id);
  UPDATE public.credit_wallets
    SET extra_tokens_remaining = extra_tokens_remaining + o.tokens,
        updated_at = now()
    WHERE user_id = o.user_id;
  UPDATE public.credit_transactions
    SET status='ok', occurred_at=now(),
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('paid_at', now())
    WHERE kind='purchase' AND status='pending' AND (metadata->>'order_id')::uuid = o.id;
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    INSERT INTO public.credit_transactions(user_id, total_tokens, cost_cents, kind, status, metadata)
    VALUES (o.user_id, o.tokens, o.price_cents, 'purchase', 'ok', jsonb_build_object('order_id', o.id));
  END IF;
  RETURN o;
END; $$;

REVOKE EXECUTE ON FUNCTION public.mark_credit_order_paid(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_credit_order(uuid) FROM anon;
