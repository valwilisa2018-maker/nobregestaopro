
ALTER TABLE public.flows ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.connections(id) ON DELETE SET NULL;
ALTER TABLE public.flows ADD COLUMN IF NOT EXISTS trigger_keywords text[] DEFAULT '{}';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS flow_state jsonb DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS flows_connection_active_idx ON public.flows(connection_id, is_active);
