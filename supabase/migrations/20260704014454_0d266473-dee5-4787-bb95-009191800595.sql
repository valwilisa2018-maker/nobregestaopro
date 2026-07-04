
CREATE TABLE public.presence (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jid TEXT NOT NULL,
  presence TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, jid)
);
GRANT SELECT ON public.presence TO authenticated;
GRANT ALL ON public.presence TO service_role;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own presence read" ON public.presence FOR SELECT TO authenticated USING (user_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
ALTER TABLE public.presence REPLICA IDENTITY FULL;
