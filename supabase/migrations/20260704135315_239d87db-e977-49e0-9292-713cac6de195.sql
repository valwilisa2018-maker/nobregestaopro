
CREATE TABLE public.followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'inactivity',
  inactivity_value INTEGER NOT NULL DEFAULT 1,
  inactivity_unit TEXT NOT NULL DEFAULT 'hours',
  is_active BOOLEAN NOT NULL DEFAULT true,
  connection_id UUID,
  stop_on_reply BOOLEAN NOT NULL DEFAULT true,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_replied INTEGER NOT NULL DEFAULT 0,
  total_converted INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followups TO authenticated;
GRANT ALL ON public.followups TO service_role;
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own followups" ON public.followups FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_followups_updated BEFORE UPDATE ON public.followups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.followup_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  followup_id UUID NOT NULL REFERENCES public.followups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  delay_value INTEGER NOT NULL DEFAULT 0,
  delay_unit TEXT NOT NULL DEFAULT 'hours',
  message TEXT NOT NULL,
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_steps TO authenticated;
GRANT ALL ON public.followup_steps TO service_role;
ALTER TABLE public.followup_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own followup_steps" ON public.followup_steps FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_followup_steps_followup ON public.followup_steps(followup_id, step_order);
