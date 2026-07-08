CREATE OR REPLACE FUNCTION public.sync_customer_name_to_service_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.service_orders so
    SET title = COALESCE(NEW.name, 'Cliente') || ' • ' ||
                COALESCE(NULLIF(TRIM(st.name), ''), 'Vídeo') || ' ' ||
                LPAD(COALESCE(so.service_index, 1)::text, 2, '0')
    FROM public.sales s
    LEFT JOIN public.service_types st ON st.id = s.service_type_id
    WHERE so.sale_id = s.id
      AND s.customer_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_customer_name_to_orders ON public.customers;
CREATE TRIGGER tr_sync_customer_name_to_orders
AFTER UPDATE OF name ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_name_to_service_orders();