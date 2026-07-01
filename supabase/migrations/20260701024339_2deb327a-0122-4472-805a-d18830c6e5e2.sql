
CREATE OR REPLACE FUNCTION public.get_sinal_totals(_from date, _to date)
RETURNS TABLE(dia date, sinal numeric, total_vendido numeric, vendas_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.sale_date AS dia,
         COALESCE(SUM(s.paid_amount), 0)::numeric AS sinal,
         COALESCE(SUM(s.total_amount), 0)::numeric AS total_vendido,
         COUNT(*)::int AS vendas_count
  FROM public.sales s
  WHERE s.sale_date BETWEEN _from AND _to
  GROUP BY s.sale_date
  ORDER BY s.sale_date;
$$;

GRANT EXECUTE ON FUNCTION public.get_sinal_totals(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sinal_totals(date, date) TO service_role;

CREATE OR REPLACE VIEW public.v_daily_financials AS
SELECT
  s.sale_date AS dia,
  COUNT(*)::int AS vendas,
  COALESCE(SUM(s.total_amount), 0)::numeric AS total_vendido,
  COALESCE(SUM(s.paid_amount), 0)::numeric AS sinal,
  GREATEST(COALESCE(SUM(s.total_amount - s.paid_amount), 0), 0)::numeric AS saldo_em_aberto
FROM public.sales s
GROUP BY s.sale_date;

GRANT SELECT ON public.v_daily_financials TO authenticated;
GRANT SELECT ON public.v_daily_financials TO service_role;
