-- Políticas para pagarme_webhooks
ALTER TABLE public.pagarme_webhooks ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.pagarme_webhooks TO authenticated;
CREATE POLICY "Users can view webhook history" ON public.pagarme_webhooks FOR SELECT TO authenticated USING (true);

-- Ajuste em system_announcements para restringir gestão a admins
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.system_announcements;
CREATE POLICY "Admins can manage announcements" ON public.system_announcements FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Ajuste em system_logs para restringir inserção e leitura
DROP POLICY IF EXISTS "Users can insert logs" ON public.system_logs;
CREATE POLICY "Users can insert logs" ON public.system_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can view all logs" ON public.system_logs;
CREATE POLICY "Admins can view all logs" ON public.system_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
