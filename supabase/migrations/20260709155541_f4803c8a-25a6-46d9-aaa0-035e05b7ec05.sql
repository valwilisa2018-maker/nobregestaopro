
-- Add duration field to sales and service_orders
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS video_duration_seconds integer;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS video_duration_seconds integer;

-- Propagate from sale to service_orders on create
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
BEGIN
  SELECT id INTO default_col FROM public.kanban_columns WHERE is_default = true LIMIT 1;
  IF default_col IS NULL THEN
    SELECT id INTO default_col FROM public.kanban_columns ORDER BY sort_order LIMIT 1;
  END IF;

  SELECT name INTO customer_name FROM public.customers WHERE id = NEW.customer_id;
  SELECT name INTO st_name FROM public.service_types WHERE id = NEW.service_type_id;
  label := COALESCE(NULLIF(TRIM(st_name), ''), 'Vídeo');
  qty := GREATEST(COALESCE(NEW.service_quantity, 1), 1);

  SELECT COUNT(*) INTO existing_count
  FROM public.service_orders so
  WHERE so.customer_id = NEW.customer_id
    AND so.service_type_id IS NOT DISTINCT FROM NEW.service_type_id;

  FOR i IN 1..qty LOOP
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
      NEW.customer_id, NEW.service_type_id, existing_count + i, NEW.video_duration_seconds
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Sync duration changes from sale to its service_orders
CREATE OR REPLACE FUNCTION public.sync_sale_duration_to_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.video_duration_seconds IS DISTINCT FROM OLD.video_duration_seconds THEN
    UPDATE public.service_orders
    SET video_duration_seconds = NEW.video_duration_seconds
    WHERE sale_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_sale_duration ON public.sales;
CREATE TRIGGER trg_sync_sale_duration
AFTER UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sync_sale_duration_to_orders();

-- Update om_eventos scoring trigger: pontos = ceil(duracao/30) * multiplicador (fallback to service_type points)
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
BEGIN
  IF NEW.delivered_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.delivered_at IS NOT NULL THEN RETURN NEW; END IF;

  v_producer := COALESCE(NEW.producer_id, (SELECT producer_id FROM public.sales WHERE id = NEW.sale_id));
  IF v_producer IS NULL THEN RETURN NEW; END IF;

  v_duration := COALESCE(NEW.video_duration_seconds, (SELECT video_duration_seconds FROM public.sales WHERE id = NEW.sale_id));

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

  -- Duration-based scoring: each 30 seconds = 1 video (point)
  IF v_duration IS NOT NULL AND v_duration > 0 THEN
    v_base_points := CEIL(v_duration::numeric / 30.0);
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
