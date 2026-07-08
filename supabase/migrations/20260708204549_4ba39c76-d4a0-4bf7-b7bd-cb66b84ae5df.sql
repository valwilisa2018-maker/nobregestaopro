
DROP TRIGGER IF EXISTS pipeline_deals_stage_track ON public.pipeline_deals;

CREATE OR REPLACE FUNCTION public.pipeline_deals_touch_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.last_interaction_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_deals_track_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pipeline_activities(user_id, deal_id, type, to_stage, payload)
    VALUES (NEW.user_id, NEW.id, 'created', NEW.stage_id, jsonb_build_object('title', NEW.title));
  ELSIF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.pipeline_activities(user_id, deal_id, type, from_stage, to_stage)
    VALUES (NEW.user_id, NEW.id, 'stage_changed', OLD.stage_id, NEW.stage_id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER pipeline_deals_stage_touch
BEFORE UPDATE ON public.pipeline_deals
FOR EACH ROW EXECUTE FUNCTION public.pipeline_deals_touch_interaction();

CREATE TRIGGER pipeline_deals_stage_track
AFTER INSERT OR UPDATE ON public.pipeline_deals
FOR EACH ROW EXECUTE FUNCTION public.pipeline_deals_track_stage();
