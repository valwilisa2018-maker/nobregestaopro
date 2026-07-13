
-- ============ SEQUENCES ============
CREATE TABLE public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.connections(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  window_start text,
  window_end text,
  weekdays int[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  message_interval_seconds int NOT NULL DEFAULT 5,
  reenroll_policy text NOT NULL DEFAULT 'skip' CHECK (reenroll_policy IN ('skip','restart','continue','new_run','remove_reenroll')),
  keywords text[] NOT NULL DEFAULT '{}',
  keyword_match text NOT NULL DEFAULT 'contains' CHECK (keyword_match IN ('exact','contains')),
  keyword_ignore_case boolean NOT NULL DEFAULT true,
  keyword_ignore_accents boolean NOT NULL DEFAULT true,
  entry_sources text[] NOT NULL DEFAULT ARRAY['manual','keyword','workflow'],
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequences TO authenticated;
GRANT ALL ON public.sequences TO service_role;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sequences" ON public.sequences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_sequences_user ON public.sequences(user_id);
CREATE INDEX idx_sequences_status ON public.sequences(status) WHERE status = 'active';
CREATE TRIGGER trg_sequences_updated BEFORE UPDATE ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STEPS ============
CREATE TABLE public.sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position int NOT NULL,
  name text NOT NULL,
  description text,
  flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL,
  delay_value int NOT NULL DEFAULT 1,
  delay_unit text NOT NULL DEFAULT 'day' CHECK (delay_unit IN ('minute','hour','day','week','month')),
  use_custom_window boolean NOT NULL DEFAULT false,
  window_start text,
  window_end text,
  weekdays int[],
  message_interval_seconds int,
  max_retries int NOT NULL DEFAULT 3,
  retry_interval_minutes int NOT NULL DEFAULT 5,
  on_error text NOT NULL DEFAULT 'retry' CHECK (on_error IN ('retry','skip','pause','remove','notify')),
  end_sequence boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_steps TO authenticated;
GRANT ALL ON public.sequence_steps TO service_role;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sequence_steps" ON public.sequence_steps FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_sequence_steps_seq ON public.sequence_steps(sequence_id, position);
CREATE TRIGGER trg_sequence_steps_updated BEFORE UPDATE ON public.sequence_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ENROLLMENTS ============
CREATE TABLE public.sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('waiting','scheduled','running','paused','completed','cancelled','error','out_of_window')),
  current_step int NOT NULL DEFAULT 0,
  next_run_at timestamptz,
  entry_source text NOT NULL DEFAULT 'manual',
  entry_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text,
  retry_count int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_enrollments TO authenticated;
GRANT ALL ON public.sequence_enrollments TO service_role;
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own enrollments" ON public.sequence_enrollments FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_enrollments_due ON public.sequence_enrollments(next_run_at)
  WHERE status IN ('scheduled','waiting','out_of_window');
CREATE INDEX idx_enrollments_seq ON public.sequence_enrollments(sequence_id, status);
CREATE INDEX idx_enrollments_user ON public.sequence_enrollments(user_id);
CREATE TRIGGER trg_enrollments_updated BEFORE UPDATE ON public.sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ EVENTS ============
CREATE TABLE public.sequence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.sequence_steps(id) ON DELETE SET NULL,
  step_position int,
  type text NOT NULL,
  message text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_events TO authenticated;
GRANT ALL ON public.sequence_events TO service_role;
ALTER TABLE public.sequence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.sequence_events FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_events_enrollment ON public.sequence_events(enrollment_id, created_at DESC);
CREATE INDEX idx_events_sequence ON public.sequence_events(sequence_id, created_at DESC);
