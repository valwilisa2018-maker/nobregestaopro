ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;