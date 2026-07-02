
-- 1) user_roles: drop self-assignment policies. Only admins (via existing admin policy) or service_role may write.
DROP POLICY IF EXISTS "insert own roles" ON public.user_roles;
DROP POLICY IF EXISTS "update own roles" ON public.user_roles;
DROP POLICY IF EXISTS "delete own roles" ON public.user_roles;

-- Admin manage policy (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_roles' AND policyname='admins manage roles') THEN
    CREATE POLICY "admins manage roles" ON public.user_roles
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

-- 2) Storage policies for private bucket 'agent-media'; enforce {user_id}/... path prefix
DROP POLICY IF EXISTS "agent-media read own" ON storage.objects;
DROP POLICY IF EXISTS "agent-media insert own" ON storage.objects;
DROP POLICY IF EXISTS "agent-media update own" ON storage.objects;
DROP POLICY IF EXISTS "agent-media delete own" ON storage.objects;

CREATE POLICY "agent-media read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'agent-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "agent-media insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "agent-media update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'agent-media' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'agent-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "agent-media delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'agent-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 3) Reschedule follow-ups cron with Authorization header
DO $$
DECLARE jid int;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('run-followups-every-5-min','run-followups') LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  PERFORM cron.schedule(
    'run-followups-every-5-min',
    '*/5 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://project--gvpvnibrfduubvrdacnv.lovable.app/api/public/hooks/follow-ups',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization', 'Bearer ' || current_setting('app.followup_trigger_secret', true)
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
END $$;
