-- ============ flow_executions ============
CREATE TABLE public.flow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  flow_id uuid NOT NULL,
  conversation_id uuid,
  contact_id uuid,
  connection_id uuid,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','waiting_user_input','completed','failed','aborted')),
  current_block_id text,
  awaiting_variable text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  is_simulation boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flow_executions TO authenticated;
GRANT ALL ON public.flow_executions TO service_role;

ALTER TABLE public.flow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_executions owner read"   ON public.flow_executions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "flow_executions owner insert" ON public.flow_executions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "flow_executions owner update" ON public.flow_executions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "flow_executions owner delete" ON public.flow_executions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX flow_executions_conv_status_idx ON public.flow_executions (conversation_id, status);
CREATE INDEX flow_executions_user_status_idx ON public.flow_executions (user_id, status);
CREATE INDEX flow_executions_flow_idx        ON public.flow_executions (flow_id);

CREATE TRIGGER flow_executions_set_updated_at
BEFORE UPDATE ON public.flow_executions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ flow_execution_logs ============
CREATE TABLE public.flow_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.flow_executions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  event text NOT NULL,
  block_id text,
  message text,
  data jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.flow_execution_logs TO authenticated;
GRANT ALL ON public.flow_execution_logs TO service_role;

ALTER TABLE public.flow_execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_execution_logs owner read"   ON public.flow_execution_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "flow_execution_logs owner insert" ON public.flow_execution_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "flow_execution_logs owner delete" ON public.flow_execution_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX flow_execution_logs_exec_idx ON public.flow_execution_logs (execution_id, created_at);
CREATE INDEX flow_execution_logs_user_idx ON public.flow_execution_logs (user_id, created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.flow_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.flow_execution_logs;
