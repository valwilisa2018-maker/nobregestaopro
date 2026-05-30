CREATE OR REPLACE FUNCTION public.create_invoices_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i INTEGER;
  unit_amount NUMERIC;
  qty INTEGER;
BEGIN
  qty := GREATEST(COALESCE(NEW.service_quantity, 1), 1);
  unit_amount := COALESCE(NEW.total_amount, 0) / qty;
  FOR i IN 1..qty LOOP
    INSERT INTO public.invoices (sale_id, customer_id, amount, status, notes)
    VALUES (NEW.id, NEW.customer_id, unit_amount, 'a_fazer', NEW.notes);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_invoices_for_sale ON public.sales;
CREATE TRIGGER trg_create_invoices_for_sale
AFTER INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.create_invoices_for_sale();