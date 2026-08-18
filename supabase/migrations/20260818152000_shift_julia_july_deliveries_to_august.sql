-- Júlia iniciou em agosto/2026: os vídeos vinculados a ela com finalização
-- registrada em julho estão com o mês incorreto. Preserva dia e horário.
WITH corrected_orders AS (
  UPDATE public.service_orders so
  SET delivered_at = so.delivered_at + INTERVAL '1 month',
      updated_at = now()
  WHERE COALESCE(
      so.producer_id,
      (SELECT sale.producer_id FROM public.sales sale WHERE sale.id = so.sale_id)
    ) = 'b381e1e9-f556-4ae7-94c0-906ffb59c486'
    AND so.delivered_at >= TIMESTAMPTZ '2026-07-01 00:00:00-03'
    AND so.delivered_at <  TIMESTAMPTZ '2026-08-01 00:00:00-03'
  RETURNING so.id, so.delivered_at
)
UPDATE public.om_eventos event
SET occurred_at = corrected.delivered_at
FROM corrected_orders corrected
WHERE event.evento = 'pronto'::public.om_evento
  AND event.card_key = 'so:' || corrected.id::text;
