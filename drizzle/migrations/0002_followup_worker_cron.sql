-- lovable-cron-fallback-reviewed: 96 runs/day; follow-up queue must be delivered inside the rule's allowed time window, so a 15-minute reconciliation sweep keeps delays acceptable
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.evolution_settings
  ADD COLUMN IF NOT EXISTS worker_token text DEFAULT encode(gen_random_bytes(24), 'hex');

INSERT INTO public.evolution_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

UPDATE public.evolution_settings
SET worker_token = encode(gen_random_bytes(24), 'hex')
WHERE worker_token IS NULL;

CREATE OR REPLACE FUNCTION public.followup_worker_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token text;
BEGIN
  SELECT worker_token INTO _token FROM public.evolution_settings WHERE id = true;
  IF _token IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://nobregestaopro.lovable.app/api/public/followup-worker?token=' || _token,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.followup_worker_tick() FROM public;
GRANT EXECUTE ON FUNCTION public.followup_worker_tick() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('followup-worker-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'followup-worker-tick',
  '*/15 * * * *',
  $$SELECT public.followup_worker_tick();$$
);