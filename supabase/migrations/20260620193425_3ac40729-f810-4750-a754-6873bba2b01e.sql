
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
  card_title TEXT;
  label TEXT;
  qty INTEGER;
BEGIN
  SELECT id INTO default_col FROM public.kanban_columns WHERE is_default = true LIMIT 1;
  IF default_col IS NULL THEN
    SELECT id INTO default_col FROM public.kanban_columns ORDER BY sort_order LIMIT 1;
  END IF;

  SELECT name INTO customer_name FROM public.customers WHERE id = NEW.customer_id;
  SELECT name INTO st_name FROM public.service_types WHERE id = NEW.service_type_id;
  label := COALESCE(NULLIF(TRIM(st_name), ''), 'Vídeo');
  qty := GREATEST(COALESCE(NEW.service_quantity, 1), 1);

  FOR i IN 1..qty LOOP
    card_title := COALESCE(customer_name, 'Cliente') || ' • ' || label || ' ' || LPAD(i::text, 2, '0');

    INSERT INTO public.service_orders (
      sale_id, column_id, service_index, title, description, sort_order,
      producer_id, expected_delivery_date, trello_link
    )
    VALUES (
      NEW.id, default_col, i, card_title, NEW.notes, i,
      NEW.producer_id, NEW.expected_delivery_date, NEW.trello_link
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_sale_to_service_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_name TEXT;
  v_service_name TEXT;
  v_label TEXT;
BEGIN
  SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
  SELECT name INTO v_service_name FROM public.service_types WHERE id = NEW.service_type_id;
  v_label := COALESCE(NULLIF(TRIM(v_service_name), ''), 'Vídeo');

  UPDATE public.service_orders so
  SET
    title = COALESCE(v_customer_name, 'Cliente') || ' • ' || v_label || ' ' || LPAD(COALESCE(so.service_index, 1)::text, 2, '0'),
    producer_id = NEW.producer_id,
    expected_delivery_date = NEW.expected_delivery_date,
    trello_link = NEW.trello_link
  WHERE so.sale_id = NEW.id;

  RETURN NEW;
END;
$function$;

-- Normalize existing cards to the unified numbering format
UPDATE public.service_orders so
SET title = COALESCE(c.name, 'Cliente') || ' • '
            || COALESCE(NULLIF(TRIM(st.name), ''), 'Vídeo') || ' '
            || LPAD(COALESCE(so.service_index, 1)::text, 2, '0')
FROM public.sales s
LEFT JOIN public.customers c ON c.id = s.customer_id
LEFT JOIN public.service_types st ON st.id = s.service_type_id
WHERE so.sale_id = s.id;
