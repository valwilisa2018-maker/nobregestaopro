ALTER TABLE public.producers ADD COLUMN IF NOT EXISTS custom_kanban_columns JSONB DEFAULT NULL;
COMMENT ON COLUMN public.producers.custom_kanban_columns IS 'Customized Kanban column names for this specific producer';
