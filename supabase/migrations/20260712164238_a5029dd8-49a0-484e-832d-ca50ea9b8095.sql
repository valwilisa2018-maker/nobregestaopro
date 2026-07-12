ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS sales_deleted_at_idx ON public.sales (user_id, deleted_at);