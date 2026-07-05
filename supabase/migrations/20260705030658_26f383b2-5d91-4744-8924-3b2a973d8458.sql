
-- =========== credit_wallets ===========
CREATE TABLE public.credit_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tokens_remaining bigint NOT NULL DEFAULT 0,
  extra_tokens_remaining bigint NOT NULL DEFAULT 0,
  plan_tokens_reset_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.credit_wallets TO authenticated;
GRANT ALL ON public.credit_wallets TO service_role;
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_owner_select" ON public.credit_wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wallet_owner_upsert" ON public.credit_wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wallet_owner_update" ON public.credit_wallets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_credit_wallets_updated BEFORE UPDATE ON public.credit_wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========== credit_transactions ===========
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  model text,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  total_tokens bigint NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('usage','purchase','plan_grant','adjustment')),
  status text NOT NULL DEFAULT 'ok',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_tx_user_time ON public.credit_transactions(user_id, occurred_at DESC);
CREATE INDEX credit_tx_user_kind ON public.credit_transactions(user_id, kind);
GRANT SELECT, INSERT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx_owner_select" ON public.credit_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "tx_owner_insert" ON public.credit_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- =========== credit_packages ===========
CREATE TABLE public.credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tokens bigint NOT NULL,
  price_cents integer NOT NULL,
  badge text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_packages TO anon, authenticated;
GRANT ALL ON public.credit_packages TO service_role;
ALTER TABLE public.credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages_public_read" ON public.credit_packages FOR SELECT TO anon, authenticated USING (is_active = true);

INSERT INTO public.credit_packages (name, tokens, price_cents, badge, sort_order) VALUES
  ('5 Milhões de Tokens', 5000000, 2990, NULL, 1),
  ('20 Milhões de Tokens', 20000000, 9990, 'Mais escolhido', 2),
  ('50 Milhões de Tokens', 50000000, 21990, NULL, 3),
  ('100 Milhões de Tokens', 100000000, 39990, 'Melhor custo', 4);

-- =========== credit_orders ===========
CREATE TABLE public.credit_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.credit_packages(id),
  tokens bigint NOT NULL,
  price_cents integer NOT NULL,
  provider text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','canceled')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_orders_user_time ON public.credit_orders(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.credit_orders TO authenticated;
GRANT ALL ON public.credit_orders TO service_role;
ALTER TABLE public.credit_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_owner_select" ON public.credit_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "orders_owner_insert" ON public.credit_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_credit_orders_updated BEFORE UPDATE ON public.credit_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========== ensure_wallet ===========
CREATE OR REPLACE FUNCTION public.ensure_credit_wallet(_user_id uuid)
RETURNS public.credit_wallets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.credit_wallets%ROWTYPE;
  plan_tokens bigint;
BEGIN
  SELECT * INTO w FROM public.credit_wallets WHERE user_id = _user_id;
  IF NOT FOUND THEN
    SELECT COALESCE(p.tokens_included, 0) INTO plan_tokens
    FROM public.profiles pr LEFT JOIN public.plans p ON p.id = pr.plan_id
    WHERE pr.id = _user_id;
    INSERT INTO public.credit_wallets(user_id, plan_tokens_remaining, extra_tokens_remaining, plan_tokens_reset_at)
    VALUES (_user_id, COALESCE(plan_tokens,0), 0, now() + interval '30 days')
    RETURNING * INTO w;
    INSERT INTO public.credit_transactions(user_id, total_tokens, kind, status, metadata)
    VALUES (_user_id, COALESCE(plan_tokens,0), 'plan_grant', 'ok', jsonb_build_object('reason','initial'));
  ELSIF w.plan_tokens_reset_at <= now() THEN
    SELECT COALESCE(p.tokens_included, 0) INTO plan_tokens
    FROM public.profiles pr LEFT JOIN public.plans p ON p.id = pr.plan_id
    WHERE pr.id = _user_id;
    UPDATE public.credit_wallets
      SET plan_tokens_remaining = COALESCE(plan_tokens,0),
          plan_tokens_reset_at = now() + interval '30 days',
          updated_at = now()
      WHERE user_id = _user_id
      RETURNING * INTO w;
    INSERT INTO public.credit_transactions(user_id, total_tokens, kind, status, metadata)
    VALUES (_user_id, COALESCE(plan_tokens,0), 'plan_grant', 'ok', jsonb_build_object('reason','cycle_renewal'));
  END IF;
  RETURN w;
END; $$;

-- =========== consume_ai_tokens ===========
CREATE OR REPLACE FUNCTION public.consume_ai_tokens(
  _user_id uuid, _agent_id uuid, _model text,
  _input_tokens bigint, _output_tokens bigint, _cost_cents integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.credit_wallets%ROWTYPE;
  needed bigint;
  from_plan bigint := 0;
  from_extra bigint := 0;
BEGIN
  needed := COALESCE(_input_tokens,0) + COALESCE(_output_tokens,0);
  PERFORM public.ensure_credit_wallet(_user_id);
  SELECT * INTO w FROM public.credit_wallets WHERE user_id = _user_id FOR UPDATE;
  IF (w.plan_tokens_remaining + w.extra_tokens_remaining) < needed THEN
    INSERT INTO public.credit_transactions(user_id, agent_id, model, input_tokens, output_tokens, total_tokens, cost_cents, kind, status)
    VALUES (_user_id, _agent_id, _model, _input_tokens, _output_tokens, needed, _cost_cents, 'usage', 'blocked');
    RETURN jsonb_build_object('allowed', false, 'reason', 'insufficient_credits',
      'available', w.plan_tokens_remaining + w.extra_tokens_remaining);
  END IF;
  IF w.plan_tokens_remaining >= needed THEN
    from_plan := needed;
  ELSE
    from_plan := w.plan_tokens_remaining;
    from_extra := needed - from_plan;
  END IF;
  UPDATE public.credit_wallets
    SET plan_tokens_remaining = plan_tokens_remaining - from_plan,
        extra_tokens_remaining = extra_tokens_remaining - from_extra,
        updated_at = now()
    WHERE user_id = _user_id;
  INSERT INTO public.credit_transactions(user_id, agent_id, model, input_tokens, output_tokens, total_tokens, cost_cents, kind, status, metadata)
  VALUES (_user_id, _agent_id, _model, _input_tokens, _output_tokens, needed, _cost_cents, 'usage', 'ok',
    jsonb_build_object('from_plan', from_plan, 'from_extra', from_extra));
  RETURN jsonb_build_object('allowed', true,
    'remaining', (w.plan_tokens_remaining - from_plan) + (w.extra_tokens_remaining - from_extra),
    'from_plan', from_plan, 'from_extra', from_extra);
END; $$;

-- =========== create order ===========
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
  RETURN o;
END; $$;

-- =========== mark order paid (service role / webhook) ===========
CREATE OR REPLACE FUNCTION public.mark_credit_order_paid(_order_id uuid)
RETURNS public.credit_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.credit_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.credit_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.status = 'paid' THEN RETURN o; END IF;
  UPDATE public.credit_orders SET status='paid', paid_at=now(), updated_at=now() WHERE id=_order_id RETURNING * INTO o;
  PERFORM public.ensure_credit_wallet(o.user_id);
  UPDATE public.credit_wallets
    SET extra_tokens_remaining = extra_tokens_remaining + o.tokens,
        updated_at = now()
    WHERE user_id = o.user_id;
  INSERT INTO public.credit_transactions(user_id, total_tokens, cost_cents, kind, status, metadata)
  VALUES (o.user_id, o.tokens, o.price_cents, 'purchase', 'ok', jsonb_build_object('order_id', o.id));
  RETURN o;
END; $$;
