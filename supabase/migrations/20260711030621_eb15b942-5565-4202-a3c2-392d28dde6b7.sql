
CREATE OR REPLACE FUNCTION public.master_cancel_plan(_user_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'master') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles
    SET plan_id = NULL, plan_expires_at = NULL, plan_activated_at = NULL,
        status = 'pending', suspended_reason = _reason
    WHERE id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.master_reactivate_account(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'master') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET status = 'active', suspended_reason = NULL WHERE id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.master_cancel_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'master') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.credit_orders SET status = 'cancelled', updated_at = now()
    WHERE id = _order_id AND status = 'pending';
END $$;

CREATE OR REPLACE FUNCTION public.master_delete_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'master') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.credit_orders WHERE id = _order_id AND status <> 'paid';
END $$;

CREATE OR REPLACE FUNCTION public.master_delete_plan_request(_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'master') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.plan_activation_requests WHERE id = _request_id;
END $$;
