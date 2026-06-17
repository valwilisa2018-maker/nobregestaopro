CREATE TABLE IF NOT EXISTS public.whatsapp_status (
  instance_name text PRIMARY KEY,
  state text NOT NULL DEFAULT 'unknown',
  number text,
  last_event text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_status TO authenticated;
GRANT ALL ON public.whatsapp_status TO service_role;
ALTER TABLE public.whatsapp_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read whatsapp_status"
ON public.whatsapp_status FOR SELECT TO authenticated USING (true);
ALTER TABLE public.whatsapp_status REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_status;