
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_old_messages_media()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  cutoff timestamptz := now() - interval '30 days';
BEGIN
  -- Remove storage objects referenced by expiring messages/audios in bucket agent-media
  DELETE FROM storage.objects o
  USING public.messages m
  WHERE m.created_at < cutoff
    AND o.bucket_id = 'agent-media'
    AND m.media_url LIKE '%/agent-media/%'
    AND m.media_url LIKE '%/' || o.name;

  DELETE FROM storage.objects o
  USING public.audio_messages a
  WHERE a.created_at < cutoff
    AND o.bucket_id = 'agent-media'
    AND a.audio_url LIKE '%/agent-media/%'
    AND a.audio_url LIKE '%/' || o.name;

  -- Delete old rows
  DELETE FROM public.messages WHERE created_at < cutoff;
  DELETE FROM public.audio_messages WHERE created_at < cutoff;
END;
$$;

-- Unschedule prior job if exists, then schedule daily at 03:00 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-messages-media');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-old-messages-media',
  '0 3 * * *',
  $$ SELECT public.purge_old_messages_media(); $$
);
