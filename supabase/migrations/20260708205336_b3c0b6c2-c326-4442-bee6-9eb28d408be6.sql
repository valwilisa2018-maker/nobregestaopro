
CREATE OR REPLACE FUNCTION public.pipeline_deals_track_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.pipeline_activities(user_id, deal_id, type, to_stage, payload)
      VALUES (NEW.user_id, NEW.id, 'created', NEW.stage_id, jsonb_build_object('title', NEW.title));
    ELSIF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      INSERT INTO public.pipeline_activities(user_id, deal_id, type, from_stage, to_stage)
      VALUES (NEW.user_id, NEW.id, 'stage_changed', OLD.stage_id, NEW.stage_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[pipeline_deals_track_stage] deal=% op=% erro=% state=%',
      COALESCE(NEW.id::text,'?'), TG_OP, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_deals_touch_interaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      NEW.last_interaction_at := now();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[pipeline_deals_touch_interaction] deal=% erro=% state=%',
      COALESCE(NEW.id::text,'?'), SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END $$;
