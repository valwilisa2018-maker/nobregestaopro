-- Cards novos recebem a duracao correspondente a sua posicao no pacote.
CREATE OR REPLACE FUNCTION public.create_service_orders_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_col uuid;
  i integer;
  customer_name text;
  st_name text;
  label text;
  qty integer;
  existing_count integer;
  card_title text;
  item_duration integer;
BEGIN
  SELECT id INTO default_col FROM public.kanban_columns WHERE is_default = true LIMIT 1;
  IF default_col IS NULL THEN
    SELECT id INTO default_col FROM public.kanban_columns ORDER BY sort_order LIMIT 1;
  END IF;

  SELECT name INTO customer_name FROM public.customers WHERE id = NEW.customer_id;
  SELECT name INTO st_name FROM public.service_types WHERE id = NEW.service_type_id;
  label := COALESCE(NULLIF(TRIM(st_name), ''), 'Video');
  qty := GREATEST(COALESCE(NEW.service_quantity, 1), 1);

  SELECT COUNT(*) INTO existing_count
  FROM public.service_orders so
  WHERE so.customer_id = NEW.customer_id
    AND so.service_type_id IS NOT DISTINCT FROM NEW.service_type_id;

  FOR i IN 1..qty LOOP
    item_duration := CASE
      WHEN NEW.video_duration_breakdown_seconds IS NOT NULL
        AND array_length(NEW.video_duration_breakdown_seconds, 1) >= i
        THEN NEW.video_duration_breakdown_seconds[i]
      WHEN qty = 1 THEN NEW.video_duration_seconds
      ELSE NULL
    END;

    card_title := COALESCE(customer_name, 'Cliente') || ' • ' || label || ' ' ||
                  LPAD((existing_count + i)::text, 2, '0');
    INSERT INTO public.service_orders (
      sale_id, column_id, service_index, title, description, sort_order,
      producer_id, expected_delivery_date, trello_link,
      customer_id, service_type_id, customer_seq, video_duration_seconds
    )
    VALUES (
      NEW.id, default_col, i, card_title, NEW.notes, i,
      NEW.producer_id, NEW.expected_delivery_date, NEW.trello_link,
      NEW.customer_id, NEW.service_type_id, existing_count + i, item_duration
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- A duracao total da venda nunca pode substituir a duracao individual dos cards.
CREATE OR REPLACE FUNCTION public.sync_sale_duration_to_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_qty integer;
BEGIN
  IF NEW.video_duration_seconds IS NOT DISTINCT FROM OLD.video_duration_seconds
    AND NEW.video_duration_breakdown_seconds IS NOT DISTINCT FROM OLD.video_duration_breakdown_seconds
    AND NEW.service_quantity IS NOT DISTINCT FROM OLD.service_quantity THEN
    RETURN NEW;
  END IF;

  v_qty := GREATEST(COALESCE(NEW.service_quantity, 1), 1);

  UPDATE public.service_orders so
  SET video_duration_seconds = CASE
    WHEN NEW.video_duration_breakdown_seconds IS NOT NULL
      AND so.service_index BETWEEN 1 AND array_length(NEW.video_duration_breakdown_seconds, 1)
      THEN NEW.video_duration_breakdown_seconds[so.service_index]
    WHEN v_qty = 1 THEN NEW.video_duration_seconds
    ELSE so.video_duration_seconds
  END
  WHERE so.sale_id = NEW.id
    AND so.video_duration_seconds IS DISTINCT FROM CASE
      WHEN NEW.video_duration_breakdown_seconds IS NOT NULL
        AND so.service_index BETWEEN 1 AND array_length(NEW.video_duration_breakdown_seconds, 1)
        THEN NEW.video_duration_breakdown_seconds[so.service_index]
      WHEN v_qty = 1 THEN NEW.video_duration_seconds
      ELSE so.video_duration_seconds
    END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_sale_duration ON public.sales;
CREATE TRIGGER trg_sync_sale_duration
AFTER UPDATE OF video_duration_seconds, video_duration_breakdown_seconds, service_quantity
ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.sync_sale_duration_to_orders();

-- Corrige todos os cards existentes que receberam o total do pacote.
WITH corrected AS (
  UPDATE public.service_orders so
  SET video_duration_seconds = s.video_duration_breakdown_seconds[so.service_index]
  FROM public.sales s
  WHERE so.sale_id = s.id
    AND s.video_duration_breakdown_seconds IS NOT NULL
    AND so.service_index BETWEEN 1 AND array_length(s.video_duration_breakdown_seconds, 1)
    AND so.video_duration_seconds IS DISTINCT FROM s.video_duration_breakdown_seconds[so.service_index]
  RETURNING so.id, so.video_duration_seconds
)
UPDATE public.om_eventos e
SET
  pontos = GREATEST(
    1,
    ROUND(
      COALESCE(st.points, st.points_value, 1)::numeric
      * corrected.video_duration_seconds::numeric / 30
    )::integer
  ),
  raw = jsonb_set(
    COALESCE(e.raw, '{}'::jsonb),
    '{duration_seconds}',
    to_jsonb(corrected.video_duration_seconds),
    true
  )
FROM corrected
JOIN public.service_orders so ON so.id = corrected.id
JOIN public.sales s ON s.id = so.sale_id
LEFT JOIN public.service_types st ON st.id = s.service_type_id
WHERE e.raw->>'source' = 'service_orders'
  AND e.raw->>'service_order_id' = corrected.id::text;
