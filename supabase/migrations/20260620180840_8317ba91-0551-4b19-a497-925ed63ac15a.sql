-- Use trello_card_id como chave de idempotência para eventos vindos do Trello.
-- Eventos gerados por service_orders (trigger) continuam usando card_key = 'so:<uuid>'.
UPDATE public.om_eventos
SET card_key = trello_card_id
WHERE trello_card_id IS NOT NULL
  AND card_key IS DISTINCT FROM trello_card_id
  AND card_key NOT LIKE 'so:%';