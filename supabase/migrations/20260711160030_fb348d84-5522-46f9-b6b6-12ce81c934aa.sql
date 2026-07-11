
-- 1) Welcome notification on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_provider public.ai_providers%ROWTYPE;
  display_name text;
BEGIN
  display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), split_part(NEW.email,'@',1));

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');

  SELECT ap.* INTO admin_provider
  FROM public.ai_providers ap
  JOIN public.user_roles ur ON ur.user_id = ap.user_id
  WHERE ap.is_active = true AND ur.role IN ('admin','master')
  ORDER BY ur.role = 'master' DESC, ap.updated_at DESC
  LIMIT 1;

  IF admin_provider.id IS NOT NULL THEN
    INSERT INTO public.ai_providers (user_id, name, provider, api_key, model, base_url, is_active)
    VALUES (NEW.id, admin_provider.name, admin_provider.provider, admin_provider.api_key,
            admin_provider.model, admin_provider.base_url, true);
  END IF;

  -- Welcome notification
  BEGIN
    INSERT INTO public.notifications(user_id, title, body, type, link)
    VALUES (
      NEW.id,
      '🎉 Bem-vindo(a), ' || display_name || '!',
      'Sua conta foi criada com sucesso. Explore a plataforma, ative seu plano e comece a automatizar seu WhatsApp com IA.',
      'success',
      '/dashboard'
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN NEW;
END;
$function$;

-- 2) Notification when plan is approved
CREATE OR REPLACE FUNCTION public.master_approve_plan_request(_request_id uuid, _days integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.plan_activation_requests%ROWTYPE;
  plan_name text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.plan_activation_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'request not pending'; END IF;

  UPDATE public.profiles
    SET plan_id = r.plan_id, status='active', plan_activated_at=now(),
        plan_expires_at = now() + make_interval(days => COALESCE(_days,30)),
        suspended_reason = NULL
    WHERE id = r.user_id;

  UPDATE public.plan_activation_requests
    SET status='approved', approved_at=now(), approved_by=auth.uid()
    WHERE id = _request_id;

  SELECT name INTO plan_name FROM public.plans WHERE id = r.plan_id;

  BEGIN
    INSERT INTO public.notifications(user_id, title, body, type, link, created_by)
    VALUES (
      r.user_id,
      '✅ Plano ativado com sucesso!',
      'Parabéns! Seu plano "' || COALESCE(plan_name,'') || '" está ativo por ' || COALESCE(_days,30) || ' dias. Aproveite todos os recursos.',
      'success', '/dashboard', auth.uid()
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

REVOKE EXECUTE ON FUNCTION public.master_approve_plan_request(uuid, integer) FROM PUBLIC, anon;

-- 3) Notification when credit order is paid
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
    SET extra_tokens_remaining = extra_tokens_remaining + o.tokens, updated_at = now()
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

  BEGIN
    INSERT INTO public.notifications(user_id, title, body, type, link)
    VALUES (
      o.user_id,
      '💰 Créditos adicionados!',
      to_char(o.tokens, 'FM999G999G999') || ' tokens foram creditados na sua conta.',
      'success', '/credits'
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN o;
END; $$;

REVOKE EXECUTE ON FUNCTION public.mark_credit_order_paid(uuid) FROM anon, public;
