
CREATE OR REPLACE FUNCTION public.enforce_single_invoice_for_package()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_package BOOLEAN;
  existing_count INTEGER;
  pkg_total NUMERIC;
BEGIN
  IF NEW.sale_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (package_id IS NOT NULL), COALESCE(total_amount, 0)
    INTO is_package, pkg_total
  FROM public.sales WHERE id = NEW.sale_id;

  IF NOT COALESCE(is_package, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO existing_count
  FROM public.invoices
  WHERE sale_id = NEW.sale_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF existing_count >= 1 THEN
    RAISE EXCEPTION 'Vendas de pacote permitem apenas 1 nota fiscal por venda.';
  END IF;

  -- Força o valor total do pacote
  NEW.amount := pkg_total;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_single_invoice_for_package ON public.invoices;
CREATE TRIGGER trg_enforce_single_invoice_for_package
BEFORE INSERT OR UPDATE OF sale_id, amount ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_invoice_for_package();
