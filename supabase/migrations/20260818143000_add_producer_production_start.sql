-- Impede que entregas anteriores ao início de uma produtora sejam atribuídas
-- retroativamente a ela na Operação de Meta.
ALTER TABLE public.producers
ADD COLUMN IF NOT EXISTS production_started_at date;

UPDATE public.producers
SET production_started_at = DATE '2026-08-01',
    updated_at = now()
WHERE id = 'b381e1e9-f556-4ae7-94c0-906ffb59c486';

