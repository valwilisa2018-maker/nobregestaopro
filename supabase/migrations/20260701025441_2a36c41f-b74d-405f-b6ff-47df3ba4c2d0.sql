
-- Ampliar acesso a Notas Fiscais para todos os usuários autenticados
DROP POLICY IF EXISTS invoices_select ON public.invoices;
DROP POLICY IF EXISTS invoices_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_update ON public.invoices;

CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY invoices_insert ON public.invoices
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Permitir que qualquer usuário autenticado registre recebimentos (gerar pagamento)
DROP POLICY IF EXISTS sale_receipts_write ON public.sale_receipts;
CREATE POLICY sale_receipts_write ON public.sale_receipts
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
