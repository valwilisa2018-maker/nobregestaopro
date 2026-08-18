-- A minutagem de produção pertence a cada card do Kanban.
-- Alterar a duração da venda não deve sobrescrever cards já criados, pois uma
-- venda pode possuir vários vídeos com durações diferentes.
DROP TRIGGER IF EXISTS trg_sync_sale_duration ON public.sales;
DROP FUNCTION IF EXISTS public.sync_sale_duration_to_orders();
