INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "invoices_read_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invoices');
CREATE POLICY "invoices_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoices');
CREATE POLICY "invoices_update_auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'invoices');
CREATE POLICY "invoices_delete_auth" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'invoices');