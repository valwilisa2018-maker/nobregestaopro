
-- Enum priority
DO $$ BEGIN
  CREATE TYPE public.pipeline_priority AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- STAGES
CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  position integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO authenticated;
GRANT ALL ON public.pipeline_stages TO service_role;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stages" ON public.pipeline_stages FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'master'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'master'));
CREATE INDEX idx_pipeline_stages_user ON public.pipeline_stages(user_id, position);

-- DEALS
CREATE TABLE public.pipeline_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  contact_id uuid,
  client_id uuid,
  title text NOT NULL,
  company text,
  phone text,
  whatsapp text,
  email text,
  avatar_url text,
  value_cents bigint NOT NULL DEFAULT 0,
  product text,
  source text,
  owner_id uuid,
  owner_name text,
  priority public.pipeline_priority NOT NULL DEFAULT 'medium',
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  next_contact_at timestamptz,
  last_interaction_at timestamptz DEFAULT now(),
  links jsonb NOT NULL DEFAULT '{}'::jsonb,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  lost_reason text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_deals TO authenticated;
GRANT ALL ON public.pipeline_deals TO service_role;
ALTER TABLE public.pipeline_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deals" ON public.pipeline_deals FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'master'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'master'));
CREATE INDEX idx_pipeline_deals_user_stage ON public.pipeline_deals(user_id, stage_id, position);

-- ACTIVITIES
CREATE TABLE public.pipeline_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.pipeline_deals(id) ON DELETE CASCADE,
  type text NOT NULL,
  from_stage uuid,
  to_stage uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_activities TO authenticated;
GRANT ALL ON public.pipeline_activities TO service_role;
ALTER TABLE public.pipeline_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activities" ON public.pipeline_activities FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'master'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'master'));
CREATE INDEX idx_pipeline_activities_deal ON public.pipeline_activities(deal_id, created_at DESC);

-- ATTACHMENTS
CREATE TABLE public.pipeline_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.pipeline_deals(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  mime text,
  size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_attachments TO authenticated;
GRANT ALL ON public.pipeline_attachments TO service_role;
ALTER TABLE public.pipeline_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attachments" ON public.pipeline_attachments FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'master'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'master'));

-- updated_at trigger
CREATE TRIGGER pipeline_stages_updated BEFORE UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER pipeline_deals_updated BEFORE UPDATE ON public.pipeline_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Movement trigger
CREATE OR REPLACE FUNCTION public.pipeline_deals_track_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pipeline_activities(user_id, deal_id, type, to_stage, payload)
    VALUES (NEW.user_id, NEW.id, 'created', NEW.stage_id, jsonb_build_object('title', NEW.title));
  ELSIF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.pipeline_activities(user_id, deal_id, type, from_stage, to_stage)
    VALUES (NEW.user_id, NEW.id, 'stage_changed', OLD.stage_id, NEW.stage_id);
    NEW.last_interaction_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pipeline_deals_stage_track
  BEFORE INSERT OR UPDATE ON public.pipeline_deals
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_deals_track_stage();

-- Seed default stages RPC
CREATE OR REPLACE FUNCTION public.ensure_default_pipeline_stages()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  cnt int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT count(*) INTO cnt FROM public.pipeline_stages WHERE user_id = uid;
  IF cnt > 0 THEN RETURN; END IF;
  INSERT INTO public.pipeline_stages(user_id, name, color, position, is_system, is_won, is_lost) VALUES
    (uid, 'Novo Lead',          '#3b82f6', 1,  true, false, false),
    (uid, 'Primeiro Contato',   '#60a5fa', 2,  true, false, false),
    (uid, 'Qualificação',       '#a855f7', 3,  true, false, false),
    (uid, 'Apresentação',       '#eab308', 4,  true, false, false),
    (uid, 'Negociação',         '#f97316', 5,  true, false, false),
    (uid, 'Proposta Enviada',   '#92400e', 6,  true, false, false),
    (uid, 'Follow-up',          '#22c55e', 7,  true, false, false),
    (uid, 'Fechamento',         '#15803d', 8,  true, false, false),
    (uid, 'Pagamento',          '#d4af37', 9,  true, false, false),
    (uid, 'Implantação',        '#06b6d4', 10, true, false, false),
    (uid, 'Pós-venda',          '#1e3a8a', 11, true, false, false),
    (uid, 'Cliente Recorrente', '#f59e0b', 12, true, true,  false),
    (uid, 'Perdido',            '#ef4444', 13, true, false, true);
END $$;

REVOKE EXECUTE ON FUNCTION public.ensure_default_pipeline_stages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_pipeline_stages() TO authenticated;
