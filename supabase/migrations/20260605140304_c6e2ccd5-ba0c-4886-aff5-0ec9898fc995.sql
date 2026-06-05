-- Drop existing restrictive policies
DROP POLICY IF EXISTS "invoices_read" ON public.invoices;
DROP POLICY IF EXISTS "invoices_write" ON public.invoices;

-- Create new policies allowing all authenticated users
CREATE POLICY "invoices_read_all" ON public.invoices
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "invoices_write_all" ON public.invoices
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Ensure RLS is still enabled (just in case)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Grant permissions (just in case)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;