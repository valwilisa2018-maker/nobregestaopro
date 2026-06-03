-- Adiciona a coluna producer_id à tabela kanban_columns
ALTER TABLE public.kanban_columns ADD COLUMN producer_id UUID REFERENCES public.producers(id);

-- Garante que o service_role tenha acesso
GRANT ALL ON public.kanban_columns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_columns TO authenticated;

-- Comentário para documentar a coluna
COMMENT ON COLUMN public.kanban_columns.producer_id IS 'O produtor ao qual esta coluna pertence. Se for NULL, a coluna é global.';
