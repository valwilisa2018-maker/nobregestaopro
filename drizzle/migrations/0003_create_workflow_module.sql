-- Workflow module: per-seller conversation flows integrated with WhatsApp connections.

CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'comercial',
  owner_user_id uuid,
  created_by uuid,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  seller_name_snapshot text,
  default_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared','template')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  is_template boolean NOT NULL DEFAULT false,
  published_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published')),
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version)
);

CREATE TABLE public.workflow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('customer_created','keyword','manual','followup')),
  keyword text,
  is_default_for_new_customers boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL,
  can_edit boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, shared_with_user_id)
);

CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  workflow_version_id uuid REFERENCES public.workflow_versions(id) ON DELETE SET NULL,
  owner_user_id uuid,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  phone text,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','WAITING_REPLY','WAITING_TIME','HANDOFF','DONE','FAILED','CANCELLED')),
  current_block_id text,
  wait_until timestamptz,
  last_message_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_by uuid,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  block_id text,
  block_type text,
  direction text NOT NULL DEFAULT 'system' CHECK (direction IN ('in','out','system')),
  message text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflows_owner ON public.workflows(owner_user_id);
CREATE INDEX idx_workflows_seller ON public.workflows(seller_id);
CREATE INDEX idx_workflow_runs_conn_status ON public.workflow_runs(connection_id, status);
CREATE INDEX idx_workflow_runs_customer ON public.workflow_runs(customer_id);
CREATE INDEX idx_workflow_runs_wait ON public.workflow_runs(status, wait_until);
CREATE INDEX idx_workflow_run_steps_run ON public.workflow_run_steps(run_id, created_at);
CREATE UNIQUE INDEX idx_workflow_runs_active_unique
  ON public.workflow_runs(workflow_id, customer_id)
  WHERE status IN ('RUNNING','WAITING_REPLY','WAITING_TIME');

CREATE TRIGGER tg_workflows_updated_at BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER tg_workflow_versions_updated_at BEFORE UPDATE ON public.workflow_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER tg_workflow_runs_updated_at BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Helper: managers see the whole team.
CREATE OR REPLACE FUNCTION public.can_manage_workflows(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.can_view_workflow(_user_id uuid, _workflow_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workflows w
    WHERE w.id = _workflow_id
      AND (
        w.owner_user_id = _user_id
        OR w.is_template
        OR w.visibility = 'shared'
        OR public.can_manage_workflows(_user_id)
        OR EXISTS (
          SELECT 1 FROM public.workflow_shares s
          WHERE s.workflow_id = w.id AND s.shared_with_user_id = _user_id
        )
      )
  );
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_triggers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_shares TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_runs TO authenticated;
GRANT SELECT, INSERT ON public.workflow_run_steps TO authenticated;
GRANT ALL ON public.workflows TO service_role;
GRANT ALL ON public.workflow_versions TO service_role;
GRANT ALL ON public.workflow_triggers TO service_role;
GRANT ALL ON public.workflow_shares TO service_role;
GRANT ALL ON public.workflow_runs TO service_role;
GRANT ALL ON public.workflow_run_steps TO service_role;

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflows visíveis" ON public.workflows
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'workflow', 'view')
    AND (
      owner_user_id = auth.uid()
      OR is_template
      OR visibility = 'shared'
      OR public.can_manage_workflows(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.workflow_shares s
        WHERE s.workflow_id = workflows.id AND s.shared_with_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "workflows criar" ON public.workflows
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (public.has_permission(auth.uid(), 'workflow', 'create') OR public.can_manage_workflows(auth.uid()))
  );

CREATE POLICY "workflows editar" ON public.workflows
  FOR UPDATE TO authenticated
  USING (
    (owner_user_id = auth.uid() AND public.has_permission(auth.uid(), 'workflow', 'edit'))
    OR public.can_manage_workflows(auth.uid())
  );

CREATE POLICY "workflows excluir" ON public.workflows
  FOR DELETE TO authenticated
  USING (
    (owner_user_id = auth.uid() AND public.has_permission(auth.uid(), 'workflow', 'delete'))
    OR public.can_manage_workflows(auth.uid())
  );

CREATE POLICY "workflow_versions visíveis" ON public.workflow_versions
  FOR SELECT TO authenticated
  USING (public.can_view_workflow(auth.uid(), workflow_id));

CREATE POLICY "workflow_versions gerenciar" ON public.workflow_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_versions.workflow_id
        AND (w.owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_versions.workflow_id
        AND (w.owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
    )
  );

CREATE POLICY "workflow_triggers visíveis" ON public.workflow_triggers
  FOR SELECT TO authenticated
  USING (public.can_view_workflow(auth.uid(), workflow_id));

CREATE POLICY "workflow_triggers gerenciar" ON public.workflow_triggers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_triggers.workflow_id
        AND (w.owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_triggers.workflow_id
        AND (w.owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
    )
  );

CREATE POLICY "workflow_shares visíveis" ON public.workflow_shares
  FOR SELECT TO authenticated
  USING (shared_with_user_id = auth.uid() OR public.can_view_workflow(auth.uid(), workflow_id));

CREATE POLICY "workflow_shares gerenciar" ON public.workflow_shares
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_shares.workflow_id
        AND (w.owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflows w
      WHERE w.id = workflow_shares.workflow_id
        AND (w.owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
    )
  );

CREATE POLICY "workflow_runs visíveis" ON public.workflow_runs
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'workflow', 'view')
    AND (owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
  );

CREATE POLICY "workflow_runs gerenciar" ON public.workflow_runs
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
  WITH CHECK (owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()));

CREATE POLICY "workflow_run_steps visíveis" ON public.workflow_run_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workflow_runs r
      WHERE r.id = workflow_run_steps.run_id
        AND (r.owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
    )
  );

CREATE POLICY "workflow_run_steps inserir" ON public.workflow_run_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workflow_runs r
      WHERE r.id = workflow_run_steps.run_id
        AND (r.owner_user_id = auth.uid() OR public.can_manage_workflows(auth.uid()))
    )
  );
