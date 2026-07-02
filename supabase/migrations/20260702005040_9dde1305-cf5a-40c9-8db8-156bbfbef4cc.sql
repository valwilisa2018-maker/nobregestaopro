
CREATE TABLE IF NOT EXISTS public.internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.internal_config FROM anon, authenticated;
GRANT ALL ON public.internal_config TO service_role;
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated => zero access via Data API.

INSERT INTO public.internal_config (key, value)
VALUES ('followup_trigger_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE jid int; sec text;
BEGIN
  SELECT value INTO sec FROM public.internal_config WHERE key='followup_trigger_secret';

  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('run-followups-every-5-min','run-followups') LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  PERFORM cron.schedule(
    'run-followups-every-5-min',
    '*/5 * * * *',
    format($f$
      SELECT net.http_post(
        url := 'https://project--gvpvnibrfduubvrdacnv.lovable.app/api/public/hooks/follow-ups',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := '{}'::jsonb
      );
    $f$, sec)
  );
END $$;
