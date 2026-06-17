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
BEGIN
  SELECT id INTO default_col FROM public.kanban_columns WHERE is_default = true LIMIT 1;
  IF default_col IS NULL THEN
    SELECT id INTO default_col FROM public.kanban_columns ORDER BY sort_order LIMIT 1;
  END IF;

  SELECT name INTO customer_name FROM public.customers WHERE id = NEW.customer_id;
  SELECT name INTO st_name FROM public.service_types WHERE id = NEW.service_type_id;

  FOR i IN 1..GREATEST(NEW.service_quantity, 1) LOOP
    INSERT INTO public.service_orders (
      sale_id,
      column_id,
      service_index,
      title,
      description,
      sort_order,
      producer_id,
      expected_delivery_date,
      trello_link
    )
    VALUES (
      NEW.id,
      default_col,
      i,
      COALESCE(customer_name, 'Cliente') || ' • ' || COALESCE(st_name, 'Serviço') || ' #' || i,
      NEW.notes,
      i,
      NEW.producer_id,
      NEW.expected_delivery_date,
      NEW.trello_link
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

UPDATE public.service_orders so
SET producer_id = s.producer_id
FROM public.sales s
WHERE so.sale_id = s.id
  AND so.producer_id IS NULL
  AND s.producer_id IS NOT NULL;