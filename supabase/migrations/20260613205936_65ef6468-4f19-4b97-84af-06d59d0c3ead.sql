
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS redo_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_redo_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.tg_service_orders_track_redo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_done BOOLEAN := false;
  new_done BOOLEAN := false;
BEGIN
  IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    SELECT COALESCE(is_done,false) INTO old_done FROM public.kanban_columns WHERE id = OLD.column_id;
    SELECT COALESCE(is_done,false) INTO new_done FROM public.kanban_columns WHERE id = NEW.column_id;
    -- moved BACK out of a "done" column => count an alteration
    IF old_done = true AND new_done = false THEN
      NEW.redo_count := COALESCE(OLD.redo_count,0) + 1;
      NEW.last_redo_at := now();
      NEW.delivered_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_orders_track_redo ON public.service_orders;
CREATE TRIGGER trg_service_orders_track_redo
BEFORE UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_service_orders_track_redo();
