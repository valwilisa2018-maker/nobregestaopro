
-- Helper: compute global title for a given service_order using per-customer+service_type numbering
CREATE OR REPLACE FUNCTION public.compute_service_order_title(_service_order_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
  v_label text;
  v_idx int;
BEGIN
  SELECT c.name,
         COALESCE(NULLIF(TRIM(st.name), ''), 'Vídeo')
    INTO v_customer_name, v_label
  FROM public.service_orders so
  JOIN public.sales s ON s.id = so.sale_id
  LEFT JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.service_types st ON st.id = s.service_type_id
  WHERE so.id = _service_order_id;

  SELECT rn INTO v_idx FROM (
    SELECT so.id,
           ROW_NUMBER() OVER (
             PARTITION BY s.customer_id, s.service_type_id
             ORDER BY s.created_at, so.service_index, so.created_at, so.id
           ) AS rn
    FROM public.service_orders so
    JOIN public.sales s ON s.id = so.sale_id
    WHERE s.customer_id = (SELECT customer_id FROM public.sales WHERE id = (SELECT sale_id FROM public.service_orders WHERE id = _service_order_id))
      AND s.service_type_id IS NOT DISTINCT FROM (SELECT service_type_id FROM public.sales WHERE id = (SELECT sale_id FROM public.service_orders WHERE id = _service_order_id))
  ) t WHERE t.id = _service_order_id;

  RETURN COALESCE(v_customer_name, 'Cliente') || ' • ' || v_label || ' ' || LPAD(COALESCE(v_idx, 1)::text, 2, '0');
END;
$$;

-- Renumber all cards for a given customer (all service_types) using global per-customer+service_type numbering
CREATE OR REPLACE FUNCTION public.renumber_service_orders_for_customer(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ranked AS (
    SELECT so.id,
           c.name AS customer_name,
           COALESCE(NULLIF(TRIM(st.name), ''), 'Vídeo') AS label,
           ROW_NUMBER() OVER (
             PARTITION BY s.customer_id, s.service_type_id
             ORDER BY s.created_at, so.service_index, so.created_at, so.id
           ) AS rn
    FROM public.service_orders so
    JOIN public.sales s ON s.id = so.sale_id
    LEFT JOIN public.customers c ON c.id = s.customer_id
    LEFT JOIN public.service_types st ON st.id = s.service_type_id
    WHERE s.customer_id = _customer_id
  )
  UPDATE public.service_orders so
  SET title = COALESCE(r.customer_name, 'Cliente') || ' • ' || r.label || ' ' || LPAD(r.rn::text, 2, '0')
  FROM ranked r
  WHERE so.id = r.id;
END;
$$;

-- Rewrite create trigger to use per-customer+service_type global numbering
CREATE OR REPLACE FUNCTION public.create_service_orders_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Count existing cards for same customer + service_type (across other sales)
  SELECT COUNT(*) INTO existing_count
  FROM public.service_orders so
  JOIN public.sales s ON s.id = so.sale_id
  WHERE s.customer_id = NEW.customer_id
    AND s.service_type_id IS NOT DISTINCT FROM NEW.service_type_id
    AND s.id <> NEW.id;

  FOR i IN 1..qty LOOP
    card_title := COALESCE(customer_name, 'Cliente') || ' • ' || label || ' ' ||
                  LPAD((existing_count + i)::text, 2, '0');
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
$$;

-- Rewrite customer-name sync to use global renumbering for that customer
CREATE OR REPLACE FUNCTION public.sync_customer_name_to_service_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.renumber_service_orders_for_customer(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Rewrite sale-sync to use global title, and renumber the customer to keep sequence tight
CREATE OR REPLACE FUNCTION public.sync_sale_to_service_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.service_orders so
  SET
    producer_id = NEW.producer_id,
    expected_delivery_date = NEW.expected_delivery_date,
    trello_link = NEW.trello_link
  WHERE so.sale_id = NEW.id;

  PERFORM public.renumber_service_orders_for_customer(NEW.customer_id);
  IF OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.renumber_service_orders_for_customer(OLD.customer_id);
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: renumber every customer's cards using the new global rule
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT s.customer_id
           FROM public.sales s
           JOIN public.service_orders so ON so.sale_id = s.id
           WHERE s.customer_id IS NOT NULL
  LOOP
    PERFORM public.renumber_service_orders_for_customer(r.customer_id);
  END LOOP;
END $$;
