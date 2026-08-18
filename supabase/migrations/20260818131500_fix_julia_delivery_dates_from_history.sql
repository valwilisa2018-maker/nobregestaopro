-- Corrige datas de finalização da produtora Júlia a partir do histórico real
-- de movimentações. Só considera uma conclusão quando o card saiu de uma
-- coluna não concluída e entrou em uma coluna concluída.
WITH julia_deliveries AS (
  SELECT
    so.id AS service_order_id,
    last_delivery.created_at AS delivered_at
  FROM public.service_orders so
  LEFT JOIN public.sales sale ON sale.id = so.sale_id
  JOIN public.kanban_columns current_column
    ON current_column.id = so.column_id
   AND current_column.is_done = true
  CROSS JOIN LATERAL (
    SELECT h.created_at
    FROM public.service_order_history h
    JOIN public.kanban_columns from_column
      ON from_column.id = h.from_column_id
     AND from_column.is_done = false
    JOIN public.kanban_columns to_column
      ON to_column.id = h.to_column_id
     AND to_column.is_done = true
    WHERE h.service_order_id = so.id
    ORDER BY h.created_at DESC
    LIMIT 1
  ) last_delivery
  WHERE COALESCE(so.producer_id, sale.producer_id) = 'b381e1e9-f556-4ae7-94c0-906ffb59c486'
), corrected_orders AS (
  UPDATE public.service_orders so
  SET delivered_at = jd.delivered_at,
      updated_at = now()
  FROM julia_deliveries jd
  WHERE so.id = jd.service_order_id
    AND so.delivered_at IS DISTINCT FROM jd.delivered_at
  RETURNING so.id, so.delivered_at
)
UPDATE public.om_eventos event
SET occurred_at = corrected.delivered_at
FROM corrected_orders corrected
WHERE event.evento = 'pronto'::public.om_evento
  AND event.card_key = 'so:' || corrected.id::text;
