
-- customers: tighten read to ownership for vendedor/produtor
DROP POLICY IF EXISTS customers_read ON public.customers;
CREATE POLICY customers_read ON public.customers
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'financeiro')
  OR EXISTS (
    SELECT 1 FROM public.sales s
    JOIN public.sellers se ON se.id = s.seller_id
    WHERE s.customer_id = customers.id AND se.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.sales s
    JOIN public.producers p ON p.id = s.producer_id
    WHERE s.customer_id = customers.id AND p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.service_orders so
    JOIN public.sales s ON s.id = so.sale_id
    JOIN public.producers p ON p.id = so.producer_id
    WHERE s.customer_id = customers.id AND p.user_id = auth.uid()
  )
);

-- goals: restrict select
DROP POLICY IF EXISTS "Permitir leitura para usuários autenticados" ON public.goals;
CREATE POLICY goals_select ON public.goals
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (seller_id IS NOT NULL AND auth.uid() IN (SELECT user_id FROM public.sellers WHERE id = goals.seller_id))
);

-- kanban_columns: restrict select to staff
DROP POLICY IF EXISTS kanban_columns_select ON public.kanban_columns;
CREATE POLICY kanban_columns_select ON public.kanban_columns
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'vendedor')
  OR public.has_role(auth.uid(), 'produtor')
  OR public.has_role(auth.uid(), 'financeiro')
);

-- project_folders: mirror write scope
DROP POLICY IF EXISTS folders_select ON public.project_folders;
CREATE POLICY folders_select ON public.project_folders
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR created_by = auth.uid()
  OR (sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), sale_id))
  OR public.user_can_access_card(auth.uid(), sale_id, kanban_card_id)
);

-- project_folder_files: mirror insert scope
DROP POLICY IF EXISTS files_select ON public.project_folder_files;
CREATE POLICY files_select ON public.project_folder_files
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_folders f
    WHERE f.id = project_folder_files.folder_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR f.created_by = auth.uid()
        OR (f.sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), f.sale_id))
        OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
      )
  )
);

-- project_folder_messages: remove duplicate permissive policy
DROP POLICY IF EXISTS messages_select ON public.project_folder_messages;

-- sale_receipts: scope reads
DROP POLICY IF EXISTS sale_receipts_read ON public.sale_receipts;
CREATE POLICY sale_receipts_read ON public.sale_receipts
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'financeiro')
  OR (sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), sale_id))
);

-- sales: scope read + update
DROP POLICY IF EXISTS sales_read ON public.sales;
CREATE POLICY sales_read ON public.sales
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'financeiro')
  OR public.user_can_access_sale(auth.uid(), id)
);

DROP POLICY IF EXISTS sales_update ON public.sales;
CREATE POLICY sales_update ON public.sales
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'financeiro')
  OR public.user_can_access_sale(auth.uid(), id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'financeiro')
  OR public.user_can_access_sale(auth.uid(), id)
);

-- service_order_history: scope read
DROP POLICY IF EXISTS "Authenticated can read history" ON public.service_order_history;
CREATE POLICY service_order_history_read ON public.service_order_history
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.service_orders so
    LEFT JOIN public.producers p ON p.id = so.producer_id
    WHERE so.id = service_order_history.service_order_id
      AND (p.user_id = auth.uid() OR public.user_can_access_sale(auth.uid(), so.sale_id))
  )
);

-- service_orders: scope read
DROP POLICY IF EXISTS service_orders_read ON public.service_orders;
CREATE POLICY service_orders_read ON public.service_orders
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'financeiro')
  OR EXISTS (
    SELECT 1 FROM public.producers p
    WHERE p.id = service_orders.producer_id AND p.user_id = auth.uid()
  )
  OR (sale_id IS NOT NULL AND public.user_can_access_sale(auth.uid(), sale_id))
);
