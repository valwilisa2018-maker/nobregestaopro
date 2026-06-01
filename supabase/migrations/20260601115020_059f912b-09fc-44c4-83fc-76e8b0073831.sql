
-- profiles: own row + admin sees all
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::app_role));

-- customers: restrict to users with an app role
DROP POLICY IF EXISTS customers_read ON public.customers;
CREATE POLICY customers_read ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'vendedor'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'produtor'::app_role)
  );

-- sellers: same restriction
DROP POLICY IF EXISTS sellers_read_all_auth ON public.sellers;
CREATE POLICY sellers_read ON public.sellers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'vendedor'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'produtor'::app_role)
  );

-- producers: same restriction
DROP POLICY IF EXISTS producers_read_all_auth ON public.producers;
CREATE POLICY producers_read ON public.producers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'vendedor'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'produtor'::app_role)
  );

-- cash_movements: only admin/financeiro can read
DROP POLICY IF EXISTS cash_movements_read ON public.cash_movements;
CREATE POLICY cash_movements_read ON public.cash_movements
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
  );

-- expenses: only admin/financeiro can read
DROP POLICY IF EXISTS expenses_read ON public.expenses;
CREATE POLICY expenses_read ON public.expenses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
  );
