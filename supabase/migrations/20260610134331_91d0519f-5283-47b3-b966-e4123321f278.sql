ALTER TABLE public.sales ADD COLUMN is_payment_link BOOLEAN DEFAULT FALSE;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;