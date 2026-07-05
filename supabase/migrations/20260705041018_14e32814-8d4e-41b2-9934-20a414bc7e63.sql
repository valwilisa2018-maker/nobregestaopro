
-- Admin policies for credits management
CREATE POLICY "packages_admin_all" ON public.credit_packages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_config TO authenticated;
GRANT ALL ON public.internal_config TO service_role;
CREATE POLICY "cfg_admin_all" ON public.internal_config FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "orders_admin_select" ON public.credit_orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "tx_admin_select" ON public.credit_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
