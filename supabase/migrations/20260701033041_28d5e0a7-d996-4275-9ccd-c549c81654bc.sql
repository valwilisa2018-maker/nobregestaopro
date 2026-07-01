DROP POLICY IF EXISTS sales_delete_admin ON public.sales;
CREATE POLICY sales_delete_staff ON public.sales
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'vendedor'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
);