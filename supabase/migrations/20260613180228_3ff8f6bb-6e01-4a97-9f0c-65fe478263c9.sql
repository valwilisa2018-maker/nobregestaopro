-- Pontos base por tipo de serviço
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 1;

-- Converter om_scoring de pontos absolutos para multiplicador
ALTER TABLE public.om_scoring
  ADD COLUMN IF NOT EXISTS multiplicador NUMERIC(5,2) NOT NULL DEFAULT 1.00;

-- Seed padrão dos multiplicadores
UPDATE public.om_scoring SET multiplicador = 1.00 WHERE evento = 'pronto';
UPDATE public.om_scoring SET multiplicador = 0.50 WHERE evento = 'alteracao';
UPDATE public.om_scoring SET multiplicador = 0.00 WHERE evento = 'entregue';
UPDATE public.om_scoring SET multiplicador = 1.00 WHERE evento = 'distribuicao_edicao';

-- Coluna pontos antiga não é mais usada para cálculo (mantida para histórico)
ALTER TABLE public.om_scoring ALTER COLUMN pontos DROP NOT NULL;