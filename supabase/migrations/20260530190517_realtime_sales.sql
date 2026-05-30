ALTER TABLE public.sales REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
