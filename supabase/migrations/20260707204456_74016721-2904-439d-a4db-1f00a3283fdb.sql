
CREATE TABLE public.service_order_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  from_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  to_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  from_column_name TEXT,
  to_column_name TEXT,
  moved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moved_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_soh_service_order ON public.service_order_history(service_order_id, created_at DESC);

GRANT SELECT, INSERT ON public.service_order_history TO authenticated;
GRANT ALL ON public.service_order_history TO service_role;

ALTER TABLE public.service_order_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read history"
  ON public.service_order_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can insert history"
  ON public.service_order_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_log_service_order_move()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_name TEXT;
  v_to_name TEXT;
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_to_name FROM public.kanban_columns WHERE id = NEW.column_id;
    IF v_uid IS NOT NULL THEN SELECT email INTO v_email FROM auth.users WHERE id = v_uid; END IF;
    INSERT INTO public.service_order_history
      (service_order_id, from_column_id, to_column_id, from_column_name, to_column_name, moved_by, moved_by_email)
    VALUES (NEW.id, NULL, NEW.column_id, NULL, v_to_name, v_uid, v_email);
    RETURN NEW;
  END IF;

  IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    SELECT name INTO v_from_name FROM public.kanban_columns WHERE id = OLD.column_id;
    SELECT name INTO v_to_name FROM public.kanban_columns WHERE id = NEW.column_id;
    IF v_uid IS NOT NULL THEN SELECT email INTO v_email FROM auth.users WHERE id = v_uid; END IF;
    INSERT INTO public.service_order_history
      (service_order_id, from_column_id, to_column_id, from_column_name, to_column_name, moved_by, moved_by_email)
    VALUES (NEW.id, OLD.column_id, NEW.column_id, v_from_name, v_to_name, v_uid, v_email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_so_move_ins ON public.service_orders;
DROP TRIGGER IF EXISTS trg_log_so_move_upd ON public.service_orders;

CREATE TRIGGER trg_log_so_move_ins
  AFTER INSERT ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_service_order_move();

CREATE TRIGGER trg_log_so_move_upd
  AFTER UPDATE OF column_id ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_service_order_move();

-- Backfill: initial entry for existing cards so histórico não fica vazio
INSERT INTO public.service_order_history
  (service_order_id, from_column_id, to_column_id, from_column_name, to_column_name, created_at)
SELECT so.id, NULL, so.column_id, NULL, kc.name, so.created_at
FROM public.service_orders so
LEFT JOIN public.kanban_columns kc ON kc.id = so.column_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_order_history h WHERE h.service_order_id = so.id
);
