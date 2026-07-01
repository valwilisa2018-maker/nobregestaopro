
CREATE OR REPLACE VIEW public.v_daily_financials AS
SELECT
  (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  COUNT(*)::int AS vendas,
  COALESCE(SUM(s.total_amount), 0)::numeric AS total_vendido,
  COALESCE(SUM(s.paid_amount), 0)::numeric AS sinal,
  GREATEST(COALESCE(SUM(s.total_amount - s.paid_amount), 0), 0)::numeric AS saldo_em_aberto
FROM public.sales s
GROUP BY (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date;

GRANT SELECT ON public.v_daily_financials TO authenticated;
GRANT SELECT ON public.v_daily_financials TO service_role;

CREATE OR REPLACE FUNCTION public.get_sinal_totals(_from date, _to date)
RETURNS TABLE(dia date, sinal numeric, total_vendido numeric, vendas_count int)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
         COALESCE(SUM(s.paid_amount), 0)::numeric AS sinal,
         COALESCE(SUM(s.total_amount), 0)::numeric AS total_vendido,
         COUNT(*)::int AS vendas_count
  FROM public.sales s
  WHERE (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _from AND _to
  GROUP BY (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY 1;
$$;
