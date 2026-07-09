-- 1) Ao registrar um redo (voltar de coluna "done"), apagar o evento "pronto" anterior
--    para permitir nova pontuação quando o card for entregue novamente.
CREATE OR REPLACE FUNCTION public.tg_service_orders_track_redo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  old_done BOOLEAN := false;
  new_done BOOLEAN := false;
BEGIN
  IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    SELECT COALESCE(is_done,false) INTO old_done FROM public.kanban_columns WHERE id = OLD.column_id;
    SELECT COALESCE(is_done,false) INTO new_done FROM public.kanban_columns WHERE id = NEW.column_id;
    IF old_done = true AND new_done = false THEN
      NEW.redo_count := COALESCE(OLD.redo_count,0) + 1;
      NEW.last_redo_at := now();
      NEW.delivered_at := NULL;
      DELETE FROM public.om_eventos
       WHERE evento = 'pronto'::public.om_evento
         AND card_key = 'so:' || NEW.id::text;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Recontabilizar cards entregues hoje que não têm evento "pronto" hoje
DO $$
DECLARE r record; v_duration int; v_base numeric; v_mult numeric;
        v_service_name text; v_customer_name text; v_card_name text;
BEGIN
  SELECT multiplicador INTO v_mult FROM public.om_scoring WHERE evento = 'pronto';
  v_mult := COALESCE(v_mult, 1);

  FOR r IN
    SELECT so.id, so.title, so.producer_id, so.sale_id, so.video_duration_seconds
    FROM public.service_orders so
    JOIN public.kanban_columns kc ON kc.id = so.column_id
    WHERE kc.is_done = true
      AND so.delivered_at::date = CURRENT_DATE
      AND so.producer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.om_eventos e
        WHERE e.card_key = 'so:' || so.id::text
          AND e.evento = 'pronto'
          AND e.created_at::date = CURRENT_DATE
      )
  LOOP
    v_duration := COALESCE(r.video_duration_seconds,
                    (SELECT video_duration_seconds FROM public.sales WHERE id = r.sale_id));
    SELECT st.name, COALESCE(st.points, st.points_value, 1)
      INTO v_service_name, v_base
    FROM public.sales s LEFT JOIN public.service_types st ON st.id = s.service_type_id
    WHERE s.id = r.sale_id;
    SELECT c.name INTO v_customer_name
    FROM public.sales s JOIN public.customers c ON c.id = s.customer_id WHERE s.id = r.sale_id;

    IF v_duration IS NOT NULL AND v_duration > 0 THEN
      v_base := CEIL(v_duration::numeric / 30.0);
    ELSE
      v_base := COALESCE(v_base, 1);
    END IF;

    v_card_name := COALESCE(r.title, COALESCE(v_customer_name,'') || ' • ' || COALESCE(v_service_name,''));

    -- Remove evento antigo (de outro dia) e insere um novo com occurred_at = hoje
    DELETE FROM public.om_eventos
     WHERE evento = 'pronto'::public.om_evento
       AND card_key = 'so:' || r.id::text;

    INSERT INTO public.om_eventos (producer_id, evento, card_key, card_name, trello_card_id, pontos, raw)
    VALUES (r.producer_id, 'pronto'::public.om_evento, 'so:' || r.id::text, v_card_name, NULL,
            GREATEST(1, ROUND(v_base * v_mult))::int,
            jsonb_build_object('source','service_orders','service_order_id',r.id,'sale_id',r.sale_id,'duration_seconds',v_duration,'backfill',true));
  END LOOP;
END $$;