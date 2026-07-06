
CREATE TABLE public.video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  connection_id uuid,
  direct_path text NOT NULL,
  media_key text NOT NULL,
  mime text,
  file_name text,
  kind text NOT NULL DEFAULT 'video',
  declared_bytes bigint,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  error text,
  storage_path text,
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.video_jobs TO authenticated;
GRANT ALL ON public.video_jobs TO service_role;
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own video_jobs" ON public.video_jobs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins view video_jobs" ON public.video_jobs FOR SELECT
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_video_jobs_status_created ON public.video_jobs(status, created_at);
CREATE TRIGGER trg_video_jobs_updated BEFORE UPDATE ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
