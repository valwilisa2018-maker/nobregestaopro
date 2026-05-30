
-- 1) Coluna denormalizada para o índice parcial conseguir avaliar a regra
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS from_package BOOLEAN NOT NULL DEFAULT false;

-- 2) Trigger que preenche from_package automaticamente a partir da venda
CREATE OR REPLACE FUNCTION public.set_invoice_from_package()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_pkg BOOLEAN := false;
  pkg_total NUMERIC;
BEGIN
  IF NEW.sale_id IS NOT NULL THEN
    SELECT (package_id IS NOT NULL), COALESCE(total_amount, 0)
      INTO is_pkg, pkg_total
    FROM public.sales WHERE id = NEW.sale_id;

    NEW.from_package := COALESCE(is_pkg, false);
    IF is_pkg THEN
      NEW.amount := pkg_total;
    END IF;
  ELSE
    NEW.from_package := false;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_invoice_from_package ON public.invoices;
CREATE TRIGGER trg_set_invoice_from_package
BEFORE INSERT OR UPDATE OF sale_id ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_invoice_from_package();

-- 3) Backfill da coluna nas notas existentes
UPDATE public.invoices i
SET from_package = true
FROM public.sales s
WHERE i.sale_id = s.id AND s.package_id IS NOT NULL AND i.from_package = false;

-- 4) Garante no banco que só pode haver 1 nota por venda quando for pacote
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_per_package_sale
  ON public.invoices (sale_id)
  WHERE from_package = true;

-- 5) Reforça também na função de bloqueio (mensagem amigável antes do índice estourar)
CREATE OR REPLACE FUNCTION public.enforce_single_invoice_for_package()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing_count INTEGER;
BEGIN
  IF NEW.sale_id IS NULL OR NOT COALESCE(NEW.from_package, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO existing_count
  FROM public.invoices
  WHERE sale_id = NEW.sale_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF existing_count >= 1 THEN
    RAISE EXCEPTION 'Vendas de pacote permitem apenas 1 nota fiscal por venda.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
