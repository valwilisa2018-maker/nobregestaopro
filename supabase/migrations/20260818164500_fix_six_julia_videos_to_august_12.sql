-- Corrige os seis vídeos confirmados como produzidos pela Júlia em 12/08/2026.
WITH corrected_orders AS (
  UPDATE public.service_orders so
  SET delivered_at = (
        DATE '2026-08-12'
        + (so.delivered_at AT TIME ZONE 'America/Sao_Paulo')::time
      ) AT TIME ZONE 'America/Sao_Paulo',
      updated_at = now()
  WHERE COALESCE(
      so.producer_id,
      (SELECT sale.producer_id FROM public.sales sale WHERE sale.id = so.sale_id)
    ) = 'b381e1e9-f556-4ae7-94c0-906ffb59c486'
    AND so.title IN (
      'Denis • Video mascote 01',
      'Valdemir • Video mascote 01',
      'Marcia • Video mascote 01',
      'Deivi • Video mascote 01',
      'Deivi • Video mascote 02',
      'Deivi • Video mascote 03'
    )
  RETURNING so.id, so.delivered_at
)
UPDATE public.om_eventos event
SET occurred_at = corrected.delivered_at
FROM corrected_orders corrected
WHERE event.evento = 'pronto'::public.om_evento
  AND event.card_key = 'so:' || corrected.id::text;
