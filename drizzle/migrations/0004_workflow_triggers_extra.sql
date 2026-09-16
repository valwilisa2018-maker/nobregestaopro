ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.workflow_triggers
  ADD COLUMN IF NOT EXISTS tag text;

ALTER TABLE public.followup_rules
  ADD COLUMN IF NOT EXISTS start_workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_type_active
  ON public.workflow_triggers (trigger_type, active);

CREATE INDEX IF NOT EXISTS idx_customers_tags ON public.customers USING gin (tags);
