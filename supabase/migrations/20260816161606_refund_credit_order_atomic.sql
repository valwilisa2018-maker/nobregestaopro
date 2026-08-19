ALTER TABLE public.credit_orders DROP CONSTRAINT IF EXISTS credit_orders_status_check;
ALTER TABLE public.credit_orders ADD CONSTRAINT credit_orders_status_check CHECK (
  status IN ('pending', 'paid', 'failed', 'canceled', 'cancelled', 'refunded')
);

ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_kind_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_kind_check CHECK (
  kind IN ('usage', 'purchase', 'plan_grant', 'adjustment', 'grant', 'refund')
);

CREATE OR REPLACE FUNCTION public.release_send_quota(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  this_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  rec public.usage_counters%ROWTYPE;
BEGIN
  INSERT INTO public.usage_counters (user_id, day, month, day_count, month_count)
  VALUES (_user_id, today, this_month, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO rec FROM public.usage_counters WHERE user_id = _user_id FOR UPDATE;

  IF rec.day <> today THEN
    rec.day := today;
    rec.day_count := 0;
  END IF;

  IF rec.month <> this_month THEN
    rec.month := this_month;
    rec.month_count := 0;
  END IF;

  UPDATE public.usage_counters
  SET day = rec.day,
      month = rec.month,
      day_count = GREATEST(0, rec.day_count - 1),
      month_count = GREATEST(0, rec.month_count - 1),
      updated_at = now()
  WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'ok',
    true,
    'day_used',
    GREATEST(0, rec.day_count - 1),
    'month_used',
    GREATEST(0, rec.month_count - 1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_credit_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS public.credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.credit_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.credit_orders WHERE id = _order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF o.status = 'refunded' THEN
    RAISE EXCEPTION 'already_refunded';
  END IF;

  IF o.status <> 'paid' THEN
    RAISE EXCEPTION 'order_not_paid';
  END IF;

  UPDATE public.credit_orders
  SET status = 'refunded',
      updated_at = now()
  WHERE id = _order_id
  RETURNING * INTO o;

  PERFORM public.ensure_credit_wallet(o.user_id);

  UPDATE public.credit_wallets
  SET extra_tokens_remaining = GREATEST(0, extra_tokens_remaining - o.tokens),
      updated_at = now()
  WHERE user_id = o.user_id;

  UPDATE public.credit_transactions
  SET status = 'refunded',
      occurred_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'refunded_at',
        now(),
        'refund_reason',
        _reason
      )
  WHERE kind = 'purchase'
    AND status IN ('pending', 'ok')
    AND (metadata->>'order_id')::uuid = o.id;

  INSERT INTO public.credit_transactions(
    user_id,
    total_tokens,
    cost_cents,
    kind,
    status,
    metadata
  )
  VALUES (
    o.user_id,
    -o.tokens,
    -o.price_cents,
    'refund',
    'ok',
    jsonb_build_object('order_id', o.id, 'reason', _reason)
  );

  RETURN o;
END;
$$;

CREATE OR REPLACE FUNCTION public.master_cancel_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'master') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.credit_orders
  SET status = 'canceled',
      updated_at = now()
  WHERE id = _order_id
    AND status = 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_send_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_send_quota(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refund_credit_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credit_order(uuid, text) TO service_role;
