
-- 1) Backfill service_orders.video_duration_seconds from parent sale when missing
UPDATE public.service_orders so
SET video_duration_seconds = s.video_duration_seconds
FROM public.sales s
WHERE so.sale_id = s.id
  AND so.video_duration_seconds IS NULL
  AND s.video_duration_seconds IS NOT NULL;

-- 2) Fix scoring trigger to ALWAYS re-read sale duration as fallback (belt & suspenders)
--    and ensure it runs on UPDATE of delivered_at even when card was created without duration
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
BEGIN
  IF NEW.delivered_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.delivered_at IS NOT NULL THEN RETURN NEW; END IF;

  v_producer := COALESCE(NEW.producer_id, (SELECT producer_id FROM public.sales WHERE id = NEW.sale_id));
  IF v_producer IS NULL THEN RETURN NEW; END IF;

  SELECT video_duration_seconds INTO v_sale_duration FROM public.sales WHERE id = NEW.sale_id;
  v_duration := COALESCE(NEW.video_duration_seconds, v_sale_duration);

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

-- 3) Re-score all cards delivered today with correct duration from sales
DO $$
DECLARE
  r record;
  v_duration int;
  v_points int;
  v_base numeric;
  v_mult numeric;
BEGIN
  SELECT COALESCE(multiplicador,1) INTO v_mult FROM public.om_scoring WHERE evento = 'pronto';
  v_mult := COALESCE(v_mult, 1);

  FOR r IN
    SELECT so.id, so.title, so.producer_id, so.sale_id,
           COALESCE(so.video_duration_seconds, s.video_duration_seconds) AS dur,
           COALESCE(st.points, st.points_value, 1) AS base_pts
    FROM public.service_orders so
    LEFT JOIN public.sales s ON s.id = so.sale_id
    LEFT JOIN public.service_types st ON st.id = s.service_type_id
    WHERE so.delivered_at::date = CURRENT_DATE
      AND so.producer_id IS NOT NULL
  LOOP
    v_duration := r.dur;
    IF v_duration IS NOT NULL AND v_duration > 0 THEN
      v_base := CEIL(v_duration::numeric / 30.0);
    ELSE
      v_base := COALESCE(r.base_pts, 1);
    END IF;
    v_points := GREATEST(1, ROUND(v_base * v_mult))::int;

    DELETE FROM public.om_eventos
    WHERE evento = 'pronto'::public.om_evento
      AND card_key = 'so:' || r.id::text;

    INSERT INTO public.om_eventos (producer_id, evento, card_key, card_name, trello_card_id, pontos, raw)
    VALUES (
      r.producer_id, 'pronto'::public.om_evento, 'so:' || r.id::text, r.title, NULL,
      v_points,
      jsonb_build_object('source','service_orders','service_order_id',r.id,'sale_id',r.sale_id,'duration_seconds',v_duration,'recalc',true)
    );
  END LOOP;
END $$;
