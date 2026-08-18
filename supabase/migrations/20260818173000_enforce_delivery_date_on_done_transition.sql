-- Garante no banco, para todos os produtores e clientes da API, que a data
-- de entrega seja o instante real da entrada em uma coluna concluída.
CREATE OR REPLACE FUNCTION public.tg_set_service_order_delivery_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_done boolean := false;
  new_done boolean := false;
BEGIN
  SELECT COALESCE(is_done, false) INTO new_done
  FROM public.kanban_columns
  WHERE id = NEW.column_id;

  IF TG_OP = 'INSERT' THEN
    IF new_done THEN
      NEW.delivered_at := COALESCE(NEW.delivered_at, now());
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(is_done, false) INTO old_done
  FROM public.kanban_columns
  WHERE id = OLD.column_id;

  IF NOT old_done AND new_done THEN
    NEW.delivered_at := now();
  ELSIF old_done AND NOT new_done THEN
    NEW.delivered_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_service_order_delivery_date ON public.service_orders;
CREATE TRIGGER trg_set_service_order_delivery_date
BEFORE INSERT OR UPDATE OF column_id ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_service_order_delivery_date();

