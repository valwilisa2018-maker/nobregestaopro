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
  uid uuid := auth.uid();
  uemail text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Usuário precisa estar autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  DELETE FROM public.invoices;           GET DIAGNOSTICS c_invoices = ROW_COUNT;
  DELETE FROM public.service_orders;     GET DIAGNOSTICS c_service_orders = ROW_COUNT;
  DELETE FROM public.sale_receipts;      GET DIAGNOSTICS c_sale_receipts = ROW_COUNT;
  DELETE FROM public.cash_movements;     GET DIAGNOSTICS c_cash = ROW_COUNT;
  DELETE FROM public.expenses;           GET DIAGNOSTICS c_expenses = ROW_COUNT;
  DELETE FROM public.sales;              GET DIAGNOSTICS c_sales = ROW_COUNT;
  DELETE FROM public.packages;           GET DIAGNOSTICS c_packages = ROW_COUNT;
  DELETE FROM public.customers;          GET DIAGNOSTICS c_customers = ROW_COUNT;

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
      'customers', c_customers
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
    'customers', c_customers
  );
END;
$function$;