CREATE OR REPLACE FUNCTION public.normalize_service_order_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id uuid;
  v_service_type_id uuid;
  v_customer_name text;
  v_service_name text;
  v_next_seq int;
BEGIN
  IF NEW.sale_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.customer_id,
         s.service_type_id,
         c.name,
         COALESCE(NULLIF(TRIM(st.name), ''), 'Vídeo')
    INTO v_customer_id, v_service_type_id, v_customer_name, v_service_name
  FROM public.sales s
  LEFT JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.service_types st ON st.id = s.service_type_id
  WHERE s.id = NEW.sale_id;

  NEW.customer_id := v_customer_id;
  NEW.service_type_id := v_service_type_id;

  IF NEW.customer_id IS NOT NULL AND NEW.customer_seq IS NULL THEN
    SELECT COALESCE(MAX(so.customer_seq), 0) + 1
      INTO v_next_seq
    FROM public.service_orders so
    WHERE so.customer_id = NEW.customer_id
      AND so.service_type_id IS NOT DISTINCT FROM NEW.service_type_id
      AND so.id IS DISTINCT FROM NEW.id;

    NEW.customer_seq := COALESCE(v_next_seq, 1);
  END IF;

  IF NEW.customer_id IS NOT NULL AND NEW.customer_seq IS NOT NULL THEN
    NEW.title := COALESCE(v_customer_name, 'Cliente') || ' • ' || COALESCE(v_service_name, 'Vídeo') || ' ' || LPAD(NEW.customer_seq::text, 2, '0');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_normalize_service_order_identity ON public.service_orders;
CREATE TRIGGER tr_normalize_service_order_identity
BEFORE INSERT OR UPDATE OF sale_id, title, customer_id, service_type_id, customer_seq
ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.normalize_service_order_identity();

DROP INDEX IF EXISTS public.service_orders_customer_service_seq_uidx;
CREATE UNIQUE INDEX service_orders_customer_service_seq_uidx
ON public.service_orders (
  customer_id,
  COALESCE(service_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
  customer_seq
)
WHERE customer_id IS NOT NULL AND customer_seq IS NOT NULL;