DROP POLICY IF EXISTS sales_read ON public.sales;
DROP POLICY IF EXISTS sales_update ON public.sales;

CREATE POLICY sales_read ON public.sales
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'vendedor'::app_role)
  OR has_role(auth.uid(), 'produtor'::app_role)
  OR user_can_access_sale(auth.uid(), id)
);

CREATE POLICY sales_update ON public.sales
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'vendedor'::app_role)
  OR has_role(auth.uid(), 'produtor'::app_role)
  OR user_can_access_sale(auth.uid(), id)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'vendedor'::app_role)
  OR has_role(auth.uid(), 'produtor'::app_role)
  OR user_can_access_sale(auth.uid(), id)
);