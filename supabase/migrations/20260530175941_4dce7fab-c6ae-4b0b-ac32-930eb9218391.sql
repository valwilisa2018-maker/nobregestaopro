
CREATE OR REPLACE FUNCTION public.create_invoices_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  i INTEGER;
  unit_amount NUMERIC;
  qty INTEGER;
BEGIN
  -- Se for pacote, gera UMA única nota com o valor total
  IF NEW.package_id IS NOT NULL THEN
    INSERT INTO public.invoices (sale_id, customer_id, amount, status, notes)
    VALUES (NEW.id, NEW.customer_id, COALESCE(NEW.total_amount, 0), 'a_fazer', NEW.notes);
    RETURN NEW;
  END IF;

  -- Caso contrário, uma nota por serviço (proporcional)
  qty := GREATEST(COALESCE(NEW.service_quantity, 1), 1);
  unit_amount := COALESCE(NEW.total_amount, 0) / qty;
  FOR i IN 1..qty LOOP
    INSERT INTO public.invoices (sale_id, customer_id, amount, status, notes)
    VALUES (NEW.id, NEW.customer_id, unit_amount, 'a_fazer', NEW.notes);
  END LOOP;
  RETURN NEW;
END;
$function$;
