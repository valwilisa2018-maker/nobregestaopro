
CREATE TABLE public.broadcast_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  step_order INTEGER NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 24,
  message TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, step_order)
);
CREATE INDEX idx_broadcast_steps_broadcast ON public.broadcast_steps(broadcast_id, step_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_steps TO authenticated;
GRANT ALL ON public.broadcast_steps TO service_role;

ALTER TABLE public.broadcast_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own broadcast_steps" ON public.broadcast_steps
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_broadcast_steps_updated_at BEFORE UPDATE ON public.broadcast_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.broadcast_recipients
  ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_step_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timeline JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_recipients_next_action
  ON public.broadcast_recipients(broadcast_id, status, next_action_at);
