
CREATE TABLE IF NOT EXISTS public.plan_activation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid
);

CREATE INDEX IF NOT EXISTS plan_activation_requests_user_idx ON public.plan_activation_requests(user_id);
CREATE INDEX IF NOT EXISTS plan_activation_requests_status_idx ON public.plan_activation_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS plan_activation_requests_one_pending_per_user
  ON public.plan_activation_requests(user_id) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.plan_activation_requests TO authenticated;
GRANT ALL ON public.plan_activation_requests TO service_role;

ALTER TABLE public.plan_activation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin select" ON public.plan_activation_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'));

CREATE POLICY "user creates own" ON public.plan_activation_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "user cancels own pending" ON public.plan_activation_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status IN ('pending','cancelled'));

CREATE POLICY "admin master updates" ON public.plan_activation_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'));

-- Approve: activates the account and marks the request approved
CREATE OR REPLACE FUNCTION public.master_approve_plan_request(_request_id uuid, _days integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.plan_activation_requests%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO r FROM public.plan_activation_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'request not pending'; END IF;

  UPDATE public.profiles
    SET plan_id = r.plan_id,
        status = 'active',
        plan_activated_at = now(),
        plan_expires_at = now() + make_interval(days => COALESCE(_days,30)),
        suspended_reason = NULL
    WHERE id = r.user_id;

  UPDATE public.plan_activation_requests
    SET status = 'approved', approved_at = now(), approved_by = auth.uid()
    WHERE id = _request_id;
END $$;

CREATE OR REPLACE FUNCTION public.master_reject_plan_request(_request_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.plan_activation_requests
    SET status='rejected', note = COALESCE(_note, note), approved_at = now(), approved_by = auth.uid()
    WHERE id = _request_id AND status = 'pending';
END $$;
