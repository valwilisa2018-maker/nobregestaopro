
CREATE OR REPLACE FUNCTION public.tg_om_eventos_from_service_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_producer uuid;
  v_service_name text;
  v_customer_name text;
  v_base_points numeric;
  v_mult numeric;
  v_card_key text;
  v_card_name text;
BEGIN
  IF NEW.delivered_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.delivered_at IS NOT NULL THEN RETURN NEW; END IF;

  v_producer := COALESCE(NEW.producer_id, (SELECT producer_id FROM public.sales WHERE id = NEW.sale_id));
  IF v_producer IS NULL THEN RETURN NEW; END IF;

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
  v_base_points := COALESCE(v_base_points, 1);

  v_card_name := COALESCE(NEW.title, COALESCE(v_customer_name,'') || ' • ' || COALESCE(v_service_name,'') || ' #' || NEW.service_index);
  v_card_key := 'so:' || NEW.id::text;

  INSERT INTO public.om_eventos (producer_id, evento, card_key, card_name, trello_card_id, pontos, raw)
  VALUES (
    v_producer, 'pronto'::public.om_evento, v_card_key, v_card_name, NULL,
    GREATEST(1, ROUND(v_base_points * v_mult))::int,
    jsonb_build_object('source','service_orders','service_order_id',NEW.id,'sale_id',NEW.sale_id)
  )
  ON CONFLICT (producer_id, evento, card_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_orders_om_eventos ON public.service_orders;
CREATE TRIGGER service_orders_om_eventos
AFTER INSERT OR UPDATE OF delivered_at ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_om_eventos_from_service_order();

INSERT INTO public.om_eventos (producer_id, evento, card_key, card_name, pontos, raw, occurred_at)
SELECT
  COALESCE(so.producer_id, s.producer_id),
  'pronto'::public.om_evento,
  'so:' || so.id::text,
  COALESCE(so.title, COALESCE(c.name,'') || ' • ' || COALESCE(st.name,'')),
  GREATEST(1, ROUND(COALESCE(st.points, st.points_value, 1) * COALESCE((SELECT multiplicador FROM public.om_scoring WHERE evento='pronto'), 1)))::int,
  jsonb_build_object('source','backfill','service_order_id',so.id,'sale_id',so.sale_id),
  so.delivered_at
FROM public.service_orders so
LEFT JOIN public.sales s ON s.id = so.sale_id
LEFT JOIN public.service_types st ON st.id = s.service_type_id
LEFT JOIN public.customers c ON c.id = s.customer_id
WHERE so.delivered_at IS NOT NULL
  AND COALESCE(so.producer_id, s.producer_id) IS NOT NULL
ON CONFLICT (producer_id, evento, card_key) DO NOTHING;
