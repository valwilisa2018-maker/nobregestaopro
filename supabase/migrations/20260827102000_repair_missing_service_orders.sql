-- Reinstala o gatilho responsável por transformar vendas padrão em cards do
-- Kanban e recupera vendas que ficaram sem todos os cards esperados.
--
-- A correção usa (sale_id, service_index), que já possui restrição UNIQUE, e
-- por isso é idempotente: pode ser reaplicada sem duplicar ordens de serviço.

DROP TRIGGER IF EXISTS on_sale_created_create_orders ON public.sales;
CREATE TRIGGER on_sale_created_create_orders
  AFTER INSERT ON public.sales
  FOR EACH ROW
  WHEN (NEW.sale_kind = 'standard')
  EXECUTE FUNCTION public.create_service_orders_for_sale();

DO $$
DECLARE
  v_default_column_id uuid;
BEGIN
  SELECT id
    INTO v_default_column_id
  FROM public.kanban_columns
  WHERE is_default = true
  ORDER BY sort_order, created_at
  LIMIT 1;

  IF v_default_column_id IS NULL THEN
    SELECT id
      INTO v_default_column_id
    FROM public.kanban_columns
    ORDER BY sort_order, created_at
    LIMIT 1;
  END IF;

  IF v_default_column_id IS NULL THEN
    RAISE EXCEPTION 'Não existe coluna no Kanban para recuperar as ordens de serviço';
  END IF;

  INSERT INTO public.service_orders (
    sale_id,
    column_id,
    service_index,
    title,
    description,
    sort_order,
    producer_id,
    expected_delivery_date,
    trello_link,
    video_duration_seconds
  )
  SELECT
    s.id,
    v_default_column_id,
    missing.service_index,
    COALESCE(c.name, 'Cliente') || ' • ' ||
      COALESCE(NULLIF(TRIM(st.name), ''), 'Vídeo'),
    s.notes,
    missing.service_index,
    s.producer_id,
    s.expected_delivery_date,
    s.trello_link,
    CASE
      WHEN s.video_duration_breakdown_seconds IS NOT NULL
        AND array_length(s.video_duration_breakdown_seconds, 1) >= missing.service_index
        THEN s.video_duration_breakdown_seconds[missing.service_index]
      WHEN GREATEST(COALESCE(s.service_quantity, 1), 1) = 1
        THEN s.video_duration_seconds
      ELSE NULL
    END
  FROM public.sales s
  JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.service_types st ON st.id = s.service_type_id
  CROSS JOIN LATERAL generate_series(
    1,
    GREATEST(COALESCE(s.service_quantity, 1), 1)
  ) AS missing(service_index)
  WHERE COALESCE(s.sale_kind, 'standard') = 'standard'
    AND NOT EXISTS (
      SELECT 1
      FROM public.service_orders so
      WHERE so.sale_id = s.id
        AND so.service_index = missing.service_index
    )
  ON CONFLICT (sale_id, service_index) DO NOTHING;
END;
$$;

COMMENT ON TRIGGER on_sale_created_create_orders ON public.sales IS
  'Cria automaticamente os cards do Kanban para cada venda padrão.';
