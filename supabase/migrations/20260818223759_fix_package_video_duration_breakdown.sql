ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS video_duration_breakdown_seconds integer[];

CREATE OR REPLACE FUNCTION public.validate_sale_video_duration_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty integer;
  v_duration integer;
  v_total integer := 0;
BEGIN
  v_qty := GREATEST(COALESCE(NEW.service_quantity, 1), 1);

  IF NEW.video_duration_breakdown_seconds IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(array_length(NEW.video_duration_breakdown_seconds, 1), 0) <> v_qty THEN
    RAISE EXCEPTION
      'A quantidade de duracoes (%) precisa bater com a quantidade de videos (%)',
      COALESCE(array_length(NEW.video_duration_breakdown_seconds, 1), 0),
      v_qty
      USING ERRCODE = '23514';
  END IF;

  FOREACH v_duration IN ARRAY NEW.video_duration_breakdown_seconds LOOP
    IF v_duration IS NULL OR v_duration < 30 OR v_duration % 30 <> 0 THEN
      RAISE EXCEPTION
        'Cada video precisa ter duracao valida em multiplos de 30 segundos'
        USING ERRCODE = '23514';
    END IF;
    v_total := v_total + v_duration;
  END LOOP;

  NEW.video_duration_seconds := NULLIF(v_total, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_sale_video_duration_breakdown ON public.sales;
CREATE TRIGGER trg_validate_sale_video_duration_breakdown
BEFORE INSERT OR UPDATE OF service_quantity, video_duration_seconds, video_duration_breakdown_seconds
ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.validate_sale_video_duration_breakdown();

CREATE OR REPLACE FUNCTION public.create_service_orders_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_col UUID;
  i INTEGER;
  customer_name TEXT;
  st_name TEXT;
  label TEXT;
  qty INTEGER;
  existing_count INT;
  card_title TEXT;
  item_duration INTEGER;
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
        AND COALESCE(array_length(NEW.video_duration_breakdown_seconds, 1), 0) >= i
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
    AND NEW.service_quantity IS NOT DISTINCT FROM OLD.service_quantity
    AND NEW.package_id IS NOT DISTINCT FROM OLD.package_id THEN
    RETURN NEW;
  END IF;

  v_qty := GREATEST(COALESCE(NEW.service_quantity, 1), 1);

  UPDATE public.service_orders so
  SET video_duration_seconds = calc.target_duration
  FROM (
    SELECT
      so_inner.id,
      CASE
        WHEN NEW.video_duration_breakdown_seconds IS NOT NULL
          AND COALESCE(array_length(NEW.video_duration_breakdown_seconds, 1), 0) >= COALESCE(so_inner.service_index, 1)
          THEN NEW.video_duration_breakdown_seconds[COALESCE(so_inner.service_index, 1)]
        WHEN v_qty = 1 THEN NEW.video_duration_seconds
        ELSE so_inner.video_duration_seconds
      END AS target_duration
    FROM public.service_orders so_inner
    WHERE so_inner.sale_id = NEW.id
  ) calc
  WHERE so.id = calc.id
    AND calc.target_duration IS DISTINCT FROM so.video_duration_seconds;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_sale_duration ON public.sales;
CREATE TRIGGER trg_sync_sale_duration
AFTER UPDATE OF video_duration_seconds, video_duration_breakdown_seconds, service_quantity, package_id
ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.sync_sale_duration_to_orders();

CREATE OR REPLACE FUNCTION public.recalculate_sale_video_duration_from_orders(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_breakdown integer[];
  v_total integer;
  v_count integer;
  v_count_with_duration integer;
BEGIN
  IF p_sale_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    array_agg(so.video_duration_seconds ORDER BY so.service_index),
    COALESCE(SUM(so.video_duration_seconds), 0),
    COUNT(*),
    COUNT(so.video_duration_seconds)
  INTO
    v_breakdown,
    v_total,
    v_count,
    v_count_with_duration
  FROM public.service_orders so
  WHERE so.sale_id = p_sale_id;

  IF v_count = 0 OR v_count_with_duration <> v_count THEN
    RETURN;
  END IF;

  UPDATE public.sales s
  SET
    video_duration_breakdown_seconds = v_breakdown,
    video_duration_seconds = NULLIF(v_total, 0)
  WHERE s.id = p_sale_id
    AND (
      v_breakdown IS DISTINCT FROM s.video_duration_breakdown_seconds
      OR NULLIF(v_total, 0) IS DISTINCT FROM s.video_duration_seconds
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_recalculate_sale_video_duration_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_sale_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_sale_video_duration_from_orders(OLD.sale_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.video_duration_seconds IS NOT DISTINCT FROM OLD.video_duration_seconds
    AND NEW.sale_id IS NOT DISTINCT FROM OLD.sale_id
    AND NEW.service_index IS NOT DISTINCT FROM OLD.service_index THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.sale_id IS DISTINCT FROM OLD.sale_id THEN
    v_old_sale_id := OLD.sale_id;
  END IF;

  PERFORM public.recalculate_sale_video_duration_from_orders(NEW.sale_id);

  IF v_old_sale_id IS NOT NULL THEN
    PERFORM public.recalculate_sale_video_duration_from_orders(v_old_sale_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_sale_video_duration_from_orders ON public.service_orders;
CREATE TRIGGER trg_recalculate_sale_video_duration_from_orders
AFTER INSERT OR UPDATE OF sale_id, service_index, video_duration_seconds OR DELETE
ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.tg_recalculate_sale_video_duration_from_orders();

CREATE OR REPLACE FUNCTION public.tg_om_eventos_from_service_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_producer uuid;
  v_service_name text;
  v_customer_name text;
  v_base_points numeric;
  v_mult numeric;
  v_card_key text;
  v_card_name text;
  v_duration int;
  v_sale_duration int;
  v_sale_breakdown int[];
  v_sale_qty int;
BEGIN
  IF NEW.delivered_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.delivered_at IS NOT NULL THEN RETURN NEW; END IF;

  v_producer := COALESCE(NEW.producer_id, (SELECT producer_id FROM public.sales WHERE id = NEW.sale_id));
  IF v_producer IS NULL THEN RETURN NEW; END IF;

  SELECT
    video_duration_seconds,
    video_duration_breakdown_seconds,
    GREATEST(COALESCE(service_quantity, 1), 1)
  INTO
    v_sale_duration,
    v_sale_breakdown,
    v_sale_qty
  FROM public.sales
  WHERE id = NEW.sale_id;

  v_duration := COALESCE(
    NEW.video_duration_seconds,
    CASE
      WHEN v_sale_breakdown IS NOT NULL
        AND COALESCE(array_length(v_sale_breakdown, 1), 0) >= COALESCE(NEW.service_index, 1)
        THEN v_sale_breakdown[COALESCE(NEW.service_index, 1)]
      WHEN COALESCE(v_sale_qty, 1) <= 1 THEN v_sale_duration
      ELSE NULL
    END
  );

  SELECT st.name, COALESCE(st.points, st.points_value, 1)
    INTO v_service_name, v_base_points
  FROM public.sales s
  LEFT JOIN public.service_types st ON st.id = s.service_type_id
  WHERE s.id = NEW.sale_id;

  SELECT c.name INTO v_customer_name
  FROM public.sales s JOIN public.customers c ON c.id = s.customer_id
  WHERE s.id = NEW.sale_id;

  SELECT multiplicador INTO v_mult FROM public.om_scoring WHERE evento = 'pronto';
  v_mult := COALESCE(v_mult, 1);

  IF v_duration IS NOT NULL AND v_duration > 0 THEN
    v_base_points := v_duration::numeric / 30.0;
  ELSE
    v_base_points := COALESCE(v_base_points, 1);
  END IF;

  v_card_name := COALESCE(NEW.title, COALESCE(v_customer_name,'') || ' • ' || COALESCE(v_service_name,'') || ' #' || NEW.service_index);
  v_card_key := 'so:' || NEW.id::text;

  INSERT INTO public.om_eventos (producer_id, evento, card_key, card_name, trello_card_id, pontos, raw)
  VALUES (
    v_producer, 'pronto'::public.om_evento, v_card_key, v_card_name, NULL,
    GREATEST(1, ROUND(v_base_points * v_mult))::int,
    jsonb_build_object('source','service_orders','service_order_id',NEW.id,'sale_id',NEW.sale_id,'duration_seconds',v_duration)
  )
  ON CONFLICT (producer_id, evento, card_key) DO NOTHING;

  RETURN NEW;
END;
$function$;

UPDATE public.service_orders so
SET video_duration_seconds = s.video_duration_seconds
FROM public.sales s
WHERE so.sale_id = s.id
  AND so.video_duration_seconds IS NULL
  AND s.video_duration_seconds IS NOT NULL
  AND GREATEST(COALESCE(s.service_quantity, 1), 1) = 1;

UPDATE public.sales s
SET video_duration_breakdown_seconds = ARRAY[s.video_duration_seconds]
WHERE GREATEST(COALESCE(s.service_quantity, 1), 1) = 1
  AND s.video_duration_seconds IS NOT NULL
  AND (
    s.video_duration_breakdown_seconds IS NULL
    OR COALESCE(array_length(s.video_duration_breakdown_seconds, 1), 0) = 0
  );

WITH sale_duration_backfill AS (
  SELECT
    so.sale_id,
    array_agg(so.video_duration_seconds ORDER BY so.service_index) AS breakdown,
    COALESCE(SUM(so.video_duration_seconds), 0) AS total_seconds,
    COUNT(*) AS order_count,
    COUNT(so.video_duration_seconds) AS order_count_with_duration
  FROM public.service_orders so
  GROUP BY so.sale_id
)
UPDATE public.sales s
SET
  video_duration_breakdown_seconds = backfill.breakdown,
  video_duration_seconds = NULLIF(backfill.total_seconds, 0)
FROM sale_duration_backfill backfill
WHERE s.id = backfill.sale_id
  AND backfill.order_count > 0
  AND backfill.order_count = backfill.order_count_with_duration
  AND (
    backfill.breakdown IS DISTINCT FROM s.video_duration_breakdown_seconds
    OR NULLIF(backfill.total_seconds, 0) IS DISTINCT FROM s.video_duration_seconds
  );
