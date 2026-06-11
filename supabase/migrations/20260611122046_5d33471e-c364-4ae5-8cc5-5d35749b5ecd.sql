-- Remover políticas restritivas antigas
DROP POLICY IF EXISTS "goals_admin" ON public.goals;
DROP POLICY IF EXISTS "goals_read" ON public.goals;

-- Criar nova política de leitura: todos autenticados podem ver metas
CREATE POLICY "Permitir leitura para usuários autenticados" 
ON public.goals FOR SELECT 
TO authenticated 
USING (true);

-- Criar política para metas administrativas (seller_id is null)
-- Permitindo que usuários autenticados editem metas globais
CREATE POLICY "Permitir edição de metas globais por autenticados" 
ON public.goals FOR ALL 
TO authenticated 
USING (seller_id IS NULL)
WITH CHECK (seller_id IS NULL);

-- Criar política para metas de vendedores (seus próprios dados)
CREATE POLICY "Permitir que vendedores gerenciem suas próprias metas" 
ON public.goals FOR ALL 
TO authenticated 
USING (seller_id IS NOT NULL AND auth.uid() IN (SELECT user_id FROM public.sellers WHERE id = seller_id))
WITH CHECK (seller_id IS NOT NULL AND auth.uid() IN (SELECT user_id FROM public.sellers WHERE id = seller_id));

-- Garantir privilégios
GRANT ALL ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;