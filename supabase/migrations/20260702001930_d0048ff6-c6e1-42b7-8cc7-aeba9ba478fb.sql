
-- Plans catalog
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  daily_limit integer NOT NULL DEFAULT 0,
  monthly_limit integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans readable" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans admin write" ON public.plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.plans (name, daily_limit, monthly_limit) VALUES
  ('free', 50, 500),
  ('pro', 500, 10000),
  ('business', 5000, 100000);

-- Assign plan to profiles
ALTER TABLE public.profiles ADD COLUMN plan_id uuid REFERENCES public.plans(id);
UPDATE public.profiles SET plan_id = (SELECT id FROM public.plans WHERE name='free');

-- Usage counters per user
CREATE TABLE public.usage_counters (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  month date NOT NULL DEFAULT date_trunc('month', now() AT TIME ZONE 'UTC')::date,
  day_count integer NOT NULL DEFAULT 0,
  month_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage read" ON public.usage_counters FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin usage read" ON public.usage_counters FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Atomic quota check + consume
CREATE OR REPLACE FUNCTION public.consume_send_quota(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  this_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  d_limit integer;
  m_limit integer;
  rec public.usage_counters%ROWTYPE;
BEGIN
  SELECT p.daily_limit, p.monthly_limit INTO d_limit, m_limit
  FROM public.profiles pr
  LEFT JOIN public.plans p ON p.id = pr.plan_id
  WHERE pr.id = _user_id;

  -- No plan → allow (unlimited)
  IF d_limit IS NULL AND m_limit IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_plan');
  END IF;

  INSERT INTO public.usage_counters (user_id, day, month, day_count, month_count)
  VALUES (_user_id, today, this_month, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO rec FROM public.usage_counters WHERE user_id = _user_id FOR UPDATE;

  IF rec.day <> today THEN rec.day := today; rec.day_count := 0; END IF;
  IF rec.month <> this_month THEN rec.month := this_month; rec.month_count := 0; END IF;

  IF d_limit > 0 AND rec.day_count >= d_limit THEN
    UPDATE public.usage_counters SET day=rec.day, month=rec.month, day_count=rec.day_count, month_count=rec.month_count, updated_at=now() WHERE user_id=_user_id;
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'limit', d_limit, 'used', rec.day_count);
  END IF;
  IF m_limit > 0 AND rec.month_count >= m_limit THEN
    UPDATE public.usage_counters SET day=rec.day, month=rec.month, day_count=rec.day_count, month_count=rec.month_count, updated_at=now() WHERE user_id=_user_id;
    RETURN jsonb_build_object('allowed', false, 'reason', 'monthly_limit', 'limit', m_limit, 'used', rec.month_count);
  END IF;

  UPDATE public.usage_counters
  SET day=rec.day, month=rec.month,
      day_count=rec.day_count + 1,
      month_count=rec.month_count + 1,
      updated_at=now()
  WHERE user_id=_user_id;

  RETURN jsonb_build_object('allowed', true, 'day_used', rec.day_count+1, 'month_used', rec.month_count+1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_send_quota(uuid) TO authenticated, service_role;
