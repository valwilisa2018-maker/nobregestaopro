ALTER TABLE public.sale_receipts REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_receipts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;