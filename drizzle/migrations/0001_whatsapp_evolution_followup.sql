-- ===== Evolution API settings (singleton) =====
CREATE TABLE public.evolution_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  api_url text,
  api_key text,
  integration_name text,
  webhook_secret text,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.evolution_settings TO authenticated;
GRANT ALL ON public.evolution_settings TO service_role;
ALTER TABLE public.evolution_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evolution_settings_select" ON public.evolution_settings FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'whatsapp', 'view') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "evolution_settings_write" ON public.evolution_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ===== WhatsApp connections (multi-number) =====
CREATE TABLE public.whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  instance_name text NOT NULL UNIQUE,
  responsible_name text,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  notes text,
  phone_number text,
  profile_pic_url text,
  state text NOT NULL DEFAULT 'disconnected',
  last_event text,
  connected_at timestamptz,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_connections_seller ON public.whatsapp_connections(seller_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_connections TO authenticated;
GRANT ALL ON public.whatsapp_connections TO service_role;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_conn_select" ON public.whatsapp_connections FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'whatsapp', 'view') OR public.has_permission(auth.uid(), 'followup', 'view') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wa_conn_write" ON public.whatsapp_connections FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'whatsapp', 'edit') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_permission(auth.uid(), 'whatsapp', 'edit') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_whatsapp_connections_updated BEFORE UPDATE ON public.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- migrate existing single-instance status rows
INSERT INTO public.whatsapp_connections (name, instance_name, state, last_event, phone_number, updated_at)
SELECT instance_name, instance_name, state, last_event, number, updated_at
FROM public.whatsapp_status
ON CONFLICT (instance_name) DO NOTHING;

-- ===== Webhook events (idempotent) =====
CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text UNIQUE,
  instance_name text,
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_webhook_events_created ON public.whatsapp_webhook_events(created_at DESC);
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_events_select" ON public.whatsapp_webhook_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'whatsapp', 'view') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ===== WhatsApp messages =====
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  instance_name text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone text NOT NULL,
  direction text NOT NULL DEFAULT 'out',
  body text,
  external_id text UNIQUE,
  status text NOT NULL DEFAULT 'sent',
  origin text NOT NULL DEFAULT 'manual',
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_messages_customer ON public.whatsapp_messages(customer_id, created_at DESC);
CREATE INDEX idx_wa_messages_phone ON public.whatsapp_messages(phone, created_at DESC);
GRANT SELECT, INSERT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_messages_select" ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'customers', 'view') OR public.has_permission(auth.uid(), 'whatsapp', 'view') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "wa_messages_insert" ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'customers', 'edit') OR public.has_permission(auth.uid(), 'whatsapp', 'edit') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ===== Follow-up rules =====
CREATE TABLE public.followup_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_event text NOT NULL,
  delay_days integer NOT NULL DEFAULT 7,
  whatsapp_mode text NOT NULL DEFAULT 'default',
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  message text NOT NULL,
  allowed_start time NOT NULL DEFAULT '08:00',
  allowed_end time NOT NULL DEFAULT '18:00',
  allowed_weekdays integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_rules TO authenticated;
GRANT ALL ON public.followup_rules TO service_role;
ALTER TABLE public.followup_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr_select" ON public.followup_rules FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'followup', 'view') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "fr_write" ON public.followup_rules FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'followup', 'edit') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_permission(auth.uid(), 'followup', 'edit') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_followup_rules_updated BEFORE UPDATE ON public.followup_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- ===== Follow-up queue =====
CREATE TABLE public.followup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.followup_rules(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  message text NOT NULL,
  phone text,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED',
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  error text,
  reason text,
  idempotency_key text UNIQUE,
  locked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fq_due ON public.followup_queue(status, scheduled_at);
CREATE INDEX idx_fq_customer ON public.followup_queue(customer_id, scheduled_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_queue TO authenticated;
GRANT ALL ON public.followup_queue TO service_role;
ALTER TABLE public.followup_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fq_select" ON public.followup_queue FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'followup', 'view') OR public.has_permission(auth.uid(), 'customers', 'view') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "fq_write" ON public.followup_queue FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'followup', 'edit') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_permission(auth.uid(), 'followup', 'edit') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_followup_queue_updated BEFORE UPDATE ON public.followup_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- ===== Follow-up history =====
CREATE TABLE public.followup_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES public.followup_queue(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.followup_rules(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fh_customer ON public.followup_history(customer_id, created_at DESC);
GRANT SELECT, INSERT ON public.followup_history TO authenticated;
GRANT ALL ON public.followup_history TO service_role;
ALTER TABLE public.followup_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fh_select" ON public.followup_history FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'followup', 'view') OR public.has_permission(auth.uid(), 'customers', 'view') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "fh_insert" ON public.followup_history FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'followup', 'edit') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ===== Customer follow-up controls =====
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS followup_paused_until timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz;

-- ===== Worker claim function (idempotent, skip locked) =====
CREATE OR REPLACE FUNCTION public.followup_claim_due(_limit integer DEFAULT 20)
RETURNS SETOF public.followup_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.followup_queue q
  SET status = 'PROCESSING', locked_at = now(), attempts = q.attempts + 1, updated_at = now()
  WHERE q.id IN (
    SELECT id FROM public.followup_queue
    WHERE status IN ('SCHEDULED', 'PENDING', 'WAITING_CONNECTION')
      AND scheduled_at <= now()
      AND attempts < 5
    ORDER BY scheduled_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.followup_claim_due(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.followup_claim_due(integer) TO service_role;