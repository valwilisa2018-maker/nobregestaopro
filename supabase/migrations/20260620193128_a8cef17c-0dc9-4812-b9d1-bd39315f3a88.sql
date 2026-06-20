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
  is_pkg BOOLEAN;
  card_title TEXT;
  label TEXT;
BEGIN
  SELECT id INTO default_col FROM public.kanban_columns WHERE is_default = true LIMIT 1;
  IF default_col IS NULL THEN
    SELECT id INTO default_col FROM public.kanban_columns ORDER BY sort_order LIMIT 1;
  END IF;

  SELECT name INTO customer_name FROM public.customers WHERE id = NEW.customer_id;
  SELECT name INTO st_name FROM public.service_types WHERE id = NEW.service_type_id;
  is_pkg := NEW.package_id IS NOT NULL;
  label := COALESCE(NULLIF(TRIM(st_name), ''), 'Vídeo');

  FOR i IN 1..GREATEST(NEW.service_quantity, 1) LOOP
    IF is_pkg THEN
      card_title := COALESCE(customer_name, 'Cliente') || ' • ' || label || ' ' || LPAD(i::text, 2, '0');
    ELSE
      card_title := COALESCE(customer_name, 'Cliente') || ' • ' || label || ' #' || i;
    END IF;

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
  v_is_pkg BOOLEAN;
  v_label TEXT;
BEGIN
  SELECT name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
  SELECT name INTO v_service_name FROM public.service_types WHERE id = NEW.service_type_id;
  v_is_pkg := NEW.package_id IS NOT NULL;
  v_label := COALESCE(NULLIF(TRIM(v_service_name), ''), 'Vídeo');

  UPDATE public.service_orders so
  SET
    title = CASE
      WHEN v_is_pkg THEN
        COALESCE(v_customer_name, 'Cliente') || ' • ' || v_label || ' ' || LPAD(COALESCE(so.service_index, 1)::text, 2, '0')
      ELSE
        COALESCE(v_customer_name, 'Cliente') || ' • ' || v_label || ' #' || COALESCE(so.service_index, 1)
    END,
    producer_id = NEW.producer_id,
    expected_delivery_date = NEW.expected_delivery_date,
    trello_link = NEW.trello_link
  WHERE so.sale_id = NEW.id;

  RETURN NEW;
END;
$function$;