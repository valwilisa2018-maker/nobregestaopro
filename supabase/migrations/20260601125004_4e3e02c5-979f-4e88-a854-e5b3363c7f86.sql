CREATE OR REPLACE FUNCTION public.admin_reset_platform()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_invoices int := 0;
  c_service_orders int := 0;
  c_sale_receipts int := 0;
  c_cash int := 0;
  c_expenses int := 0;
  c_sales int := 0;
  c_packages int := 0;
  c_customers int := 0;
  c_sellers int := 0;
  c_producers int := 0;
  uid uuid := auth.uid();
  uemail text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Usuário precisa estar autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  DELETE FROM public.invoices       WHERE true; GET DIAGNOSTICS c_invoices = ROW_COUNT;
  DELETE FROM public.service_orders WHERE true; GET DIAGNOSTICS c_service_orders = ROW_COUNT;
  DELETE FROM public.sale_receipts  WHERE true; GET DIAGNOSTICS c_sale_receipts = ROW_COUNT;
  DELETE FROM public.cash_movements WHERE true; GET DIAGNOSTICS c_cash = ROW_COUNT;
  DELETE FROM public.expenses       WHERE true; GET DIAGNOSTICS c_expenses = ROW_COUNT;
  DELETE FROM public.sales          WHERE true; GET DIAGNOSTICS c_sales = ROW_COUNT;
  DELETE FROM public.packages       WHERE true; GET DIAGNOSTICS c_packages = ROW_COUNT;
  DELETE FROM public.customers      WHERE true; GET DIAGNOSTICS c_customers = ROW_COUNT;
  DELETE FROM public.sellers        WHERE true; GET DIAGNOSTICS c_sellers = ROW_COUNT;
  DELETE FROM public.producers      WHERE true; GET DIAGNOSTICS c_producers = ROW_COUNT;

  INSERT INTO public.audit_logs (action, performed_by, performed_by_email, details)
  VALUES (
    'platform_reset', uid, uemail,
    jsonb_build_object(
      'invoices', c_invoices,
      'service_orders', c_service_orders,
      'sale_receipts', c_sale_receipts,
      'cash_movements', c_cash,
      'expenses', c_expenses,
      'sales', c_sales,
      'packages', c_packages,
      'customers', c_customers,
      'sellers', c_sellers,
      'producers', c_producers
    )
  );

  RETURN jsonb_build_object(
    'invoices', c_invoices,
    'service_orders', c_service_orders,
    'sale_receipts', c_sale_receipts,
    'cash_movements', c_cash,
    'expenses', c_expenses,
    'sales', c_sales,
    'packages', c_packages,
    'customers', c_customers,
    'sellers', c_sellers,
    'producers', c_producers
  );
END;
$function$;