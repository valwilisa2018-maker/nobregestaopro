
-- 1) Denormalized columns for the safety-net unique constraint
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS service_type_id uuid,
  ADD COLUMN IF NOT EXISTS customer_seq int;

-- 2) Backfill customer_id / service_type_id from sales
UPDATE public.service_orders so
SET customer_id = s.customer_id,
    service_type_id = s.service_type_id
FROM public.sales s
WHERE so.sale_id = s.id
  AND (so.customer_id IS DISTINCT FROM s.customer_id
       OR so.service_type_id IS DISTINCT FROM s.service_type_id);

-- 3) Recompute customer_seq globally per (customer_id, service_type_id)
WITH ranked AS (
  SELECT so.id,
         ROW_NUMBER() OVER (
           PARTITION BY so.customer_id, so.service_type_id
           ORDER BY s.created_at, so.service_index, so.created_at, so.id
         ) AS rn
  FROM public.service_orders so
  JOIN public.sales s ON s.id = so.sale_id
)
UPDATE public.service_orders so
SET customer_seq = r.rn
FROM ranked r
WHERE so.id = r.id;

-- 4) Safety-net unique index: same customer + service_type + sequence can never repeat
CREATE UNIQUE INDEX IF NOT EXISTS service_orders_customer_service_seq_uidx
  ON public.service_orders (customer_id, service_type_id, customer_seq)
  WHERE customer_id IS NOT NULL AND customer_seq IS NOT NULL;

-- 5) Renumber helper now also updates customer_seq / customer_id / service_type_id
CREATE OR REPLACE FUNCTION public.renumber_service_orders_for_customer(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Keep denormalized columns in sync first
  UPDATE public.service_orders so
  SET customer_id = s.customer_id,
      service_type_id = s.service_type_id
  FROM public.sales s
  WHERE so.sale_id = s.id
    AND s.customer_id = _customer_id;

  -- Two-phase renumber to avoid unique conflicts during renumber
  WITH ranked AS (
    SELECT so.id,
           ROW_NUMBER() OVER (
             PARTITION BY so.customer_id, so.service_type_id
             ORDER BY s.created_at, so.service_index, so.created_at, so.id
           ) AS rn
    FROM public.service_orders so
    JOIN public.sales s ON s.id = so.sale_id
    WHERE s.customer_id = _customer_id
  )
  UPDATE public.service_orders so
  SET customer_seq = -r.rn  -- negative temp to avoid clash
  FROM ranked r
  WHERE so.id = r.id;

  UPDATE public.service_orders so
  SET customer_seq = -so.customer_seq,
      title = COALESCE(c.name, 'Cliente') || ' • ' ||
              COALESCE(NULLIF(TRIM(st.name), ''), 'Vídeo') || ' ' ||
              LPAD((-so.customer_seq)::text, 2, '0')
  FROM public.sales s
  LEFT JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.service_types st ON st.id = s.service_type_id
  WHERE so.sale_id = s.id
    AND s.customer_id = _customer_id
    AND so.customer_seq < 0;
END;
$$;

-- 6) Update create-trigger to populate the new columns
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
      customer_id, service_type_id, customer_seq
    )
    VALUES (
      NEW.id, default_col, i, card_title, NEW.notes, i,
      NEW.producer_id, NEW.expected_delivery_date, NEW.trello_link,
      NEW.customer_id, NEW.service_type_id, existing_count + i
    );
  END LOOP;
  RETURN NEW;
END;
$$;
